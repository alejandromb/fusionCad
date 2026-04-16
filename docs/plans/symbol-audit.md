# Symbol Audit Script

**Status:** Planning · **Owner:** fusionLogik · **Last updated:** 2026-04-15

## Problem

Our `builtin-symbols.json` has ~95 symbols tuned over many sessions, with inconsistent conventions leaking in:

- Text labels that overlap with lines or pin dots (reported by user — "looks horrible")
- Pin coordinates that don't match the visual drawing (the 3P middle-pin bug we just fixed — pin data at x=10, visual at x=12.5)
- Asymmetric pin spacing that visually reads wrong (outer pins at 5 and 20 with middle at 10 instead of 12.5)
- Mixed formatting in the JSON (compact inline vs indented multi-line)
- Likely other inconsistencies nobody has spotted yet

A manual review of 95 symbols isn't practical. We need a **read-only static analyzer** that surfaces problems so they can be tuned in the Symbol Editor.

## Prior art / context

- `packages/core-model/src/symbols/builtin-symbols.json` — source-of-truth, ~95 symbols
- Each symbol has: `id`, `name`, `category`, `width`, `height`, `pins[]`, `primitives[]`
- Primitives include: `line`, `rect`, `circle`, `text`, `polyline`, `path`
- Text primitives: `{ x, y, content, fontSize, textAnchor, fontWeight? }` — fontSize is in mm, textAnchor is 'start'/'middle'/'end'
- Pins are metadata (click/wire targets). Primitives are the visual drawing. **They are two separate things that need to agree.** The 3P center-pin bug happened because primitives were already correct at x=12.5 while pin data still said x=10.
- Renderer uses `MM_TO_PX = 4` (all geometry is in mm)
- Session 30 migrated everything to mm from pixels

## Goals

1. **Surface issues without changing anything.** This script is diagnostic only.
2. **Prioritize by severity** so user knows which symbols most need tuning.
3. **Be conservative** — false negatives (missing real issues) are acceptable; false positives (flagging correct symbols) are NOT. Every finding should be actionable.
4. **Be stable** — running it twice returns the same output; deterministic ordering.

## Non-goals

- **No auto-fix.** The script never writes to the JSON. All remediation is manual via Symbol Editor. This is the #1 safety rail.
- **No format normalization.** Don't touch compact-vs-indented JSON.
- **No new conventions enforced.** If a symbol breaks a rule we'd like to enforce (e.g., "all 3P devices must have pins at 5/12.5/20"), that's a SEPARATE proposal — not an audit finding. The audit only flags things that are unambiguously wrong.

## Safety rails — what it MUST NOT flag

These patterns look suspicious but are actually correct — the audit must tolerate them:

- **Text with non-zero fontSize inside a rect** — labels sitting inside the device body (normal for terminals, motors with "M" inside circle, etc.)
- **Pins on the edge** (x=0 or x=width or y=0 or y=height) — normal, pins terminate at the symbol boundary
- **Lines that START at a pin and EXTEND into the body** — normal wire stubs
- **Asymmetric pin placements where the middle pin isn't centered** — some symbols intentionally do this (e.g., relay coils with lead offsets). Only flag if ALL of: (a) the symbol has exactly 3 pins on one edge, (b) the outer two are symmetric about the symbol center, (c) the middle is NOT at the geometric midpoint. Even then, only WARN — don't ERROR.
- **Text extending slightly past the symbol bounding box** — common for tag prefixes that go above the symbol.

## Findings to detect (ordered by severity)

### ERROR (unambiguous bugs)

1. **Pin data vs primitive mismatch** — for each pin, check if there's a line or rect visually "at" the pin coord. If the nearest visual element is > 1mm away, flag. (Catches the 3P middle-pin class of bug.)
2. **Duplicate pin IDs within a symbol** — would break wire references.
3. **Pin coords outside the symbol bounding box** (> 0.1mm out of bounds in either axis) — pins must be ON or INSIDE the bbox.
4. **Non-finite numbers** anywhere (NaN, Infinity) in primitive or pin coords.

### WARN (likely bugs, review carefully)

5. **Text bbox overlap with lines** — compute text bbox (approximation: `width ≈ content.length * fontSize * 0.55`, `height ≈ fontSize`) and check overlap with any line segment. Overlap = text is illegible at that position.
6. **Text bbox overlap with pin dots** — pin dots render at (pin.x, pin.y) with radius ~0.5mm. If text bbox overlaps a pin dot, it's probably a misaligned label.
7. **Text bbox overlap with another text bbox** — two labels on top of each other.
8. **Middle-pin-not-centered** (as described in Safety rails above — 3 pins on one edge, outer symmetric, middle offset). WARN only.
9. **Pin direction inconsistent with position** — a pin with `direction: 'top'` should be at y=0 (or near it). Same for bottom/left/right.

### INFO (curiosities)

10. **Symbol with no category, no tagPrefix, or no standard**
11. **Symbol width or height not a multiple of 2.5mm** (the module size from IEC 60617 — soft convention, just informational)
12. **Text fontSize < 1.5mm or > 8mm** — unusual, worth a look
13. **More than 20 primitives** — may be a candidate for simplification

## Approach

A Node.js script at `scripts/audit-symbols.ts` (TypeScript, run via `tsx`):

```ts
// scripts/audit-symbols.ts
import symbolsJson from '../packages/core-model/src/symbols/builtin-symbols.json';

interface Finding {
  severity: 'error' | 'warn' | 'info';
  symbolId: string;
  rule: string;
  message: string;
  location?: { x: number; y: number };
}

function auditSymbol(sym: Symbol): Finding[] { /* ... */ }

function main() {
  const all: Finding[] = symbolsJson.symbols.flatMap(auditSymbol);
  // Sort by severity, then by symbolId, then by rule
  // Print grouped by symbol, with counts at the top
}
```

Output format (human-readable, no ANSI colors to stay grep-friendly):

```
Symbol audit — 95 symbols · 12 findings (3 errors, 6 warns, 3 info)

ERRORS
  iec-contactor-3p
    [pin-primitive-mismatch] pin L2 at (10, 0) but nearest visual at (12.5, 0) — 2.5mm gap
    [pin-primitive-mismatch] pin T2 at (10, 25) but nearest visual at (12.5, 25) — 2.5mm gap

WARNS
  iec-motor-3ph
    [text-line-overlap] text "M" at (12.5, 13.5) overlaps line (5,5→12.5,7.5) at bbox corner
  ...

INFO
  ...
```

### Text bbox heuristic

Monospace text at fontSize F (mm): character width ≈ 0.55F, line height ≈ F with baseline offset depending on `textBaseline` (default 'alphabetic'). For `textAnchor: 'middle'`: bbox left = x - (content.length * 0.55F)/2, top = y - 0.75F, right = x + (content.length * 0.55F)/2, bottom = y + 0.25F. Tune coefficients if we see false positives.

### Line-text overlap test

For each text's bbox (axis-aligned rectangle) and each line segment, use the standard segment-vs-AABB intersection. Do NOT flag if the line has an endpoint ON the bbox edge with some tolerance (a deliberate underline or connector).

## Test plan

1. **Golden test:** run against current `builtin-symbols.json` (already tuned by the 3P fix). Manually review every finding. Any flag on a symbol that the user considers already-correct is a false positive — tune the heuristic or add an exception.
2. **Known-bug test:** temporarily revert the iec-contactor-3p L2 pin back to x=10 (the bug we just fixed). Run audit. Expect a pin-primitive-mismatch error on iec-contactor-3p. Then revert the revert.
3. **Stable output:** run audit twice. Output must be byte-identical.

## Rollout

Single commit:
- `scripts/audit-symbols.ts` (script)
- `package.json` workspace script: `"audit:symbols": "tsx scripts/audit-symbols.ts"`
- Add to CLAUDE.md BEFORE COMMITTING section as an optional check
- A short `docs/plans/done/symbol-audit.md` snapshot of this plan at the time of merge (so we can see how it evolved)

No production code change. No symbol data change. Run-only tool.

## Follow-ups (not in scope for v1)

- CI integration (run on PR, fail if any new ERRORS)
- `--fix` mode that applies obvious fixes (pin data → nearest primitive x). NOT in v1 because of the Safety rails — auto-fix is the highest-risk operation possible on symbol data.
- Expand heuristics: cross-symbol convention checks (all 3P devices should share a width?), primitive simplification suggestions.
- Promote selected findings to unit tests so they regress-detect.

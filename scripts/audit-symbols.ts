/**
 * Symbol Audit — static analyzer for packages/core-model/src/symbols/builtin-symbols.json
 *
 * READ-ONLY. Surfaces geometry issues that correlate with real rendering bugs
 * (the "3P middle-pin mismatch" class of problem) without changing anything.
 * Every finding is meant to be actionable by a human editor in the Symbol
 * Editor. See docs/plans/symbol-audit.md for the design rationale + the exact
 * rules catalog this script implements.
 *
 * Run:   npx tsx scripts/audit-symbols.ts
 * Exit:  0 if no ERROR-level findings, 1 otherwise.
 *
 * Design: no auto-fix. Conservative — we'd rather miss a real issue than
 * flag a correct symbol.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types (minimal — we only read the JSON) ────────────────────

interface Pin {
  id: string;
  name?: string;
  x: number;
  y: number;
  direction?: 'top' | 'bottom' | 'left' | 'right';
  pinType?: string;
}

interface PrimitiveLine { type: 'line'; x1: number; y1: number; x2: number; y2: number; strokeWidth?: number }
interface PrimitiveRect { type: 'rect'; x: number; y: number; width: number; height: number; fill?: string }
interface PrimitiveCircle { type: 'circle'; cx: number; cy: number; r: number; fill?: string }
interface PrimitiveArc { type: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number }
interface PrimitivePolyline { type: 'polyline'; points: Array<{ x: number; y: number }>; closed?: boolean; fill?: string }
interface PrimitiveText {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
  textAnchor?: 'start' | 'middle' | 'end';
  fontWeight?: string;
}
type Primitive = PrimitiveLine | PrimitiveRect | PrimitiveCircle | PrimitiveArc | PrimitivePolyline | PrimitiveText;

interface Symbol {
  id: string;
  name: string;
  category?: string;
  standard?: string;
  width: number;
  height: number;
  pins: Pin[];
  primitives: Primitive[];
  tagPrefix?: string;
}

interface Finding {
  severity: 'error' | 'warn' | 'info';
  symbolId: string;
  rule: string;
  message: string;
  location?: { x: number; y: number };
}

// ─── Tolerances (kept in one place so tuning is easy) ──────────

/** Max distance from a pin to the nearest primitive endpoint/corner before flagging. */
const PIN_MISMATCH_TOLERANCE = 1.0; // mm
/** Pins may sit slightly past the bounding box without being a bug. */
const BBOX_TOLERANCE = 0.1; // mm
/** A direction hint is considered OK if the pin is within this distance of the expected edge. */
const DIRECTION_EDGE_TOLERANCE = 0.5; // mm
/** Grid module from IEC 60617 for INFO-level dimension warnings. */
const IEC_MODULE = 2.5; // mm
/** FontSize thresholds for INFO finding. */
const FONTSIZE_MIN = 1.5;
const FONTSIZE_MAX = 8.0;

// ─── Geometry helpers ──────────────────────────────────────────

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Endpoints + corners of a primitive — the set of points a pin might "land on". */
function primitiveAnchors(p: Primitive): Array<{ x: number; y: number }> {
  switch (p.type) {
    case 'line': return [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
    case 'rect': return [
      { x: p.x, y: p.y }, { x: p.x + p.width, y: p.y },
      { x: p.x, y: p.y + p.height }, { x: p.x + p.width, y: p.y + p.height },
    ];
    case 'circle': return [
      { x: p.cx, y: p.cy - p.r }, { x: p.cx + p.r, y: p.cy },
      { x: p.cx, y: p.cy + p.r }, { x: p.cx - p.r, y: p.cy },
    ];
    case 'polyline': return p.points.slice();
    case 'arc': return [
      { x: p.cx + p.r * Math.cos(p.startAngle), y: p.cy + p.r * Math.sin(p.startAngle) },
      { x: p.cx + p.r * Math.cos(p.endAngle),   y: p.cy + p.r * Math.sin(p.endAngle)   },
    ];
    case 'text': return []; // text labels are never the visual target for a pin
  }
}

/** Minimum distance from a point to a line segment. */
function pointSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

/** Axis-aligned bbox for a text primitive, using a monospace heuristic. */
function textBbox(t: PrimitiveText): { x0: number; y0: number; x1: number; y1: number } {
  const charW = t.fontSize * 0.55;
  const w = t.content.length * charW;
  const h = t.fontSize;
  let x0 = t.x;
  if (t.textAnchor === 'middle') x0 = t.x - w / 2;
  else if (t.textAnchor === 'end') x0 = t.x - w;
  // Default textBaseline is 'alphabetic' — visible glyph sits above the y line.
  // Rough: ~75% of the font height above, 25% below the descender.
  const y0 = t.y - h * 0.75;
  const y1 = t.y + h * 0.25;
  return { x0, y0, x1: x0 + w, y1 };
}

/** Does a line segment (x1,y1)→(x2,y2) intersect axis-aligned box (x0,y0,xe,ye)? */
function segIntersectsAABB(
  x1: number, y1: number, x2: number, y2: number,
  bx0: number, by0: number, bx1: number, by1: number,
): boolean {
  // Trivial accept: either endpoint inside the box.
  const inside = (px: number, py: number) =>
    px >= bx0 && px <= bx1 && py >= by0 && py <= by1;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  // Liang-Barsky clipping.
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - bx0, bx1 - x1, y1 - by0, by1 - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; else if (t > t0) t0 = t; }
      else           { if (t < t0) return false; else if (t < t1) t1 = t; }
    }
  }
  return true;
}

function bboxOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// ─── Audit rules ───────────────────────────────────────────────

function findings(sym: Symbol): Finding[] {
  const out: Finding[] = [];
  const add = (
    severity: Finding['severity'],
    rule: string,
    message: string,
    location?: Finding['location'],
  ) => out.push({ severity, symbolId: sym.id, rule, message, ...(location ? { location } : {}) });

  const primitives = sym.primitives || [];
  const pins = sym.pins || [];

  // Collect every finite anchor point from visible (non-text) primitives.
  const anchors = primitives
    .filter(p => p.type !== 'text')
    .flatMap(p => primitiveAnchors(p))
    .filter(a => isFiniteNumber(a.x) && isFiniteNumber(a.y));

  // --- ERROR rules ---

  // 1. Non-finite numbers anywhere.
  for (const p of primitives) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        add('error', 'non-finite', `primitive field ${JSON.stringify(k)} is ${v} on ${p.type}`);
      }
    }
  }
  for (const pin of pins) {
    if (!isFiniteNumber(pin.x) || !isFiniteNumber(pin.y)) {
      add('error', 'non-finite', `pin "${pin.id}" has non-finite coord (x=${pin.x}, y=${pin.y})`);
    }
  }

  // 2. Duplicate pin IDs.
  const seenPins = new Map<string, number>();
  for (const pin of pins) {
    seenPins.set(pin.id, (seenPins.get(pin.id) || 0) + 1);
  }
  for (const [id, count] of seenPins) {
    if (count > 1) add('error', 'duplicate-pin-id', `pin id "${id}" appears ${count} times`);
  }

  // 3. Pins outside the bounding box.
  for (const pin of pins) {
    const outOfX = pin.x < -BBOX_TOLERANCE || pin.x > sym.width + BBOX_TOLERANCE;
    const outOfY = pin.y < -BBOX_TOLERANCE || pin.y > sym.height + BBOX_TOLERANCE;
    if (outOfX || outOfY) {
      add(
        'error',
        'pin-out-of-bounds',
        `pin "${pin.id}" at (${pin.x}, ${pin.y}) outside bbox ${sym.width}×${sym.height}`,
        { x: pin.x, y: pin.y },
      );
    }
  }

  // 4. Pin-vs-primitive mismatch.
  for (const pin of pins) {
    if (!isFiniteNumber(pin.x) || !isFiniteNumber(pin.y)) continue;
    let nearest = Infinity;
    for (const a of anchors) {
      const d = dist(pin.x, pin.y, a.x, a.y);
      if (d < nearest) nearest = d;
    }
    // Also allow "pin sits ON a line segment (not just at endpoints)" — this
    // handles lines that cross through a pin position.
    for (const p of primitives) {
      if (p.type === 'line') {
        const d = pointSegDist(pin.x, pin.y, p.x1, p.y1, p.x2, p.y2);
        if (d < nearest) nearest = d;
      }
    }
    if (nearest > PIN_MISMATCH_TOLERANCE) {
      add(
        'error',
        'pin-primitive-mismatch',
        `pin "${pin.id}" at (${pin.x}, ${pin.y}) has no visual element within ${PIN_MISMATCH_TOLERANCE}mm (nearest ${nearest.toFixed(2)}mm)`,
        { x: pin.x, y: pin.y },
      );
    }
  }

  // --- WARN rules ---

  // 5-7. Text bbox overlaps.
  const texts = primitives.filter((p): p is PrimitiveText => p.type === 'text');
  const lines = primitives.filter((p): p is PrimitiveLine => p.type === 'line');
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!isFiniteNumber(t.x) || !isFiniteNumber(t.y) || !isFiniteNumber(t.fontSize)) continue;
    const bb = textBbox(t);
    // 5. Text vs line — overlap flags illegible labels.
    for (const l of lines) {
      // A line whose endpoint sits on the bbox edge (underline / connector) is OK.
      const endpointsOnEdge =
        (l.x1 >= bb.x0 - 0.1 && l.x1 <= bb.x1 + 0.1 && Math.abs(l.y1 - bb.y1) < 0.2) ||
        (l.x2 >= bb.x0 - 0.1 && l.x2 <= bb.x1 + 0.1 && Math.abs(l.y2 - bb.y1) < 0.2);
      if (endpointsOnEdge) continue;
      if (segIntersectsAABB(l.x1, l.y1, l.x2, l.y2, bb.x0, bb.y0, bb.x1, bb.y1)) {
        add(
          'warn',
          'text-line-overlap',
          `text ${JSON.stringify(t.content)} at (${t.x}, ${t.y}) overlaps line (${l.x1},${l.y1}→${l.x2},${l.y2})`,
          { x: t.x, y: t.y },
        );
        break; // one finding per text is enough
      }
    }
    // 6. Text vs pin dot (pins render as ~0.5mm radius dots).
    for (const pin of pins) {
      const pinBb = { x0: pin.x - 0.5, y0: pin.y - 0.5, x1: pin.x + 0.5, y1: pin.y + 0.5 };
      if (bboxOverlap(bb, pinBb)) {
        add(
          'warn',
          'text-pin-overlap',
          `text ${JSON.stringify(t.content)} at (${t.x}, ${t.y}) overlaps pin "${pin.id}"`,
          { x: t.x, y: t.y },
        );
        break;
      }
    }
    // 7. Text vs another text.
    for (let j = i + 1; j < texts.length; j++) {
      const other = texts[j];
      if (!isFiniteNumber(other.x) || !isFiniteNumber(other.y) || !isFiniteNumber(other.fontSize)) continue;
      const bb2 = textBbox(other);
      if (bboxOverlap(bb, bb2)) {
        add(
          'warn',
          'text-text-overlap',
          `text ${JSON.stringify(t.content)} overlaps text ${JSON.stringify(other.content)} near (${t.x}, ${t.y})`,
          { x: t.x, y: t.y },
        );
        break;
      }
    }
  }

  // 8. Middle-pin-not-centered (3-pin row, outer symmetric, middle offset).
  const byDir: Record<string, Pin[]> = { top: [], bottom: [], left: [], right: [] };
  for (const pin of pins) if (pin.direction && byDir[pin.direction]) byDir[pin.direction].push(pin);
  for (const dir of Object.keys(byDir)) {
    const group = byDir[dir];
    if (group.length !== 3) continue;
    const axis = dir === 'top' || dir === 'bottom' ? 'x' : 'y';
    const sorted = [...group].sort((a, b) => a[axis] - b[axis]);
    const outerMid = (sorted[0][axis] + sorted[2][axis]) / 2;
    // Require outer pins symmetric about the symbol center to flag.
    const symbolCenter = axis === 'x' ? sym.width / 2 : sym.height / 2;
    const outerSymmetric = Math.abs(outerMid - symbolCenter) < 0.1;
    const middleOff = Math.abs(sorted[1][axis] - outerMid) > 0.1;
    if (outerSymmetric && middleOff) {
      add(
        'warn',
        'middle-pin-not-centered',
        `${dir}-row: outer pins symmetric at ${axis}=${sorted[0][axis]}/${sorted[2][axis]} (midpoint ${outerMid}) but middle pin "${sorted[1].id}" at ${axis}=${sorted[1][axis]}`,
        { x: sorted[1].x, y: sorted[1].y },
      );
    }
  }

  // 9. Pin direction inconsistent with position.
  for (const pin of pins) {
    if (!pin.direction) continue;
    const expected: Record<string, number> = { top: 0, bottom: sym.height, left: 0, right: sym.width };
    const axis: 'x' | 'y' = pin.direction === 'top' || pin.direction === 'bottom' ? 'y' : 'x';
    const offset = Math.abs(pin[axis] - expected[pin.direction]);
    if (offset > DIRECTION_EDGE_TOLERANCE) {
      add(
        'warn',
        'direction-position-mismatch',
        `pin "${pin.id}" direction="${pin.direction}" but ${axis}=${pin[axis]} (expected ~${expected[pin.direction]})`,
        { x: pin.x, y: pin.y },
      );
    }
  }

  // --- INFO rules ---

  // 10. Missing metadata.
  if (!sym.category) add('info', 'no-category', `missing category`);
  if (!sym.tagPrefix) add('info', 'no-tag-prefix', `missing tagPrefix`);
  if (!sym.standard) add('info', 'no-standard', `missing standard`);

  // 11. Dimensions not multiples of the IEC module (2.5mm).
  if (sym.width % IEC_MODULE !== 0) {
    add('info', 'non-grid-width', `width=${sym.width} not a multiple of ${IEC_MODULE}mm`);
  }
  if (sym.height % IEC_MODULE !== 0) {
    add('info', 'non-grid-height', `height=${sym.height} not a multiple of ${IEC_MODULE}mm`);
  }

  // 12. FontSize outliers.
  for (const t of texts) {
    if (!isFiniteNumber(t.fontSize)) continue;
    if (t.fontSize < FONTSIZE_MIN) {
      add('info', 'fontsize-small', `text ${JSON.stringify(t.content)} fontSize=${t.fontSize} < ${FONTSIZE_MIN}`);
    } else if (t.fontSize > FONTSIZE_MAX) {
      add('info', 'fontsize-large', `text ${JSON.stringify(t.content)} fontSize=${t.fontSize} > ${FONTSIZE_MAX}`);
    }
  }

  // 13. Many primitives (simplification candidate).
  if (primitives.length > 20) {
    add('info', 'primitive-count', `${primitives.length} primitives — consider simplification`);
  }

  return out;
}

// ─── Main ───────────────────────────────────────────────────────

function main(): void {
  const jsonPath = path.resolve(__dirname, '../packages/core-model/src/symbols/builtin-symbols.json');
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const doc: { symbols: Symbol[] } = JSON.parse(raw);
  const symbols = doc.symbols;

  const all = symbols.flatMap(findings);

  // Deterministic ordering: severity (error, warn, info), then symbolId, then rule.
  const sevRank = { error: 0, warn: 1, info: 2 } as const;
  all.sort((a, b) =>
    sevRank[a.severity] - sevRank[b.severity] ||
    a.symbolId.localeCompare(b.symbolId) ||
    a.rule.localeCompare(b.rule),
  );

  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of all) counts[f.severity]++;

  // Print.
  console.log(
    `Symbol audit — ${symbols.length} symbols · ${all.length} findings ` +
    `(${counts.error} errors, ${counts.warn} warns, ${counts.info} info)\n`,
  );

  for (const sev of ['error', 'warn', 'info'] as const) {
    const group = all.filter(f => f.severity === sev);
    if (group.length === 0) continue;
    console.log(sev.toUpperCase() + 'S');
    let lastId: string | null = null;
    for (const f of group) {
      if (f.symbolId !== lastId) {
        console.log(`  ${f.symbolId}`);
        lastId = f.symbolId;
      }
      console.log(`    [${f.rule}] ${f.message}`);
    }
    console.log('');
  }

  process.exit(counts.error > 0 ? 1 : 0);
}

main();

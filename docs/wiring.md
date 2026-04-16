# Wiring System Reference

**Status:** living document · **Last major update:** 2026-04-16 (Session 43)

The wire-drawing system is the most user-facing, most fragile, and most-tuned part of fusionCad. This document is the **canonical reference** — update it whenever behavior changes.

For historical investigation notes, see `docs/investigations/wiring-system.md`. For a change plan, see `docs/plans/wiring-drag-quality.md`. This file is the *current* truth.

---

## 1. What is a wire?

A **wire** (a.k.a. *connection*) is a typed edge in the circuit graph:

```ts
interface Connection {
  fromDevice: string;      // tag (display label like "K1")
  fromDeviceId: string;    // immutable ID — authoritative
  fromPin: string;         // pin ID on the source device
  toDevice: string;
  toDeviceId: string;
  toPin: string;
  netId: string;           // logical net this wire belongs to
  sheetId: string;         // which sheet the wire lives on
  waypoints?: Point[];     // optional user-placed bends (see §5)
}
```

A **junction** is a 1-pin device of category `Junction` that represents a wire branch point (T-intersection or star). Junctions are *real devices* in the circuit, not renderer-only decorations.

---

## 2. Interaction flows

### 2.1 Starting a new wire (click 1 in wire mode, `wireStart === null`)

Precedence when both a pin and a wire are in hit-radius:

1. **Pin wins** → `setWireStart(hitPin)`. The preview dashed line starts at that pin.
2. **Wire fallback** (no pin in range) → `connectToWire()` splits the wire, creating a **junction device** at the projected click point. `setWireStart({ device: junctionId, pin: '1' })` so the preview starts at the junction.
3. **Neither** → nothing happens.

> **Why pin over wire?** Once a pin has a wire attached, any click on that pin hits both (both use a ~2mm radius at `scale=1`). Preferring wire silently created junctions, zero visual feedback, and broke the user's mental model of "click pin → start wire."
>
> *Ref: `useCanvasInteraction.ts` (case `'wire'`). Fixed Session 43.*

### 2.2 Completing a wire (click 2+, `wireStart` is set)

Same precedence as click 1 for the target:

1. **Pin hit** → `createWireConnection(wireStart, hitPin, wireWaypoints)`. Connection stored. Clear `wireStart` and `wireWaypoints`.
2. **Wire hit** (not a pin) → `connectToWire(hitWireIdx, x, y, wireStart)`. This atomically:
   - splits the target wire into two pieces through a new junction, and
   - creates a third wire from `wireStart.pin` to the junction.
3. **Empty space** → append `snapToGrid(point)` to `wireWaypoints`. Preview extends through the new bend; user keeps clicking.

### 2.3 Canceling

- **Escape** → clears `wireStart` and `wireWaypoints`.
- **Switching sheets** → clears both (see §7.2).
- **Leaving wire mode** (V for select, or clicking a symbol in the palette) → clears `wireStart`.

---

## 3. Hit testing

Two functions drive all wire-mode decisions. Both must receive **sheet-filtered devices** so cross-sheet coordinate collisions don't set `wireStart` to a device on the wrong sheet.

### 3.1 `getPinAtPoint` — `apps/web/src/types.ts`

```ts
function getPinAtPoint(worldX, worldY, devices, parts, positions, transforms, viewportScale): PinHit | null
```

- Hit radius: `8 / (viewportScale * MM_TO_PX)` → **2mm at 100% zoom** (scales with zoom so UX stays consistent).
- Returns the **first** matching pin in device iteration order. There's no "closest pin wins" logic today.
- **Callers must filter devices by active sheet.** The function itself does not — `activeSheetId` isn't in scope here.

### 3.2 `getWireAtPoint` — `apps/web/src/renderer/circuit-renderer.ts`

```ts
function getWireAtPoint(worldX, worldY, connections, devices, parts, positions, tolerance, transforms): number | null
```

- Receives a tolerance in world units (callers pass `8 / (viewportScale * MM_TO_PX)` = 2mm, same as pins).
- Input is `sheetConnections` — already sheet-filtered by the caller.

### 3.3 Precedence summary

| Pin in range? | Wire in range? | Result |
|---|---|---|
| Yes | (any) | **Pin wins** (start from pin) |
| No | Yes | Wire wins → junction + branch |
| No | No | No-op |

The same precedence applies to both click 1 (starting) and click 2+ (completing).

---

## 4. Rendering pipeline

### 4.1 Final wire (from connection data)

File: `apps/web/src/renderer/circuit-renderer.ts` — "SECOND: Render connections" block around line 1033.

For each connection:
- If `waypoints === undefined` → route via `toOrthogonalPath(from, to)` (horizontal-first L-shape).
- If `waypoints === []` → same as above (dumb L-shape). (See §5 — the auto-router is not currently integrated.)
- If `waypoints = [...]` → route via `toOrthogonalPath(from, ...waypoints, to)` (through user bends).

Stroke: `theme.wireBaseColor`, width `0.35mm` (thinner after Session 39).

### 4.2 Preview wire (in-progress drawing)

File: `apps/web/src/renderer/circuit-renderer.ts:1344-1411`.

```ts
if (options?.wireStart) {
  const device = devices.find(d => d.id === options.wireStart!.device);
  if (device) {
    const position = positions.get(device.id);
    if (position) {
      // compute pinX/pinY via applyPinTransform + rotation
      // draw orange highlight circle at start pin
      if (options.wirePreviewMouse) {
        // draw dashed yellow-gold line: pin → ...waypoints → cursor
        // draw small circle at cursor position
      }
    }
  }
}
```

**Critical:** `devices` here is **already filtered to active sheet** (see §3). If `wireStart.device` isn't on the active sheet, the entire preview block is silently skipped. This is why:
- Starting a wire on sheet A and switching to sheet B used to silently hide the preview (Session 43 fix clears `wireStart` on sheet change).
- Cross-sheet pin-coordinate collisions used to set `wireStart` to the wrong-sheet device, hiding the preview (Session 43 fix: callers filter before `getPinAtPoint`).

Preview visibility condition (`Canvas.tsx:115`):
```ts
wirePreviewMouse: interactionMode === 'wire' && wireStart && mouseWorldPos ? mouseWorldPos : null
```

All three must be truthy and the `wireStart.device` must be on the active sheet. Any one missing → preview silently disappears.

---

## 5. Waypoint state machine

Waypoints are user-placed bend points stored on `Connection.waypoints`. There are **three meaningful states**:

| State | Meaning | Rendered as |
|---|---|---|
| `undefined` | Auto-routed (placeholder for future auto-router) | `toOrthogonalPath(from, to)` — dumb L-shape |
| `[]` | Explicit empty — auto-route preferred but none available | same as above |
| `[p1, p2, ...]` | User-placed bends | `toOrthogonalPath(from, ...waypoints, to)` — path through bends |

### Transitions

| Trigger | Transition |
|---|---|
| `createWireConnection(from, to, undefined)` | Connection created with `waypoints = []` (initial storage normalizes undefined to empty array) |
| `createWireConnection(from, to, [p1, p2])` | Stored as `[p1, p2]` |
| User clicks empty space during draw | Append snapped point: `setWireWaypoints(prev => [...prev, snap(world)])` |
| Device drag (endpoint moves) | `replaceWaypoints(idx, [])` — drops to L-shape until user re-tunes |
| Segment drag | Waypoints materialized from rendered path, then `simplifyWaypoints` removes collinear |

### Gotchas

- The drag-reset to `[]` is why parallel wires collapse onto the same path after moving a device. Sequential-routing fix is planned but not yet implemented (see `docs/plans/wiring-drag-quality.md`).
- `simplifyWaypoints` at `useCanvasInteraction.ts:166-183` uses a 1mm collinearity tolerance. That's too tight for post-snap waypoints — known issue ("segment drag inconsistency").

---

## 6. Data flow diagram

```
User click in wire mode
    │
    ▼
handleMouseDown (useCanvasInteraction.ts, case 'wire')
    │
    ├─ getPinAtPoint(world, sheetFilteredDevices, ...)    ← §3.1
    ├─ getWireAtPoint(world, sheetConnections, ...)        ← §3.2
    │
    ▼
if !wireStart:                                             ← click 1
    if hitPin:    setWireStart(hitPin)
    elif hitWireIdx: connectToWire(idx, x, y, null)        ← creates junction
                     setWireStart({ device: junctionId, pin: '1' })
else:                                                      ← click 2+
    if hitPin:    createWireConnection(wireStart, hitPin, wireWaypoints)
                  clear wireStart + wireWaypoints
    elif hitWireIdx: connectToWire(idx, x, y, wireStart)
                     clear wireStart + wireWaypoints
    else:         setWireWaypoints(prev => [...prev, snap(world)])

    ▼
Render useEffect re-runs (Canvas.tsx:202) when wireStart or mouseWorldPos changes
    │
    ▼
renderCircuit(...) → preview block only runs if wireStart.device is on active sheet
```

---

## 7. Known pitfalls (learn from past incidents)

### 7.1 Stale-closure wireWaypoints (Session 42, fixed)

**Symptom:** Waypoints placed during drawing are silently discarded when the user completes the wire.

**Root cause:** The giant `useEffect` at `useCanvasInteraction.ts:~2056` omitted `wireWaypoints` from its dependency array. Handlers captured a stale closure over `wireWaypoints = []`.

**Fix:** Added `wireWaypoints` to the dep array. Handlers re-bind on every waypoint change.

**Regression test:** `e2e/tests/wire-creation.spec.ts` — "waypoints placed during draw persist on completion".

### 7.2 Cross-sheet wireStart leak (Session 43, fixed)

**Symptom:** Preview silently disappears when switching sheets mid-draw. Completing the wire creates a phantom cross-sheet connection.

**Root cause:** `wireStart` is hook-local state in `useCanvasInteraction`. Nothing cleared it when `activeSheetId` changed. The renderer filters devices by active sheet and silently drops the preview block when `wireStart.device` isn't found.

**Fix:** `useEffect(() => { setWireStart(null); setWireWaypoints([]); }, [activeSheetId])`.

### 7.3 Cross-sheet pin-coord collision (Session 43, fixed)

**Symptom:** In multi-sheet projects where pins share world coordinates across sheets (common after AI generation), clicking a pin on sheet A sometimes sets `wireStart` to a device on sheet B. Preview silently drops.

**Root cause:** `getPinAtPoint` iterates all devices in insertion order. First match within 2mm wins — regardless of sheet.

**Fix:** Callers (`useCanvasInteraction.ts:1289` and `:1508`) filter `circuit.devices` by `activeSheetId` before passing in. Matches the pattern already used for `getSymbolAtPoint`.

### 7.4 Wire-over-pin precedence (Session 43, fixed)

**Symptom:** Once a pin has any wire attached, clicking that pin to start a new wire silently creates a junction on the attached wire instead. Preview never shows. Every click spawns another junction.

**Root cause:** First-click logic preferred wire over pin when both were in range. Any pin with an attached wire lives at a coordinate that also hits the wire.

**Fix:** Reverse precedence — pin wins. Wire branching still works when the click is clearly on a wire (no pin in range). Also: after branching a wire, `setWireStart` on the newly-created junction so the user sees the preview for the branch.

### 7.5 Preview-vs-render asymmetry (open)

The renderer allows drawing wires with `waypoints === undefined` differently from `waypoints === []` in theory, but in practice both render as the dumb L-shape. If a future fix distinguishes them (e.g., integrating the A* router for `undefined` only), the 3-state semantic matters. See §5.

---

## 8. When modifying wiring code

This area has a pattern: small, seemingly innocuous changes cause silent regressions that the user discovers days later. Required guardrails:

1. **Run `npx playwright test wire-creation.spec.ts`** before pushing. All 6 tests must pass.
2. **Mutation-test** new fixes: temporarily revert the change and confirm the new regression test fails without it. "Test passed" + "test passes both ways" is a bad test.
3. **Test on a multi-sheet project** with pre-existing connections — most wiring regressions only surface there, not in an empty new project.
4. **Expose relevant state via `window.__fusionCadState` or Canvas fiber props** when investigating. Blind code-reading has repeatedly missed the real root cause.
5. **Preserve pin precedence** (§3.3) unless you have a specific reason to change it, in which case update this doc first.
6. **Update this doc in the same PR** as behavior changes.

---

## 9. Things we haven't fixed yet

Tracked in `docs/plans/wiring-drag-quality.md`:

- **Parallel wire overlap on device drag** — 3 wires between the same two devices collapse onto the same path after dragging. Needs sequential routing with wire-as-obstacle.
- **Segment-drag inconsistency** — `simplifyWaypoints` tolerance too tight, collapsing distinct bends.
- **Ghost preview doesn't snap to grid** — cursor indicator isn't snapped while user-placed waypoints are.
- **Junction proliferation on device drag** — status uncertain after Session 43 fixes; needs re-check now that the click-precedence fix is in place (many junctions the user saw were likely from the §7.4 bug, not from drag).

---

## 10. Key files

| File | Role |
|---|---|
| `apps/web/src/hooks/useCanvasInteraction.ts` | Mouse/keyboard handlers, wire mode state (`wireStart`, `wireWaypoints`, `mouseWorldPos`) |
| `apps/web/src/hooks/useCircuitState.ts` | `createWireConnection`, `connectToWire`, `replaceWaypoints`, circuit state |
| `apps/web/src/types.ts` | `getPinAtPoint`, `getSymbolAtPoint`, `applyPinTransform` |
| `apps/web/src/renderer/circuit-renderer.ts` | Final + preview rendering, `getWireAtPoint`, `toOrthogonalPath` |
| `apps/web/src/components/Canvas.tsx` | Render `useEffect`, `getRenderOptions`, preview visibility condition |
| `apps/web/src/utils/pin-math.ts` | Pure pin-transform math (rotation, mirror) |
| `e2e/tests/wire-creation.spec.ts` | Regression tests — add a case for every fix |

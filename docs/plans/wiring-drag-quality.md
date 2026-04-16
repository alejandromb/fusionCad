# Wiring Quality During Drag

**Status:** Investigation complete, design needed · **Owner:** fusionLogik · **Last updated:** 2026-04-16

## Problem

When a user drags a device, attached wires degrade from clean routing to overlapping mess. The user has to manually re-tune every wire after every move. This is the #1 UX friction in fusionCad today.

### Visual evidence (Session 42)

**Before drag (user hand-tuned staircase):**
F2.T1/T2/T3 → M1.U1/V1/W1 routed as a clean staircase — each wire uses a different vertical jog-column, wires never overlap.

**After drag (auto-degraded):**
All 3 wires collapse to the same path — horizontal overlap with no separation. User must re-tune from scratch.

## Root cause (confirmed via code investigation)

### Three-state waypoint semantic

```
waypoints = undefined  →  Auto-routed (visibility graph + A*)
waypoints = []         →  Dumb L-shape (horizontal-then-vertical)
waypoints = [p1, p2]   →  Manual/template (routes through exact points)
```

### What happens during drag

File: `apps/web/src/hooks/useCanvasInteraction.ts` lines 1175-1183

When ONE endpoint moves (device drag), the code runs:
```ts
if (conn.waypoints && conn.waypoints.length > 0) {
  replaceWaypoints(ci, []);  // drops to dumb L-shape
}
```

We tested switching `[]` to `undefined` (re-engage auto-router instead of L-shape). **Result: no visible improvement.** Both produce overlapping wires.

### Why the auto-router also overlaps

The auto-router (visibility graph + A*) runs **independently per wire**. When 3 wires need to route between the same two devices:
- Wire 1 finds shortest path → e.g., right-then-down
- Wire 2 finds shortest path → **same** right-then-down (no awareness of wire 1)
- Wire 3 → same again
- Result: 3 wires stacked on top of each other

### Why initial creation looks OK

When the user draws wires **one at a time** (click-click-click):
1. Draw wire 1. Auto-router finds a path. Wire 1 is now rendered.
2. Draw wire 2. The visibility graph **might** include wire 1 as an obstacle → wire 2 routes differently.
3. Draw wire 3. Routes around both.

This sequential property is lost during drag because ALL attached wires get their waypoints reset in the SAME frame.

## The correct algorithm: sequential routing with wire-as-obstacle

Standard EDA approach (KiCad, Altium, EPLAN all use variants of this):

1. Collect all wires that need re-routing (e.g., all wires attached to the dragged device)
2. Sort them in a deterministic order (e.g., by pin index, or by current path length)
3. Route wire #1 using the auto-router
4. **Add wire #1's routed path segments as obstacles** to the visibility graph
5. Route wire #2 → now avoids wire #1
6. Add wire #2's path as obstacles
7. Route wire #3 → avoids both
8. Result: parallel wires naturally fan out into distinct channels

### Obstacle representation

Each routed wire becomes a set of axis-aligned line segments. To prevent wires from touching:
- Add each segment with a **buffer zone** (e.g., 2.5mm on each side)
- The buffer ensures wires maintain readable separation
- Buffer size should match the grid spacing or wire-number label width

### Sort order matters

The order in which wires are routed affects the final layout:
- Shortest wires first → longer wires route around, producing cleaner outer paths
- By pin index (T1 before T2 before T3) → predictable, matches schematic convention
- By Y-position of source pin → natural top-to-bottom ordering

Recommended: **sort by source pin Y-position** (after rotation) so the visual order matches the physical order.

## Where to implement

### Option A: Renderer-level (re-route every frame)

File: `apps/web/src/renderer/circuit-renderer.ts` around line 1033 ("SECOND: Render connections")

Currently each wire is routed independently in a `for` loop. Change to:
1. Separate wires into groups that share at least one device
2. Within each group, route sequentially with wire-as-obstacle
3. Ungrouped wires route normally

**Pro:** Works for all cases (drag, initial render, window resize).
**Con:** Performance — re-routing all grouped wires every frame could be slow on complex projects. May need caching (only re-route when endpoints change).

### Option B: Drag-time only (re-route on drag release)

File: `apps/web/src/hooks/useCanvasInteraction.ts` (mouseup handler)

On drag release, run the sequential router for all wires that were reset, then bake the resulting paths as explicit waypoints.

**Pro:** Only runs once per drag operation. No frame-by-frame cost.
**Con:** During drag the wires look messy; they only clean up on release. Acceptable trade-off?

### Option C: Hybrid

During drag: show simple L-shape (cheap, current behavior).
On drag release: run sequential router, bake clean waypoints.
Visual: brief "snap" to clean layout on mouseup. Feels like KiCad.

## Problem 2: Junction proliferation during drag (Session 42 finding)

When dragging a device, the system creates unwanted junction devices at every point where a moving wire's path crosses an existing wire. These junctions become new anchor points that further distort the wiring, creating a cascading mess. Evidence: dragging CB3 produced 4-5 spurious junctions, angled (non-orthogonal) wire segments, and displaced wires.

This is likely a bug in the drag handler or the wire-update logic that runs on each mousemove during drag. The wire-crossing detection meant for interactive T-junction creation (click on existing wire to branch) may be firing during drag motion, creating junctions the user never asked for.

**Fix:** during device drag, the wire-update logic should NEVER create new junctions. Junction creation should only happen on explicit user click in wire mode. The drag handler should only update endpoint positions and waypoints — never mutate the circuit topology (add/remove devices or connections).

## Problem 3: Wire segment drag inconsistency (Session 42 finding)

When the user selects a wire segment and drags it (to move a horizontal or vertical section), the expected behavior is: the selected segment extends from one bend/junction to the next bend/junction. Dragging moves just that segment while the adjacent segments stretch to follow.

This works sometimes but not always. Likely causes:
- Segment detection inconsistently picks up the segment boundaries (sometimes grabs too much, sometimes too little)
- Waypoint materialization on first drag may not correctly identify all bend points in the rendered path
- Collinear waypoint simplification after drag (line 1248-1251 in useCanvasInteraction.ts) may merge segments that should stay distinct

**Investigation needed:**
1. Trace `getWireSegmentAtPoint` — how does it determine segment boundaries?
2. When a segment drag starts, waypoints are materialized from the rendered path (`toOrthogonalPath`). Are all bend points being captured?
3. After drag, `simplifyWaypoints` runs. Is it collapsing segments that the user just separated?
4. Does the behavior differ between auto-routed wires (`undefined` waypoints) vs user-drawn (`[]`) vs manual (`[...]`)?

**Expected behavior:** clicking a straight section between two bends should always select exactly that section. Dragging should move it orthogonally (horizontal segments move vertically, vertical segments move horizontally) while the connecting segments adjust length. This is standard KiCad/EPLAN behavior.

## Problem 4: Ghost wire preview ignores snap-to-grid (Session 42 finding)

When drawing a wire in wire mode, the preview line (ghost) from the start pin to the mouse cursor does not snap to the grid even when snap is enabled. The final click placement does snap, but the visual preview shows freeform positions — misleading because the user thinks the wire will land where the preview shows.

**Fix:** in the wire preview rendering (circuit-renderer.ts, where `wirePreviewMouse` is drawn), apply `snapToGrid()` to the mouse position before drawing the preview line. Should be a 1-2 line fix.

## Non-goals

- **This plan does NOT cover the bus/cable abstraction.** That's a higher-level feature where 3 wires are recognized as a "3-phase bus" and move as a unit. This plan is about making the existing per-wire router produce non-overlapping results.
- **This plan does NOT change how manual waypoints work.** User-placed waypoints are preserved as-is. This only affects what happens when waypoints are RESET during drag.
- **This plan does NOT address the broader "smart wires" P1 item.** That includes rubber-band preview, snap-to-pin UX, bus entities, etc. This plan is scoped to: "wires don't overlap after drag."

## Safety rails

- **Never auto-delete user waypoints without drag.** The sequential re-route only runs when waypoints were already being reset (drag case). Wires with stable manual waypoints are never touched.
- **Deterministic output.** Same drag → same wire layout. No randomness.
- **Performance guard.** If a device has > 20 attached wires, fall back to current behavior (independent routing) rather than O(n²) sequential routing.
- **Test: the wire-creation E2E tests must still pass.** They exercise the basic draw-wire flow which must not regress.

## Test plan

1. **Manual test (primary):** Generate a motor starter. Drag M1 down 30mm. All 3 phase wires should route as a clean staircase without manual intervention.
2. **Multi-device drag:** Select CB1 + K1 + F1 + M1 (all power devices), drag the group. Wires between them should shift cleanly (BOTH endpoints moving → waypoints translate, no re-route needed — already handled).
3. **Single-wire drag:** Drag a device with only 1 attached wire. Should still route cleanly (trivial case — no parallel wire issue).
4. **E2E regression:** All wire-creation tests pass.
5. **Performance:** Open the compressor sequencer project (233 devices, 187 connections). Drag a device. Should not noticeably lag (< 100ms re-route).

## Dependencies

- The visibility graph builder must support adding arbitrary line-segment obstacles. Need to verify this is possible with the current implementation before committing to Option A.
- If the visibility graph doesn't support dynamic obstacle injection, a simpler approach (channel-based routing for parallel wires) might be needed.

## Open questions

1. Does the current visibility graph builder already accept "extra obstacles" beyond device bounding boxes? If yes, Option A is straightforward. If no, how hard is it to add?
2. Should the sequential re-route run on EVERY render (Option A) or only on drag-release (Option B/C)? Need to profile performance on a real project.
3. When the user manually tunes a wire (adds waypoints), should that wire be "locked" during future sequential re-routes of its neighbors? Or should it participate as an obstacle?

## References

- Current auto-router: `apps/web/src/renderer/circuit-renderer.ts` (visibility graph + A*)
- Drag handler: `apps/web/src/hooks/useCanvasInteraction.ts:1152-1185`
- Waypoint 3-state semantic: `apps/web/src/renderer/circuit-renderer.ts` lines 53-60
- CLAUDE.md P1 #3: "Wiring UX + smart wires"
- `memory/project_wiring_architecture.md` — earlier wiring architecture notes

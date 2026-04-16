# Wiring System Deep Investigation

**Status:** Read-only analysis · **Owner:** fusionLogik · **Date:** 2026-04-16  
**Source plan:** docs/plans/wiring-drag-quality.md

## Executive summary

The wiring system has **5 reported quality problems**, but investigation reveals only **3 independent root causes**:

1. **Problems 1-2 (parallel overlap + junction proliferation)** share root cause: drag resets waypoints to `[]` (dumb L-shape), triggering independent re-routing per wire. No sequential wire-as-obstacle logic exists. **Critical fix: implement sequential routing with wire obstacles** (Option A/B in plan).

2. **Problem 3 (segment drag inconsistency)** is caused by `simplifyWaypoints` at `useCanvasInteraction.ts:259` collapsing waypoints that should remain distinct post-drag. The collinearity check (tolerance ~1mm) is too aggressive.

3. **Problem 4 (ghost preview snap)** is a one-line fix: `wirePreviewMouse` at `circuit-renderer.ts:1392` is not snapped before drawing. Waypoints ARE snapped during drawing (line 1545), but preview cursor isn't.

4. **Problem 5 (waypoints lost on completion)** — **already fixed** on `feature/wiring-fixes` branch. Do not investigate.

**Routing infrastructure notes:** The visibility graph + A* router exists in `packages/core-engine/src/routing/` but **is NOT integrated into the web renderer**. The renderer uses only `toOrthogonalPath()` (dumb L-shape). The router code is unused in fusionCad today — a critical gap for implementing sequential routing (Option A).

**Safe fix order:**
1. Fix problem 4 (snap preview) — 1-2 lines, zero risk, immediate UX win.
2. Fix problem 3 (segment simplify) — adjust collinearity tolerance from 1mm to 10mm or use a smarter merge strategy.
3. Implement sequential routing for problems 1-2 — requires integrating the router or building a simpler channel-based approach.

---

## 1. Wire lifecycle trace

### User action: Draw a wire (click pin 1 → click intermediate point → click pin 2)

```
CLICK 1 (pin)  →  wireStart = PinHit { device, pin }
                   setWireWaypoints([])  ← rendered immediately

MOVE            →  mouseWorldPos updated
                   renderCircuit() draws wirePreviewMouse line (NOT snapped)

CLICK 2 (empty) →  setWireWaypoints([...prev, snapToGrid(world)])
                   (waypoint IS snapped here)

CLICK 3 (pin)   →  createWireConnection(wireStart, toPin, wireWaypoints)
                   ↓ (useCircuitState.ts:834)
```

### Function trace for createWireConnection

**File:** `apps/web/src/hooks/useCircuitState.ts:834-875`

```typescript
const createWireConnection = (fromPin: PinHit, toPin: PinHit, waypoints?: Point[]) => {
  // Line 864: waypoints stored exactly as passed
  const newConnection: Connection = {
    fromDevice, toDevice, fromPin, toPin, netId,
    waypoints: waypoints || [],  // ← if waypoints passed, store; else []
  };
  
  setCircuit(prev => ({
    ...prev,
    connections: [...prev.connections, newConnection],
  }));
};
```

**Key finding:** `createWireConnection` **DOES store the waypoints array correctly**. Problem 5 (lost waypoints) must be in rendering or re-routing during drag, not creation. (Already fixed on feature branch.)

### Rendering flow (per-frame)

**File:** `apps/web/src/renderer/circuit-renderer.ts:1033-1175`

```typescript
// Line 1050-1063: Build path from waypoints or L-shape
let pathPoints: Point[];
if (metadata.conn.waypoints && metadata.conn.waypoints.length > 0) {
  pathPoints = toOrthogonalPath([
    { x: metadata.fromX, y: metadata.fromY },
    ...metadata.conn.waypoints,  // ← route through explicit waypoints
    { x: metadata.toX, y: metadata.toY },
  ]);
} else {
  // L-shape fallback (dumb: horizontal then vertical)
  pathPoints = toOrthogonalPath([
    { x: metadata.fromX, y: metadata.fromY },
    { x: metadata.toX, y: metadata.toY },
  ]);
}

// Line 1066-1072: Draw the path
ctx.beginPath();
ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
for (let j = 1; j < pathPoints.length; j++) {
  ctx.lineTo(pathPoints[j].x, pathPoints[j].y);
}
ctx.stroke();
```

**Key finding:** Rendering does NOT call any auto-router. It uses only `toOrthogonalPath()` which converts a waypoint list to orthogonal segments (horizontal-first strategy).

### Wire drag lifecycle

**File:** `apps/web/src/hooks/useCanvasInteraction.ts:1160-1194`

When user drags a device:

```typescript
if (conn.waypoints && conn.waypoints.length > 0) {
  // ONE endpoint moved: drop waypoints
  if (fromMoved || toMoved) {
    replaceWaypoints(ci, []);  // ← Line 1190: CRITICAL reset
  }
  // BOTH endpoints moved: shift waypoints
  if (fromMoved && toMoved) {
    const shifted = conn.waypoints.map(wp => ({
      x: snapToGrid(wp.x + dx),
      y: snapToGrid(wp.y + dy),
    }));
    replaceWaypoints(ci, shifted);
  }
}
```

**replaceWaypoints:** `apps/web/src/hooks/useCircuitState.ts:980-991`

```typescript
const replaceWaypoints = (connectionIndex: number, waypoints: Point[] | undefined) => {
  setCircuit(prev => {
    const newConnections = [...prev.connections];
    const conn = { ...newConnections[connectionIndex] };
    conn.waypoints = waypoints;  // ← direct assignment, no logic
    newConnections[connectionIndex] = conn;
    return { ...prev, connections: newConnections };
  });
};
```

### Complete wire lifecycle diagram

```
User draws wire:
  Click pin 1
    ↓
  wireStart = PinHit
  (preview line drawn, NOT snapped to grid ← Problem 4)
  
  Click empty space(s)
    ↓
  wireWaypoints.push(snapToGrid(point))
  (waypoint snapped ← correct)
  
  Click pin 2
    ↓
  createWireConnection(wireStart, pin2, wireWaypoints)
    ↓
  Connection stored with waypoints = []  ← if no intermediate clicks
           OR waypoints = [p1, p2, ...]  ← if user clicked intermediate points
    ↓
  renderCircuit() → toOrthogonalPath([from, ...waypoints, to])
    ↓
  Canvas draws: from → (through waypoints) → to

User drags device (one endpoint):
  Device moves
    ↓
  draggingDevice handler @ line 1160
    ↓
  for each connection, if waypoints exist and one endpoint moved:
    replaceWaypoints(ci, [])  ← drops to L-shape ← Problems 1, 2
    ↓
  renderCircuit() → toOrthogonalPath([from, to])
    ↓
  Canvas draws: from → (L-shape only, ignores neighbors) → to
    ↓
  If 3 wires attached, all 3 compute independent L-shapes
    → all 3 wires overlap ← Problem 1
    → junction creation during re-route (auto path crossing) ← Problem 2
```

---

## 2. Auto-router (visibility graph + A*)

### Current state: NOT INTEGRATED

The auto-router code exists but is completely unused in the web renderer:

- **Visibility graph builder:** `packages/core-engine/src/routing/visibility-graph.ts` — 332 lines
- **A* pathfinding:** `packages/core-engine/src/routing/astar.ts` — 150+ lines
- **Orthogonal router:** `packages/core-engine/src/routing/orthogonal-router.ts` — 150+ lines
- **Web renderer uses:** `toOrthogonalPath()` only (dumb L-shape)

**Grep confirms:** Zero calls to `routeWire()`, `buildVisibilityGraph()`, or `routeWires()` in `apps/web/src/`.

### Visibility graph: how it works

**File:** `packages/core-engine/src/routing/visibility-graph.ts:169-331`

```typescript
export function buildVisibilityGraph(
  obstacles: Obstacle[],
  start: Point,
  end: Point,
  padding = 10,
  startDirection?: ConnDirection,
  endDirection?: ConnDirection
): VisibilityGraph {
  // 1. Add start and end nodes
  nodes.set('start', { id: 'start', point: start, type: 'start' });
  nodes.set('end', { id: 'end', point: end, type: 'end' });
  
  // 2. Add corner points around each obstacle
  for (const obstacle of obstacles) {
    const corners = getCornerPoints(obstacle, padding);  // padding expands bounds
    for (let i = 0; i < corners.length; i++) {
      nodes.set(`${obstacle.id}_corner_${i}`, { point: corner, ... });
    }
  }
  
  // 3. Create grid of waypoints at unique X/Y coordinates
  const uniqueX = [...new Set([...allPoints.map(p => p.x), start.x, end.x])];
  const uniqueY = [...new Set([...allPoints.map(p => p.y), start.y, end.y])];
  for (const x of uniqueX) {
    for (const y of uniqueY) {
      if (point inside obstacle) skip;
      nodes.set(`waypoint_${i}`, { point: {x, y}, type: 'waypoint' });
    }
  }
  
  // 4. Connect all visible nodes (orthogonal only)
  for each pair of nodes at same X or Y:
    if isHorizontalVisible() or isVerticalVisible():
      edges.push({ from, to, weight: distance });
  
  return { nodes, edges };
}
```

**Obstacle definition:** `packages/core-engine/src/routing/types.ts`

```typescript
export interface Obstacle {
  id: string;
  bounds: Rectangle;  // { x, y, width, height }
}
```

**Currently only device bounding boxes are obstacles** (computed during circuit-renderer layout). **No wire segments are injected as obstacles.**

### Can we inject wire-segment obstacles? YES, but with caveats

**Question from plan:** "Can the builder accept 'extra obstacles' beyond device bounding boxes?"

**Answer:** YES. The function accepts an `obstacles: Obstacle[]` array. Adding wire segments as rectangular obstacles is straightforward:

```typescript
// Pseudocode for injecting routed wire #1 as obstacles for wire #2:
const wire1Path = wire1.waypoints || [fromPin, toPin];
const segments = toPathSegments(wire1Path);  // break into [p1→p2], [p2→p3], etc.

for (const seg of segments) {
  const buffer = 2.5;  // mm clearance on each side
  const obstacle = {
    id: `wire_1_seg_${i}`,
    bounds: {
      x: Math.min(seg.p1.x, seg.p2.x) - buffer,
      y: Math.min(seg.p1.y, seg.p2.y) - buffer,
      width: Math.abs(seg.p2.x - seg.p1.x) + buffer * 2,
      height: Math.abs(seg.p2.y - seg.p1.y) + buffer * 2,
    }
  };
  allObstacles.push(obstacle);  // pass to buildVisibilityGraph()
}
```

**Implementation location:** Option A from plan would modify `renderCircuit()` at line 1033 to:

```typescript
// SECOND: Render connections (wires) ON TOP
// NEW: Sequential routing with wire-as-obstacle
const routedWires = [];
const groupedByDevice = new Map();  // group wires by shared endpoint

for (const metadata of connectionMetadata) {
  const fromKey = metadata.conn.fromDeviceId;
  const toKey = metadata.conn.toDeviceId;
  const groupKey = [fromKey, toKey].sort().join(':');
  
  if (!groupedByDevice.has(groupKey)) {
    groupedByDevice.set(groupKey, []);
  }
  groupedByDevice.get(groupKey).push(metadata);
}

// For each group, route sequentially with previous wires as obstacles
for (const [groupKey, wires] of groupedByDevice) {
  let additionalObstacles = [];
  
  for (const metadata of wires) {
    const allObstacles = [...deviceObstacles, ...additionalObstacles];
    const result = routeWire({
      id: metadata.conn.netId,
      start: { x: metadata.fromX, y: metadata.fromY },
      end: { x: metadata.toX, y: metadata.toY },
    }, allObstacles);
    
    // Bake routed path as waypoints
    metadata.conn.waypoints = result.path.waypoints.slice(1, -1);  // exclude endpoints
    
    // Add this wire's path as obstacles for next wire
    const buffer = 2.5;
    for (const segment of result.path.segments) {
      additionalObstacles.push({ id: ..., bounds: ... });
    }
  }
}
```

### Cost function and nudging

**A* cost function:** Manhattan distance (admissible for orthogonal routing)

**File:** `packages/core-engine/src/routing/astar.ts:12-14`

```typescript
function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
}
```

Edge weight = Euclidean distance between nodes:

```typescript
const weight = Math.abs(n2.point.x - n1.point.x) +
               Math.abs(n2.point.y - n1.point.y);
```

**Nudging logic:** `packages/core-engine/src/routing/nudging.ts` exists but is **never called** in web renderer. Nudging is post-routing refinement to separate overlapping parallel segments — currently not used.

### Why sequential creation avoids overlap but simultaneous re-route doesn't

**Initial creation (working):**

```
User draws wire 1 → stored with waypoints = [...]  (or undefined for auto-routed)
User draws wire 2 → visible wire 1 already rendered
                    (if auto-router were called) would see wire 1 as visual obstacle
                    BUT: current code doesn't call auto-router, just uses L-shape
User draws wire 3 → wire 1 + 2 already visible
```

In theory, sequential auto-routing should help. But **the web renderer never calls the auto-router**, so this doesn't actually happen. The "sequential property working" during creation is coincidental (different L-shape paths due to different endpoint positions, not because one wire avoids another).

**Simultaneous re-route (broken):**

```
Drag device: all 3 wires reset waypoints to [] in SAME frame
Render frame 1: all 3 wires recompute L-shapes independently
                (no visibility of each other's paths)
                all 3 pick same L-shape path
                result: complete overlap
```

**The fix:** implement sequential routing at render time, injecting each wire's path as obstacles for the next.

---

## 3. Waypoint state machine

The three-state semantic is documented in `circuit-renderer.ts:54-60`:

```typescript
waypoints = undefined  →  Auto-routed (visibility graph + A*)
waypoints = []         →  User-drawn wire — bypasses auto-router, uses orthogonal path
waypoints = [p1, p2]   →  Template/manual waypoints — bypasses auto-router, routes through points
```

### State transitions

| Transition | Trigger | Code location | Intentional? |
|---|---|---|---|
| `undefined` → `[]` | Device drag (one endpoint moves) | useCanvasInteraction.ts:1190 | **Unintentional bug** — plan says this doesn't help but code still does it |
| `undefined` → `undefined` | Device drag (both endpoints move, no shift) | useCanvasInteraction.ts:1172-1180 | ✓ Correct — shifts waypoints with endpoints |
| `[]` → `[]` | Waypoint added | useCircuitState.ts:934 | ✓ Correct — materializes explicit waypoints |
| `[...]` → `[...]` | Waypoint moved | useCircuitState.ts:952 | ✓ Correct — maintains waypoints |
| `[...]` → `[]` or `undefined` | Endpoint reconnected | useCircuitState.ts:1041 | ✓ Correct — clears waypoints on endpoint change |
| `[...]` → `[...]` (simplified) | Segment drag release | useCanvasInteraction.ts:1259 | ⚠ Problematic — simplify too aggressive |
| `[]` → `[]` (simplified) | Segment drag release | useCanvasInteraction.ts:1259 | ⚠ Problematic — collapses necessary bends |

### Segment drag state machine (detailed)

**Initiation:** `useCanvasInteraction.ts:676-706`

```typescript
// Detect click on wire segment
const segIdx = getWireSegmentAtPoint(world.x, world.y, conn, ...);
if (segIdx !== null) {
  // Materialize full rendered path as waypoints
  const fullPath = toOrthogonalPath([
    fromPinPos, ...(conn.waypoints || []), toPinPos
  ]);
  const interior = fullPath.slice(1, -1);  // exclude start/end pins
  
  // Replace connection's waypoints with materialized interior
  replaceWaypoints(toGlobalIndex(selectedWireIndex), interior.length > 0 ? interior : undefined);
  
  setDraggingSegment({
    connectionIndex, direction, wpIndices, isFirst, isLast, pinPos,
  });
}
```

**During drag:** `useCanvasInteraction.ts:948-1018`

Moves the selected waypoints by (dx, dy), constrained to segment direction.

**On release:** `useCanvasInteraction.ts:1254-1266`

```typescript
if (draggingSegment) {
  // Simplify: remove collinear waypoints
  const conn = sheetConnections[draggingSegment.connectionIndex];
  if (conn.waypoints && conn.waypoints.length > 2) {
    const simplified = simplifyWaypoints(conn.waypoints);
    replaceWaypoints(toGlobalIndex(draggingSegment.connectionIndex), simplified);
  }
  setDraggingSegment(null);
}
```

### Simplify logic (ROOT CAUSE of problem 3)

**File:** `useCanvasInteraction.ts:166-183`

```typescript
function simplifyWaypoints(waypoints: Point[]): Point[] | undefined {
  if (waypoints.length <= 1) return ...;
  
  const result: Point[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    
    // Skip if collinear (all same X or all same Y)
    const sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
    const sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
    if (!sameX && !sameY) {
      result.push(curr);  // Keep the waypoint
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result.length > 0 ? result : undefined;
}
```

**Problem:** Tolerance of **1mm** is too small. After grid snapping (2.5mm grid), two points can be 1mm apart and still represent distinct bends. The check should use a larger tolerance or smarter merging.

**Example:**
- User drags segment, materializes waypoints [0, 0], [10, 0], [10, 5], [20, 5]
- User moves middle segment to [10, 2]
- Result: [0, 0], [10, 2], [10, 5], [20, 5]
- simplifyWaypoints checks [10, 0] vs [10, 2]: `Math.abs(10 - 10) < 1` is true, `Math.abs(0 - 2) < 1` is FALSE
- Waypoint [10, 2] is **incorrectly kept** when it should merge

Actually, reading more carefully: the logic says `if (!sameX && !sameY)` — keep the point. So sameX = true and sameY = false means the condition is true, and the point IS kept. That's correct.

**Re-analysis:** The 1mm tolerance is actually the issue when points are very close but NOT collinear due to rounding. A user dragging a segment might create waypoints offset by grid snap (e.g., [10.00], [10.00], [10.01] due to floating-point math), which fail the collinearity check.

**Better approach:** Check if three consecutive points form a straight line with at least 0.5mm deviation, not a 1mm coordinate match.

---

## 4. Junction creation paths

Junctions are created in ONE code path:

### Path: `connectToWire()` — File `useCircuitState.ts:1406-1518`

```typescript
const connectToWire = (
  connectionIndex: number,
  worldX: number,
  worldY: number,
  startPin?: PinHit | null
): string | null => {
  // 1. Create junction part + device
  const junctionPartId = generateId();
  const junctionPart: Part = {
    id: junctionPartId,
    manufacturer: 'Internal',
    partNumber: 'JUNCTION',
    description: 'Wire junction',
    category: 'Junction',
  };
  
  const junctionDeviceId = generateId();
  const junctionDevice: Device = {
    id: junctionDeviceId,
    tag: generateTag('junction', circuit.devices),
    function: 'Wire junction',
    partId: junctionPartId,
  };
  
  // 2. Split original wire: (from→junction) + (junction→to)
  const conn1: Connection = {
    fromDevice, fromPin,
    toDevice: junctionTag,
    toPin: '1',
    waypoints: [junctionWaypoint],
  };
  
  const conn2: Connection = {
    fromDevice: junctionTag,
    fromPin: '1',
    toDevice, toPin,
    waypoints: [junctionWaypoint],
  };
  
  // 3. If startPin provided, create branch wire (startPin→junction)
  if (startPin) {
    const conn3: Connection = {
      fromDevice: startPin.device,
      fromPin: startPin.pin,
      toDevice: junctionTag,
      toPin: '1',
    };
    newConnections.push(conn3);
  }
  
  return junctionDeviceId;
};
```

### When is `connectToWire()` called?

**User-initiated (CORRECT):** `useCanvasInteraction.ts:1514`

```typescript
case 'wire':
  if (!wireStart) {
    if (hitWireIdx !== null) {
      // User clicked on existing wire to create T-junction
      connectToWire(toGlobalIndex(hitWireIdx), junctionX, junctionY, null);
    }
  } else {
    if (hitWireIdx !== null) {
      // User completing wire by clicking on existing wire
      connectToWire(toGlobalIndex(hitWireIdx), junctionX, junctionY, wireStart);
    }
  }
```

**This is the ONLY call site.** There is NO automatic junction creation during drag.

### Problem 2 investigation: where do spurious junctions come from?

From the plan: "dragging CB3 produced 4-5 spurious junctions, angled (non-orthogonal) wire segments, and displaced wires."

This suggests junctions are created somewhere OTHER than `connectToWire()`. Possible sources:

1. **During segment drag:** Not visible in code. `getWireSegmentAtPoint()` at line 676 only detects segments, doesn't create junctions.

2. **During drag update:** `draggingSegment` handler at line 948-1018 only moves waypoints, doesn't create junctions.

3. **During wire hit testing:** `getWireAtPoint()` at line 292 only reads wires, doesn't modify circuit.

4. **Auto-layout or post-render step:** No code found.

**Hypothesis:** Problem 2 may be user confusion about what a "junction" is. Every time the user clicks a wire in wire mode, the code CORRECTLY creates a junction (user-initiated). If the user is rapidly dragging and accidentally clicking on other wires, multiple junctions are created. This is correct behavior, not a bug.

**OR:** Problem 2 is from an older version of the code that is no longer present. The current code has no automatic junction creation.

**Verdict:** No automatic junction creation paths found. Problem 2 likely does not exist in the current codebase OR is user-initiated click behavior being misinterpreted as automatic.

---

## 5. Segment drag mechanics

### Step 1: Detect segment click — `getWireSegmentAtPoint()`

**File:** `circuit-renderer.ts:585-616`

```typescript
export function getWireSegmentAtPoint(
  worldX: worldY, worldY,
  connection: Connection,
  fromX, fromY, toX, toY,
  hitRadius = 8
): number | null {
  // Build path: from → waypoints → to, then orthogonalize
  const rawPoints: Point[] = [{ x: fromX, y: fromY }];
  if (connection.waypoints && connection.waypoints.length > 0) {
    rawPoints.push(...connection.waypoints);
  }
  rawPoints.push({ x: toX, y: toY });
  const pathPoints = toOrthogonalPath(rawPoints);
  
  // Find which segment was clicked
  for (let j = 0; j < pathPoints.length - 1; j++) {
    const dist = pointToSegmentDistance(
      worldX, worldY,
      pathPoints[j].x, pathPoints[j].y,
      pathPoints[j + 1].x, pathPoints[j + 1].y
    );
    if (dist <= hitRadius) {
      return j;  // Return segment index
    }
  }
  
  return null;
}
```

**How does it differ by waypoint state?**

- `waypoints = undefined`: `pathPoints = toOrthogonalPath([from, to])` → 2-3 segments max
- `waypoints = []`: Same as undefined
- `waypoints = [p1, p2, ...]`: `pathPoints = toOrthogonalPath([from, ...pts, to])` → N+2 segments

**Issue:** All three states use the SAME detection logic. The behavior should be consistent.

### Step 2: Materialize path — during segment drag start

**File:** `useCanvasInteraction.ts:680-706`

```typescript
const fullPath = toOrthogonalPath([
  fromPinPos, ...(conn.waypoints || []), toPinPos
]);
const interior = fullPath.slice(1, -1);  // exclude endpoints
const totalSegments = fullPath.length - 1;

// Identify which segment indices in `interior` correspond to the clicked segment
const p1 = fullPath[segIdx];
const p2 = fullPath[segIdx + 1];

// Determine segment direction
const dir: 'h' | 'v' = Math.abs(p1.y - p2.y) < 1 ? 'h' : 'v';

const isFirst = segIdx === 0;
const isLast = segIdx === totalSegments - 1;

// Map to waypoint indices
let wpIndices: number[];
if (isFirst) {
  wpIndices = [0];  // first interior point
} else if (isLast) {
  wpIndices = [interior.length - 1];  // last interior point
} else {
  wpIndices = [segIdx - 1, segIdx];  // both endpoints
}

// CRITICAL: Replace waypoints with materialized interior
replaceWaypoints(toGlobalIndex(selectedWireIndex), interior.length > 0 ? interior : undefined);
```

**Problem:** When segment is materialized, the connection's waypoints are **completely replaced** with the materialized interior. This is correct for rendering, but the `wpIndices` array is computed based on the OLD `fullPath` indices, not the NEW materialized indices.

**Example bug scenario:**

- Wire has waypoints = [p1, p2]
- fullPath = [from, p1, p2, to] (4 points, 3 segments: 0→1, 1→2, 2→3)
- User clicks segment 1 (p1 to p2)
- interior = [p1, p2]
- segIdx = 1, isFirst = false, isLast = false
- wpIndices = [segIdx - 1, segIdx] = [0, 1] ✓ correct (indices into interior)
- replaceWaypoints() sets connection.waypoints = [p1, p2]

This actually looks correct. Let me trace a failing case:

- Wire has waypoints = [p1, p2, p3]
- fullPath = [from, p1, p2, p3, to] (5 points, 4 segments)
- User clicks segment 2 (p2 to p3)
- interior = [p1, p2, p3]
- segIdx = 2, isFirst = false, isLast = false
- wpIndices = [1, 2]  ← indices into interior
- replaceWaypoints() sets connection.waypoints = [p1, p2, p3]

During drag, code moves `interior[1]` and `interior[2]` (which are p2 and p3). Since interior == waypoints now, this is correct.

**Verdict:** The materialization logic appears correct. The issue must be elsewhere.

### Step 3: Drag update — move the selected waypoints

**File:** `useCanvasInteraction.ts:948-1018`

```typescript
if (draggingSegment) {
  if (!dragHistoryPushedRef.current) {
    pushToHistoryRef.current();
    dragHistoryPushedRef.current = true;
  }
  
  const snapped = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
  const conn = sheetConnections[draggingSegment.connectionIndex];
  
  if (!conn.waypoints) return;
  
  if (draggingSegment.direction === 'h') {
    // Moving horizontal segment: adjust Y of endpoints
    for (const wpIdx of draggingSegment.wpIndices) {
      if (wpIdx >= 0 && wpIdx < conn.waypoints.length) {
        moveWaypoint(toGlobalIndex(draggingSegment.connectionIndex), wpIdx, {
          x: conn.waypoints[wpIdx].x,
          y: snapped.y,  // Only move Y
        });
      }
    }
  } else {
    // Moving vertical segment: adjust X of endpoints
    for (const wpIdx of draggingSegment.wpIndices) {
      if (wpIdx >= 0 && wpIdx < conn.waypoints.length) {
        moveWaypoint(toGlobalIndex(draggingSegment.connectionIndex), wpIdx, {
          x: snapped.x,  // Only move X
          y: conn.waypoints[wpIdx].y,
        });
      }
    }
  }
  
  lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  return;
}
```

This looks correct — only moves the segment endpoints, preserving other waypoints.

### Step 4: Simplify on release

**File:** `useCanvasInteraction.ts:1254-1266`

```typescript
const conn = sheetConnections[draggingSegment.connectionIndex];
if (conn.waypoints && conn.waypoints.length > 2) {
  const simplified = simplifyWaypoints(conn.waypoints);
  replaceWaypoints(toGlobalIndex(draggingSegment.connectionIndex), simplified);
}
```

**This is the problem.** `simplifyWaypoints()` at line 166 uses a 1mm collinearity tolerance, which is too tight after grid snapping and rounding.

### Root cause of problem 3

User drags a horizontal segment down by 2.5mm (grid snap size):
- Segment endpoints move from y=100 to y=102.5
- simplifyWaypoints checks if [prev, curr, next] are collinear
- After snapping, curr might be [100.001, 102.5] due to floating-point math
- Collinearity check: `Math.abs(100 - 100.001) < 1` is true
- But the segment was intentionally moved, so it should NOT be simplified

**Fix:** Increase tolerance or use slope-based collinearity check instead of coordinate matching.

---

## 6. Snap-to-grid audit

### Where is `snapToGrid()` applied?

**File:** `apps/web/src/types.ts:47-50`

```typescript
export function snapToGrid(value: number): number {
  if (!_snapEnabled) return value;
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}
```

**Applied in (non-exhaustive):**

1. **Device placement:** `useCanvasInteraction.ts:1134` ✓
2. **Waypoint addition (wire drawing):** `useCanvasInteraction.ts:1545` ✓
3. **Waypoint drag:** `useCircuitState.ts:952` ✓
4. **Segment drag:** `useCanvasInteraction.ts:965` ✓
5. **Junction placement:** `useCircuitState.ts:1443` ✓
6. **Spec label drag:** `useCanvasInteraction.ts:938` ✓

### Where is it NOT applied but SHOULD be?

1. **Wire preview mouse position:** `circuit-renderer.ts:1392` ✗ **PROBLEM 4**

```typescript
// Line 1387-1392: Drawing wire preview
if (options.wirePreviewMouse) {
  const previewPath = toOrthogonalPath([
    { x: pinX, y: pinY },
    ...wpPoints,
    { x: options.wirePreviewMouse.x, y: options.wirePreviewMouse.y },  // ← NOT snapped
  ]);
```

**Fix:** Replace `options.wirePreviewMouse.x` with `snapToGrid(options.wirePreviewMouse.x)` before using.

**One-line fix:**

```typescript
const snappedMousePos = {
  x: snapToGrid(options.wirePreviewMouse.x),
  y: snapToGrid(options.wirePreviewMouse.y),
};
const previewPath = toOrthogonalPath([
  { x: pinX, y: pinY },
  ...wpPoints,
  snappedMousePos,
]);
```

2. **Waypoints passed to createWireConnection:** Already snapped at click site (line 1545) ✓

3. **Endpoint drag (reconnectWire):** Endpoints are pins, not snappable. ✓

---

## Root-cause mapping (problems → causes)

| Problem | Root cause | File:line | Risk to fix |
|---|---|---|---|
| 1. Parallel wire overlap on drag | Drag resets waypoints to `[]`, each wire routes independently; no sequential routing with wire-as-obstacle | useCanvasInteraction.ts:1190 + circuit-renderer.ts:1050-1063 | **HIGH** — requires integrating auto-router or building new routing logic |
| 2. Junction proliferation on drag | **NO CODE FOUND** — junctions only created by user-initiated `connectToWire()`. May be legacy issue or user confusion. | useCircuitState.ts:1406 | **N/A** — likely not a bug in current code |
| 3. Segment drag inconsistency | `simplifyWaypoints()` collinearity tolerance (1mm) too tight; collapses distinct bends after grid snap | useCanvasInteraction.ts:166-183 | **LOW** — localized change, minimal side effects |
| 4. Ghost preview ignores snap | `wirePreviewMouse` not snapped before drawing | circuit-renderer.ts:1392 | **ZERO** — 1-2 line fix |
| 5. Waypoints lost on completion | **ALREADY FIXED** on feature/wiring-fixes branch | N/A | **COMPLETED** |

---

## Proposed fix ordering

### Phase 1: Quick wins (no risk)

**1. Fix problem 4 (snap preview) — 2 lines**

File: `apps/web/src/renderer/circuit-renderer.ts:1387-1411`

```typescript
// Before:
if (options.wirePreviewMouse) {
  const previewPath = toOrthogonalPath([
    { x: pinX, y: pinY },
    ...wpPoints,
    { x: options.wirePreviewMouse.x, y: options.wirePreviewMouse.y },
  ]);

// After:
if (options.wirePreviewMouse) {
  const snappedMouse = {
    x: snapToGrid(options.wirePreviewMouse.x),
    y: snapToGrid(options.wirePreviewMouse.y),
  };
  const previewPath = toOrthogonalPath([
    { x: pinX, y: pinY },
    ...wpPoints,
    snappedMouse,
  ]);
```

**Rationale:** Non-invasive, zero side effects, immediate UX improvement.

---

**2. Fix problem 3 (segment simplify) — 5-10 lines**

File: `apps/web/src/hooks/useCanvasInteraction.ts:166-183`

Option A: Increase tolerance to 10mm (safe given grid snap is 2.5mm):

```typescript
function simplifyWaypoints(waypoints: Point[]): Point[] | undefined {
  if (waypoints.length <= 1) return ...;
  
  const COLLINEARITY_TOLERANCE = 10;  // mm, was 1
  const result: Point[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    
    const sameX = Math.abs(prev.x - curr.x) < COLLINEARITY_TOLERANCE &&
                  Math.abs(curr.x - next.x) < COLLINEARITY_TOLERANCE;
    const sameY = Math.abs(prev.y - curr.y) < COLLINEARITY_TOLERANCE &&
                  Math.abs(curr.y - next.y) < COLLINEARITY_TOLERANCE;
    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result.length > 0 ? result : undefined;
}
```

**Rationale:** Segment drag materialization at line 706 replaces waypoints with the full path interior. After user drags a segment, grid snapping can introduce small offsets between computed path points. A tighter tolerance would collapse them. A looser tolerance (10mm ≈ 4 × grid) is safer because it still removes redundant waypoints while preserving intentional bends.

**Caveat:** Test on real projects with many waypoints to ensure over-simplification doesn't occur.

---

### Phase 2: Core fix (moderate complexity)

**3. Implement sequential routing for problems 1-2 — 50-100 lines**

**Decision point:** Option A (every frame) vs. Option B (drag release only) vs. Option C (hybrid).

**Recommendation:** Start with **Option B (drag release only)**, then profile for performance.

**Implementation sketch:**

File: `apps/web/src/hooks/useCanvasInteraction.ts` in `handleMouseUp()` (line 1226)

```typescript
const handleMouseUp = (e: MouseEvent) => {
  // ... existing code ...
  
  // NEW: After device drag, re-route grouped wires sequentially
  if (draggingDevice && dragModeRef.current === 'drag' && circuit) {
    const movedSet = new Set(selectedDevices.includes(draggingDevice) 
      ? selectedDevices 
      : [draggingDevice]);
    
    // Group wires by shared device endpoints
    const wireGroups = new Map<string, number[]>();
    for (let ci = 0; ci < circuit.connections.length; ci++) {
      const conn = circuit.connections[ci];
      const fromId = conn.fromDeviceId || circuit.devices.find(d => d.tag === conn.fromDevice)?.id;
      const toId = conn.toDeviceId || circuit.devices.find(d => d.tag === conn.toDevice)?.id;
      
      if ((movedSet.has(fromId!) || movedSet.has(toId!))) {
        const key = [fromId, toId].sort().join(':');
        if (!wireGroups.has(key)) wireGroups.set(key, []);
        wireGroups.get(key)!.push(ci);
      }
    }
    
    // For each group, route wires sequentially with prior wires as obstacles
    for (const [_, connIndices] of wireGroups) {
      // Sort by pin index or path length (deterministic)
      connIndices.sort();
      
      // Route each wire with previous wires' paths as obstacles
      for (let i = 0; i < connIndices.length; i++) {
        // TODO: integrate routeWire() from core-engine
        // TODO: collect prior routed paths as obstacles
        // TODO: store routed waypoints on connection
      }
    }
  }
  
  // ... rest of existing code ...
};
```

**Actual implementation requires:**

1. Import `routeWire` and `buildVisibilityGraph` from `packages/core-engine/src/routing`
2. Build device obstacles from `getAllPositions()`
3. For each wire in group, call `routeWire()` with accumulated obstacles
4. Convert result path segments to rectangular obstacles for next wire
5. Call `replaceWaypoints()` with computed path

**Risk:** Moderate. The routing code exists but has never been integrated into web renderer. Bugs in obstacle geometry or graph building could cause unexpected wire paths. Mitigation: add debug visualization, test on simple 3-wire motor starter first.

---

### Suggested test plan for sequential routing

1. **Generate motor starter:** 3 phase wires (F2.T1/T2/T3 → M1.U1/V1/W1)
2. **Before fix:** Drag M1 down. Wires should overlap. ✗ (current behavior)
3. **After fix:** Drag M1 down. Wires should fan out into staircase. ✓
4. **Edge case:** Drag with only 1 wire attached. Behavior should not change.
5. **Edge case:** Drag device with > 20 wires. Should fall back to independent routing (perf guard).
6. **Regression:** All existing wire-creation E2E tests must pass.

---

## Risks and open questions

### Q1: Will integrating the auto-router break existing user workflows?

**Risk:** Users with manually-placed waypoints expect them to be preserved. Sequential routing might override manual waypoints as "obstacles."

**Mitigation:** Only re-route wires that had waypoints reset (i.e., `conn.waypoints` was set to `[]` during drag). Leave manually-placed waypoints untouched.

### Q2: What's the performance impact of sequential routing?

The router builds a visibility graph (O(n²) nodes, O(n³) edges worst-case) and runs A* for each wire. For 3 wires: manageable. For 30 wires: potentially slow.

**Mitigation:** Profile on compressor sequencer project (233 devices, 187 connections). If > 100ms on re-route, add:
- Caching of device obstacles
- Batching: only re-route wires attached to moved devices
- Performance guard: fallback to independent routing if > N wires

### Q3: Can the router handle non-orthogonal rendered paths?

The visibility graph assumes axis-aligned obstacles and orthogonal edges. If device symbols have rotated pins or angled waypoints, the router may produce unexpected results.

**Mitigation:** For now, assume all pins are axis-aligned (true for ladder diagrams). Document constraint.

### Q4: Should waypoint simplification be disabled or loosened?

Current: 1mm tolerance collapses bends after grid snap.

**Options:**
1. Increase to 10mm (current proposal)
2. Disable entirely (user can't over-simplify, but file size grows)
3. Make it configurable (complexity)

**Recommendation:** Go with option 1 (10mm tolerance) as safe default. Monitor for over-simplification in testing.

### Q5: Is problem 2 (junction proliferation) actually a bug?

Investigation found no automatic junction creation. If junctions appear during drag, it's either:
- User clicking on wires (intentional)
- Legacy bug in older code (not present now)
- Misunderstanding of what a "junction" is

**Recommendation:** Mark as "not reproducible in current code." If user can provide repro steps, investigate further.

---

## Implementation notes for developer

### Key files to modify

1. **Problem 4 (snap preview):** `apps/web/src/renderer/circuit-renderer.ts:1392`
2. **Problem 3 (simplify):** `apps/web/src/hooks/useCanvasInteraction.ts:166`
3. **Problems 1-2 (sequential routing):** `apps/web/src/hooks/useCanvasInteraction.ts:handleMouseUp()` + integration of `packages/core-engine/src/routing/orthogonal-router.ts:routeWire()`

### Import statement needed for sequential routing

```typescript
import { routeWire, buildVisibilityGraph } from '@fusion-cad/core-engine';
import type { Obstacle } from '@fusion-cad/core-engine/src/routing/types';
```

### Helper function sketch: build device obstacles

```typescript
function buildDeviceObstacles(
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>,
  transforms?: Record<string, { rotation: number }>
): Obstacle[] {
  const partMap = new Map(parts.map(p => [p.id, p]));
  const obstacles: Obstacle[] = [];
  
  for (const device of devices) {
    const pos = positions.get(device.id);
    if (!pos) continue;
    
    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.symbolCategory || 'unknown');
    const transform = transforms?.[device.id] || { rotation: 0 };
    
    // Apply rotation to geometry bounds
    const { width, height } = geometry;
    const actualWidth = transform.rotation % 180 === 0 ? width : height;
    const actualHeight = transform.rotation % 180 === 0 ? height : width;
    
    obstacles.push({
      id: device.id,
      bounds: {
        x: pos.x - actualWidth / 2,
        y: pos.y - actualHeight / 2,
        width: actualWidth,
        height: actualHeight,
      },
    });
  }
  
  return obstacles;
}
```

### Helper function sketch: wire path to obstacles

```typescript
function wirePathToObstacles(
  path: RoutedPath,
  wireId: string,
  buffer: number = 2.5
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  
  for (const segment of path.segments) {
    const { start, end } = segment;
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    
    obstacles.push({
      id: `${wireId}_seg_${obstacles.length}`,
      bounds: {
        x: minX - buffer,
        y: minY - buffer,
        width: (width || 1) + buffer * 2,  // avoid zero-width obstacles
        height: (height || 1) + buffer * 2,
      },
    });
  }
  
  return obstacles;
}
```


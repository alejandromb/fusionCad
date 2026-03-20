/**
 * Circuit Renderer
 *
 * Renders the golden circuit on canvas
 */

import type { Device, Net, Part, Sheet, Annotation, Terminal, Rung, AnyDiagramBlock, LadderBlock } from '@fusion-cad/core-model';
import { drawSymbol, getSymbolGeometry } from './symbols';
import type { Point, Viewport, DeviceTransform } from './types';
import { routeWires, type Obstacle, type RouteRequest, type ConnDirection, DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import type { MarqueeRect } from '../hooks/useCanvasInteraction';
import { renderLadderOverlay } from './ladder-renderer';
import { renderTitleBlock } from './title-block';
import { getTheme } from './theme';

/**
 * Rotate a pin direction by a device's rotation angle.
 * Follows CW rotation: right→down→left→up per 90° step.
 */
function rotatePinDirection(
  dir: 'left' | 'right' | 'top' | 'bottom',
  rotation: number
): ConnDirection {
  // Map core-model PinDirection to our rotation array
  const dirMap: Record<string, number> = { right: 0, bottom: 1, left: 2, top: 3 };
  const connDirs: ConnDirection[] = ['right', 'down', 'left', 'up'];
  const steps = Math.round(((rotation % 360) + 360) % 360 / 90);
  return connDirs[(dirMap[dir] + steps) % 4];
}

/**
 * Resolve device for a connection endpoint.
 * Uses fromDeviceId/toDeviceId when present, falls back to tag lookup.
 */
export function resolveDevice(
  conn: Connection,
  endpoint: 'from' | 'to',
  devices: Device[],
): Device | undefined {
  const id = endpoint === 'from' ? conn.fromDeviceId : conn.toDeviceId;
  if (id) return devices.find(d => d.id === id);
  const tag = endpoint === 'from' ? conn.fromDevice : conn.toDevice;
  return devices.find(d => d.tag === tag);
}

export interface Connection {
  fromDevice: string;       // device tag (kept for display/export)
  fromDeviceId?: string;    // device ULID (authoritative when present)
  fromPin: string;
  toDevice: string;         // device tag
  toDeviceId?: string;      // device ULID
  toPin: string;
  netId: string;
  /** Sheet this wire belongs to (optional, defaults to active sheet) */
  sheetId?: string;
  /** Systematic wire number displayed on drawings */
  wireNumber?: string;
  /** Manual waypoints for wire routing - if provided, wire routes through these points */
  waypoints?: Point[];
}

export interface CircuitData {
  devices: Device[];
  nets: Net[];
  parts: Part[];
  connections: Connection[];
  sheets?: Sheet[];
  annotations?: Annotation[];
  terminals?: Terminal[];
  rungs?: Rung[];
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>;
  blocks?: AnyDiagramBlock[];
}

/** A connection with its original index in the global circuit.connections array */
export interface SheetConnection extends Connection {
  /** Index into the original circuit.connections array (for mutations) */
  _globalIndex: number;
}

/**
 * Filter connections to only those visible on the active sheet.
 * Each returned connection has a `_globalIndex` property for mapping back to the
 * global circuit.connections array when performing mutations.
 *
 * This function must be used by BOTH the renderer and the interaction handler
 * so that index spaces are consistent.
 */
export function filterConnectionsBySheet(
  connections: Connection[],
  devices: Device[],
  activeSheetId?: string,
): SheetConnection[] {
  if (!activeSheetId) {
    return connections.map((c, i) => ({ ...c, _globalIndex: i }));
  }
  const result: SheetConnection[] = [];
  for (let i = 0; i < connections.length; i++) {
    const c = connections[i];
    if (c.sheetId) {
      if (c.sheetId === activeSheetId) {
        result.push({ ...c, _globalIndex: i });
      }
    } else {
      // Fallback for legacy connections without sheetId:
      // Only include if BOTH endpoints are on the active sheet.
      // Using AND prevents cross-sheet wires from appearing on the wrong sheet.
      const fromDev = resolveDevice(c, 'from', devices);
      const toDev = resolveDevice(c, 'to', devices);
      if (fromDev !== undefined && toDev !== undefined) {
        result.push({ ...c, _globalIndex: i });
      }
    }
  }
  return result;
}

/**
 * Compute a pin's world position accounting for device rotation.
 * Rotates the pin offset around the symbol center, then adds device position.
 */
export function getPinWorldPosition(
  devicePos: Point,
  pinPos: Point,
  geometry: { width: number; height: number },
  transform?: DeviceTransform | { rotation: number; mirrorH?: boolean },
): Point {
  let px = pinPos.x;
  let py = pinPos.y;

  const rotation = transform?.rotation || 0;
  if (rotation !== 0) {
    const cx = geometry.width / 2;
    const cy = geometry.height / 2;
    const rad = (rotation * Math.PI) / 180;
    const dx = pinPos.x - cx;
    const dy = pinPos.y - cy;
    px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }

  return { x: devicePos.x + px, y: devicePos.y + py };
}

export interface RenderOptions {
  selectedDevices?: string[];
  selectedWireIndex?: number | null;
  wireStart?: { device: string; pin: string } | null;
  /** Mouse position for wire preview (draws line from wireStart to mouse) */
  wirePreviewMouse?: { x: number; y: number } | null;
  ghostSymbol?: { category: string; x: number; y: number } | null;
  /** Dragging endpoint for wire reconnection - shows preview line to mouse position */
  draggingEndpoint?: {
    connectionIndex: number;
    endpoint: 'from' | 'to';
    mousePos: { x: number; y: number };
  } | null;
  /** Active sheet ID - only render devices/connections on this sheet */
  activeSheetId?: string;
  /** Device rotation/mirror transforms */
  deviceTransforms?: Map<string, DeviceTransform>;
  /** Marquee selection rectangle (world coordinates) */
  marquee?: MarqueeRect | null;
  /** Show visible grid */
  showGrid?: boolean;
  /** Grid size in pixels */
  gridSize?: number;
  /** Selected annotation ID for highlight */
  selectedAnnotationId?: string | null;
  /** Ghost paste preview - array of devices to render as semi-transparent ghosts */
  ghostPaste?: Array<{ category: string; x: number; y: number; tag: string; rotation?: number; mirrorH?: boolean }> | null;
}

/**
 * Convert a series of points to orthogonal path (horizontal/vertical segments only)
 * Uses "horizontal first" approach: go horizontal to target X, then vertical to target Y
 */
export function toOrthogonalPath(points: Point[]): Point[] {
  if (points.length < 2) return points;

  const result: Point[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];

    // If not already aligned, add intermediate point for orthogonal routing
    if (prev.x !== curr.x && prev.y !== curr.y) {
      // Horizontal first, then vertical
      result.push({ x: curr.x, y: prev.y });
    }
    result.push(curr);
  }

  return result;
}

/**
 * Calculate distance from a point to a line segment
 */
function pointToSegmentDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Segment is a point
    return Math.hypot(px - x1, py - y1);
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Get wire at world coordinates (checks all wire segments)
 * Returns the connection index if a wire is hit
 *
 * For wires with manual waypoints, checks the orthogonal path through waypoints.
 * For wires without waypoints, uses auto-routing to match the rendered path.
 */
export function getWireAtPoint(
  worldX: number,
  worldY: number,
  connections: Connection[],
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>,
  hitRadius = 8,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): number | null {
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Track best (closest) hit across all wires
  let bestHitIndex: number | null = null;
  let bestHitDist = Infinity;

  // Build route requests for wires without manual waypoints
  const routeRequests: RouteRequest[] = [];
  const connectionMetadata: Array<{
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    conn: Connection;
  }> = [];

  // Create obstacles from devices
  const obstacles = createObstaclesForHitTest(devices, positions, partMap);

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    const fromDevice = resolveDevice(conn, 'from', devices);
    const toDevice = resolveDevice(conn, 'to', devices);
    if (!fromDevice || !toDevice) continue;

    const fromPos = positions.get(fromDevice.id);
    const toPos = positions.get(toDevice.id);
    if (!fromPos || !toPos) continue;

    const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
    const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;

    const fromGeometry = getSymbolGeometry(fromPart?.symbolCategory || fromPart?.category || 'unknown');
    const toGeometry = getSymbolGeometry(toPart?.symbolCategory || toPart?.category || 'unknown');

    const fromPinDef = fromGeometry.pins.find(p => p.id === conn.fromPin);
    const toPinDef = toGeometry.pins.find(p => p.id === conn.toPin);

    const fromPinPos = fromPinDef
      ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeometry, transforms?.[fromDevice.id])
      : { x: fromPos.x + fromGeometry.width / 2, y: fromPos.y + fromGeometry.height / 2 };
    const toPinPos = toPinDef
      ? getPinWorldPosition(toPos, toPinDef.position, toGeometry, transforms?.[toDevice.id])
      : { x: toPos.x + toGeometry.width / 2, y: toPos.y + toGeometry.height / 2 };

    const fromX = fromPinPos.x;
    const fromY = fromPinPos.y;
    const toX = toPinPos.x;
    const toY = toPinPos.y;

    // For wires with manual waypoints, use the orthogonal path directly
    if (conn.waypoints && conn.waypoints.length > 0) {
      const rawPoints: Point[] = [{ x: fromX, y: fromY }];
      rawPoints.push(...conn.waypoints);
      rawPoints.push({ x: toX, y: toY });
      const pathPoints = toOrthogonalPath(rawPoints);

      // Check each segment — track closest hit
      for (let j = 0; j < pathPoints.length - 1; j++) {
        const dist = pointToSegmentDistance(
          worldX, worldY,
          pathPoints[j].x, pathPoints[j].y,
          pathPoints[j + 1].x, pathPoints[j + 1].y
        );
        if (dist <= hitRadius && dist < bestHitDist) {
          bestHitDist = dist;
          bestHitIndex = i;
        }
      }
    } else {
      // Straight-line shortcut: if endpoints share X or Y, test directly
      const isStraight = Math.abs(fromX - toX) < 1 || Math.abs(fromY - toY) < 1;
      if (isStraight) {
        const dist = pointToSegmentDistance(worldX, worldY, fromX, fromY, toX, toY);
        if (dist <= hitRadius && dist < bestHitDist) {
          bestHitDist = dist;
          bestHitIndex = i;
        }
        continue;
      }

      // For auto-routed wires, collect for batch routing
      const fromRot = transforms?.[fromDevice.id]?.rotation || 0;
      const toRot = transforms?.[toDevice.id]?.rotation || 0;
      routeRequests.push({
        id: `wire_${i}`,
        start: { x: fromX, y: fromY },
        end: { x: toX, y: toY },
        startDirection: fromPinDef?.direction ? rotatePinDirection(fromPinDef.direction, fromRot) : undefined,
        endDirection: toPinDef?.direction ? rotatePinDirection(toPinDef.direction, toRot) : undefined,
        netId: conn.netId,
      });
      connectionMetadata.push({
        index: i,
        fromX,
        fromY,
        toX,
        toY,
        conn,
      });
    }
  }

  // Route wires without waypoints and check for hits
  if (routeRequests.length > 0) {
    const routeResults = routeWires(routeRequests, obstacles, 5, 8);

    for (let i = 0; i < routeResults.length; i++) {
      const routeResult = routeResults[i];
      const metadata = connectionMetadata[i];

      let pathPoints: Point[];
      if (routeResult.success && routeResult.path.waypoints.length >= 2) {
        pathPoints = routeResult.path.waypoints;
      } else {
        // Fallback: orthogonal path for direct connection
        const rawPoints = [
          { x: metadata.fromX, y: metadata.fromY },
          { x: metadata.toX, y: metadata.toY },
        ];
        pathPoints = toOrthogonalPath(rawPoints);
      }

      // Check each segment — track closest hit
      for (let j = 0; j < pathPoints.length - 1; j++) {
        const dist = pointToSegmentDistance(
          worldX, worldY,
          pathPoints[j].x, pathPoints[j].y,
          pathPoints[j + 1].x, pathPoints[j + 1].y
        );
        if (dist <= hitRadius && dist < bestHitDist) {
          bestHitDist = dist;
          bestHitIndex = metadata.index;
        }
      }
    }
  }

  return bestHitIndex;
}

/** Same as getWireAtPoint but also returns the distance to the closest wire */
export function getWireHitWithDistance(
  worldX: number, worldY: number,
  connections: Connection[], devices: Device[], parts: Part[],
  positions: Map<string, Point>, hitRadius = 8,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): { index: number; distance: number } | null {
  // Reuse getWireAtPoint logic but we need the distance too.
  // For efficiency, call getWireAtPoint with a tight radius first, then loosen.
  // Actually, do a simple segment-distance check for the found wire.
  const idx = getWireAtPoint(worldX, worldY, connections, devices, parts, positions, hitRadius, transforms);
  if (idx === null) return null;

  // Compute actual distance to the matched wire
  const conn = connections[idx];
  const partMap = new Map<string, Part>();
  for (const part of parts) partMap.set(part.id, part);

  const fromDevice = resolveDevice(conn, 'from', devices);
  const toDevice = resolveDevice(conn, 'to', devices);
  if (!fromDevice || !toDevice) return { index: idx, distance: hitRadius };

  const fromPos = positions.get(fromDevice.id);
  const toPos = positions.get(toDevice.id);
  if (!fromPos || !toPos) return { index: idx, distance: hitRadius };

  const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
  const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;
  const fromGeometry = getSymbolGeometry(fromPart?.symbolCategory || fromPart?.category || 'unknown');
  const toGeometry = getSymbolGeometry(toPart?.symbolCategory || toPart?.category || 'unknown');
  const fromPinDef = fromGeometry.pins.find(p => p.id === conn.fromPin);
  const toPinDef = toGeometry.pins.find(p => p.id === conn.toPin);
  const fromPinPos = fromPinDef
    ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeometry, transforms?.[fromDevice.id])
    : { x: fromPos.x + fromGeometry.width / 2, y: fromPos.y + fromGeometry.height / 2 };
  const toPinPos = toPinDef
    ? getPinWorldPosition(toPos, toPinDef.position, toGeometry, transforms?.[toDevice.id])
    : { x: toPos.x + toGeometry.width / 2, y: toPos.y + toGeometry.height / 2 };

  // Check waypoint path or straight line
  let minDist = Infinity;
  if (conn.waypoints && conn.waypoints.length > 0) {
    const pts = [fromPinPos, ...conn.waypoints, toPinPos];
    const path = toOrthogonalPath(pts);
    for (let j = 0; j < path.length - 1; j++) {
      const d = pointToSegmentDistance(worldX, worldY, path[j].x, path[j].y, path[j + 1].x, path[j + 1].y);
      if (d < minDist) minDist = d;
    }
  } else {
    minDist = pointToSegmentDistance(worldX, worldY, fromPinPos.x, fromPinPos.y, toPinPos.x, toPinPos.y);
  }

  return { index: idx, distance: minDist };
}

/**
 * Helper to create obstacles for hit testing (same as rendering)
 */
function createObstaclesForHitTest(
  devices: Device[],
  positions: Map<string, Point>,
  partMap: Map<string, Part>
): Obstacle[] {
  const obstacles: Obstacle[] = [];

  for (const device of devices) {
    const position = positions.get(device.id);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

    obstacles.push({
      id: device.id,
      bounds: {
        x: position.x,
        y: position.y,
        width: geometry.width,
        height: geometry.height,
      },
    });
  }

  return obstacles;
}

/**
 * Get waypoint handle at world coordinates
 * Returns { connectionIndex, waypointIndex } if a waypoint is hit
 */
export function getWaypointAtPoint(
  worldX: number,
  worldY: number,
  connections: Connection[],
  hitRadius = 8
): { connectionIndex: number; waypointIndex: number } | null {
  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    if (!conn.waypoints) continue;

    for (let j = 0; j < conn.waypoints.length; j++) {
      const wp = conn.waypoints[j];
      const dist = Math.hypot(worldX - wp.x, worldY - wp.y);
      if (dist <= hitRadius) {
        return { connectionIndex: i, waypointIndex: j };
      }
    }
  }

  return null;
}

/**
 * Get wire endpoint handle at world coordinates
 * Returns { connectionIndex, endpoint } if an endpoint is hit
 */
export function getWireEndpointAtPoint(
  worldX: number,
  worldY: number,
  connectionIndex: number,
  connections: Connection[],
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>,
  hitRadius = 10,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): { connectionIndex: number; endpoint: 'from' | 'to' } | null {
  const conn = connections[connectionIndex];
  if (!conn) return null;

  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  const fromDevice = resolveDevice(conn, 'from', devices);
  const toDevice = resolveDevice(conn, 'to', devices);
  if (!fromDevice || !toDevice) return null;

  const fromPos = positions.get(fromDevice.id);
  const toPos = positions.get(toDevice.id);
  if (!fromPos || !toPos) return null;

  const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
  const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;

  const fromGeometry = getSymbolGeometry(fromPart?.symbolCategory || fromPart?.category || 'unknown');
  const toGeometry = getSymbolGeometry(toPart?.symbolCategory || toPart?.category || 'unknown');

  const fromPinDef = fromGeometry.pins.find(p => p.id === conn.fromPin);
  const toPinDef = toGeometry.pins.find(p => p.id === conn.toPin);

  const fromPinPos = fromPinDef
    ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeometry, transforms?.[fromDevice.id])
    : { x: fromPos.x + fromGeometry.width / 2, y: fromPos.y + fromGeometry.height / 2 };
  const toPinPos = toPinDef
    ? getPinWorldPosition(toPos, toPinDef.position, toGeometry, transforms?.[toDevice.id])
    : { x: toPos.x + toGeometry.width / 2, y: toPos.y + toGeometry.height / 2 };

  const fromX = fromPinPos.x;
  const fromY = fromPinPos.y;
  const toX = toPinPos.x;
  const toY = toPinPos.y;

  // Check 'from' endpoint
  const fromDist = Math.hypot(worldX - fromX, worldY - fromY);
  if (fromDist <= hitRadius) {
    return { connectionIndex, endpoint: 'from' };
  }

  // Check 'to' endpoint
  const toDist = Math.hypot(worldX - toX, worldY - toY);
  if (toDist <= hitRadius) {
    return { connectionIndex, endpoint: 'to' };
  }

  return null;
}

/**
 * Find where to insert a new waypoint on a wire segment
 * Returns the segment index (waypoint will be inserted after this index in the waypoints array)
 */
export function getWireSegmentAtPoint(
  worldX: number,
  worldY: number,
  connection: Connection,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  hitRadius = 8
): number | null {
  // Build path points: start -> waypoints -> end, converted to orthogonal
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
      return j; // Return segment index (waypoint inserts after this)
    }
  }

  return null;
}

/**
 * Layout devices based on circuit topology
 *
 * Manual layout for the motor starter circuit:
 * - Power supply (PS1) at top-left
 * - Terminal strip (X1) below power
 * - Control buttons (S2, S1) in middle
 * - Contactor (K1) center-right
 * - Overload (F1) below contactor
 * - Motor (M1) at bottom
 *
 * @param devicePositions - Optional map of device positions for dynamically placed devices
 */
/**
 * Layout devices — positions keyed by device ID.
 * devicePositions map is keyed by device ID.
 */
function layoutDevices(
  devices: Device[],
  parts: Part[],
  devicePositions?: Map<string, Point>
): Map<string, Point> {
  const positions = new Map<string, Point>();

  // Legacy fallback layouts keyed by tag (for golden circuit with no saved positions)
  const layouts: Record<string, Point> = {
    'PS1': { x: 50, y: 80 },
    'X1': { x: 50, y: 280 },
    'S2': { x: 250, y: 250 },
    'S1': { x: 400, y: 250 },
    'K1': { x: 550, y: 250 },
    'F1': { x: 550, y: 400 },
    'M1': { x: 550, y: 550 },
  };

  for (const device of devices) {
    // First check if there's a dynamic position (keyed by device ID)
    const dynamicPos = devicePositions?.get(device.id);
    if (dynamicPos) {
      positions.set(device.id, dynamicPos);
    } else if (layouts[device.tag]) {
      // Fall back to hardcoded layout by tag
      positions.set(device.id, layouts[device.tag]);
    } else {
      // Fallback for unknown devices - place them in a grid
      const existingCount = positions.size;
      const col = existingCount % 3;
      const row = Math.floor(existingCount / 3);
      positions.set(device.id, { x: 100 + col * 200, y: 100 + row * 150 });
    }
  }

  return positions;
}

/**
 * Create obstacles from device positions
 */
function createObstacles(
  devices: Device[],
  positions: Map<string, Point>,
  partMap: Map<string, Part>
): Obstacle[] {
  const obstacles: Obstacle[] = [];

  for (const device of devices) {
    const position = positions.get(device.id);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

    obstacles.push({
      id: device.id,
      bounds: {
        x: position.x,
        y: position.y,
        width: geometry.width,
        height: geometry.height,
      },
    });
  }

  return obstacles;
}

/**
 * Render the circuit on canvas
 */
export function renderCircuit(
  ctx: CanvasRenderingContext2D,
  circuit: CircuitData,
  viewport: Viewport,
  debugMode = false,
  devicePositions?: Map<string, { x: number; y: number }>,
  options?: RenderOptions
): void {
  const { nets, parts } = circuit;
  const activeSheetId = options?.activeSheetId;

  // Filter devices and connections by active sheet if specified
  const devices = activeSheetId
    ? circuit.devices.filter(d => d.sheetId === activeSheetId)
    : circuit.devices;
  const deviceIdSet = new Set(devices.map(d => d.id));
  const connections = filterConnectionsBySheet(circuit.connections, devices, activeSheetId);

  // Create part lookup
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Layout devices (use devicePositions for dynamically placed devices)
  const positions = layoutDevices(devices, parts, devicePositions);

  const t = getTheme();

  // Clear canvas
  ctx.save();
  ctx.fillStyle = t.canvasBg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Apply viewport transform
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  // Round caps/joins for smoother, more polished lines
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Render visible grid with adaptive density
  if (options?.showGrid !== false) {
    const baseGridSize = options?.gridSize || 20;
    // Adaptive grid: coarsen when dots would be < 8px apart on screen
    let gridSize = baseGridSize;
    while (gridSize * viewport.scale < 8) {
      gridSize *= 5;
    }

    const invScale = 1 / viewport.scale;
    const startX = Math.floor((-viewport.offsetX * invScale) / gridSize) * gridSize;
    const startY = Math.floor((-viewport.offsetY * invScale) / gridSize) * gridSize;
    const endX = startX + (ctx.canvas.width * invScale) + gridSize;
    const endY = startY + (ctx.canvas.height * invScale) + gridSize;

    ctx.fillStyle = t.gridDotColor;
    for (let gx = startX; gx < endX; gx += gridSize) {
      for (let gy = startY; gy < endY; gy += gridSize) {
        ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
      }
    }
  }

  // Device transforms — merge persisted transforms from circuitData with runtime transforms
  const deviceTransforms = options?.deviceTransforms;
  const persistedTransforms = circuit.transforms;

  // Render ladder overlays from blocks on this sheet
  const activeSheet = circuit.sheets?.find(s => s.id === activeSheetId);
  const sheetBlocks = (circuit.blocks || []).filter(b => b.sheetId === activeSheetId);

  for (const block of sheetBlocks) {
    if (block.blockType === 'ladder') {
      const ladderBlock = block as LadderBlock;
      const blockRungs = (circuit.rungs || []).filter(r => r.blockId === block.id);
      renderLadderOverlay(ctx, ladderBlock.ladderConfig, blockRungs, block.position, !!options?.wireStart);
    }
  }

  // Fallback for un-migrated data: sheet-level ladder config
  if (sheetBlocks.length === 0 && activeSheet?.diagramType === 'ladder') {
    const sheetRungs = (circuit.rungs || []).filter(r => r.sheetId === activeSheetId);
    const fallbackConfig = activeSheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
    renderLadderOverlay(ctx, fallbackConfig, sheetRungs, { x: 0, y: 0 }, !!options?.wireStart);
  }

  // Render title block (sheet border + title block in bottom-right)
  if (activeSheet) {
    renderTitleBlock(ctx, activeSheet);
  }

  /** Resolve the effective transform for a device (runtime overrides persisted) */
  function getTransform(deviceId: string): DeviceTransform | undefined {
    if (deviceTransforms?.has(deviceId)) return deviceTransforms.get(deviceId);
    if (persistedTransforms?.[deviceId]) {
      const t = persistedTransforms[deviceId];
      return { rotation: t.rotation, mirrorH: t.mirrorH ?? false };
    }
    return undefined;
  }

  // FIRST: Render devices (symbols) - draw these first so wires appear on top
  for (const device of devices) {
    const position = positions.get(device.id);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const symbolKey = part?.symbolCategory || part?.category || 'unknown';
    const transform = getTransform(device.id);
    const partLabel = part ? part.partNumber : undefined;

    drawSymbol(ctx, symbolKey, position.x, position.y, device.tag, transform, partLabel);

    // Source/Destination arrow special rendering:
    // Show voltage label and cross-reference text around the arrow symbol
    if (symbolKey === 'source-arrow' || symbolKey === 'destination-arrow') {
      const geometry = getSymbolGeometry(symbolKey);
      const centerX = position.x + geometry.width / 2;
      const voltageLabel = device.function || '';  // e.g., "(+24VDC)"
      const crossRef = device.location || '';       // e.g., "Sheet 3, Rung 3100"

      ctx.save();
      ctx.textAlign = 'center';

      if (symbolKey === 'source-arrow') {
        // Source: voltage label ABOVE the triangle, cross-ref below pin
        ctx.fillStyle = t.tagColor;
        ctx.font = 'bold 11px monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(voltageLabel, centerX, position.y - 2);

        if (crossRef) {
          ctx.fillStyle = t.annotationColor;
          ctx.font = '9px monospace';
          ctx.textBaseline = 'top';
          ctx.fillText(crossRef, centerX, position.y + geometry.height + 14);
        }
      } else {
        // Destination: cross-ref above pin, voltage label BELOW the triangle
        if (crossRef) {
          ctx.fillStyle = t.annotationColor;
          ctx.font = '9px monospace';
          ctx.textBaseline = 'bottom';
          ctx.fillText(crossRef, centerX, position.y - 14);
        }

        ctx.fillStyle = t.tagColor;
        ctx.font = 'bold 11px monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(voltageLabel, centerX, position.y + geometry.height + 2);
      }

      ctx.restore();
    }
  }

  // Create obstacles from devices for routing
  const obstacles = createObstacles(devices, positions, partMap);

  // Build all route requests first
  const routeRequests: RouteRequest[] = [];
  const connectionMetadata: Array<{
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    conn: Connection;
  }> = [];

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    const fromDevice = resolveDevice(conn, 'from', devices);
    const toDevice = resolveDevice(conn, 'to', devices);
    if (!fromDevice || !toDevice) continue;

    const fromPos = positions.get(fromDevice.id);
    const toPos = positions.get(toDevice.id);
    if (!fromPos || !toPos) continue;

    const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
    const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;

    const fromGeometry = getSymbolGeometry(fromPart?.symbolCategory || fromPart?.category || 'unknown');
    const toGeometry = getSymbolGeometry(toPart?.symbolCategory || toPart?.category || 'unknown');

    // Find pin positions (accounting for device rotation)
    const fromPinDef = fromGeometry.pins.find(p => p.id === conn.fromPin);
    const toPinDef = toGeometry.pins.find(p => p.id === conn.toPin);

    const fromPinPos = fromPinDef
      ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeometry, getTransform(fromDevice.id))
      : { x: fromPos.x + fromGeometry.width / 2, y: fromPos.y + fromGeometry.height / 2 };
    const toPinPos = toPinDef
      ? getPinWorldPosition(toPos, toPinDef.position, toGeometry, getTransform(toDevice.id))
      : { x: toPos.x + toGeometry.width / 2, y: toPos.y + toGeometry.height / 2 };

    const fromX = fromPinPos.x;
    const fromY = fromPinPos.y;
    const toX = toPinPos.x;
    const toY = toPinPos.y;

    // Compute pin exit directions (accounting for device rotation)
    const fromRotation = getTransform(fromDevice.id)?.rotation || 0;
    const toRotation = getTransform(toDevice.id)?.rotation || 0;
    const startDir = fromPinDef?.direction
      ? rotatePinDirection(fromPinDef.direction, fromRotation)
      : undefined;
    const endDir = toPinDef?.direction
      ? rotatePinDirection(toPinDef.direction, toRotation)
      : undefined;

    routeRequests.push({
      id: `wire_${i}`,
      start: { x: fromX, y: fromY },
      end: { x: toX, y: toY },
      startDirection: startDir,
      endDirection: endDir,
      netId: conn.netId,
    });

    connectionMetadata.push({
      index: i,
      fromX,
      fromY,
      toX,
      toY,
      conn,
    });
  }

  // Route all wires together with nudging
  const routeResults = routeWires(routeRequests, obstacles, 5, 8); // 5px padding, 8px spacing

  // SECOND: Render connections (wires) ON TOP - use visibility graph routing with nudging
  ctx.lineWidth = t.wireWidth;

  // Color palette for wires
  const wireColors = t.wireColors;

  for (let i = 0; i < routeResults.length; i++) {
    const routeResult = routeResults[i];
    const metadata = connectionMetadata[i];
    const isSelected = options?.selectedWireIndex === metadata.index;

    // Set unique color for this wire (brighter if selected)
    const baseColor = wireColors[i % wireColors.length];
    ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
    ctx.lineWidth = isSelected ? t.wireWidthSelected : t.wireWidth;

    // Build path points for rendering
    let pathPoints: Point[] = [];

    // Straight-line optimization: if endpoints share X or Y, draw a direct line.
    // This prevents the auto-router from routing junction-to-junction bus segments
    // around obstacles. Matches KiCad/QElectroTech: wire segments are always straight.
    const isStraight = Math.abs(metadata.fromX - metadata.toX) < 1 ||
                       Math.abs(metadata.fromY - metadata.toY) < 1;

    if (isStraight && !(metadata.conn.waypoints && metadata.conn.waypoints.length > 0)) {
      // Direct straight wire — no routing needed
      pathPoints = [
        { x: metadata.fromX, y: metadata.fromY },
        { x: metadata.toX, y: metadata.toY },
      ];
    } else if (metadata.conn.waypoints && metadata.conn.waypoints.length > 0) {
      // If connection has manual waypoints, use them with orthogonal routing
      const rawPoints = [
        { x: metadata.fromX, y: metadata.fromY },
        ...metadata.conn.waypoints,
        { x: metadata.toX, y: metadata.toY },
      ];
      // Convert to orthogonal path (no diagonals)
      pathPoints = toOrthogonalPath(rawPoints);
    } else if (routeResult.success && routeResult.path.segments.length > 0) {
      // Use auto-routed path (already orthogonal)
      pathPoints = routeResult.path.waypoints;
    } else {
      // Fallback: orthogonal path for direct connection
      const rawPoints = [
        { x: metadata.fromX, y: metadata.fromY },
        { x: metadata.toX, y: metadata.toY },
      ];
      pathPoints = toOrthogonalPath(rawPoints);
    }

    // Draw the wire path
    if (pathPoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
      for (let j = 1; j < pathPoints.length; j++) {
        ctx.lineTo(pathPoints[j].x, pathPoints[j].y);
      }
      ctx.stroke();
    }

    // Draw waypoint handles if wire is selected and has manual waypoints
    if (isSelected && metadata.conn.waypoints && metadata.conn.waypoints.length > 0) {
      ctx.fillStyle = t.waypointFill;
      ctx.strokeStyle = t.waypointStroke;
      ctx.lineWidth = 1.5;

      for (const wp of metadata.conn.waypoints) {
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, t.waypointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Reset line width
    ctx.lineWidth = t.wireWidth;

    // Draw connection points (circles at wire endpoints)
    // When wire is selected, show larger draggable handles
    if (isSelected) {
      ctx.fillStyle = t.wireEndpointSelectedColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      // From endpoint
      ctx.beginPath();
      ctx.arc(metadata.fromX, metadata.fromY, t.wireEndpointSelectedRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // To endpoint
      ctx.beginPath();
      ctx.arc(metadata.toX, metadata.toY, t.wireEndpointSelectedRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = t.wireEndpointColor;
      ctx.beginPath();
      ctx.arc(metadata.fromX, metadata.fromY, t.wireEndpointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(metadata.toX, metadata.toY, t.wireEndpointRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wire number label (always visible)
    {
      // Use explicit wireNumber if set, otherwise auto-generate
      const wireNumber = metadata.conn.wireNumber || `W${String(metadata.index + 1).padStart(3, '0')}`;

      // Calculate label position along the longest segment
      let labelX = (metadata.fromX + metadata.toX) / 2;
      let labelY = (metadata.fromY + metadata.toY) / 2;
      if (pathPoints.length >= 2) {
        // Find longest segment for label placement
        let maxLen = 0;
        let bestMidX = labelX;
        let bestMidY = labelY;
        for (let j = 0; j < pathPoints.length - 1; j++) {
          const segLen = Math.hypot(
            pathPoints[j + 1].x - pathPoints[j].x,
            pathPoints[j + 1].y - pathPoints[j].y
          );
          if (segLen > maxLen) {
            maxLen = segLen;
            bestMidX = (pathPoints[j].x + pathPoints[j + 1].x) / 2;
            bestMidY = (pathPoints[j].y + pathPoints[j + 1].y) / 2;
          }
        }
        labelX = bestMidX;
        labelY = bestMidY;
      }

      ctx.save();
      const labelColor = wireColors[metadata.index % wireColors.length];
      ctx.font = t.wireLabelFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(wireNumber);
      const padding = 3;

      // Background
      ctx.fillStyle = t.wireLabelBg;
      ctx.fillRect(
        labelX - metrics.width / 2 - padding,
        labelY - 7,
        metrics.width + padding * 2,
        14
      );

      // Text
      ctx.fillStyle = labelColor;
      ctx.fillText(wireNumber, labelX, labelY);
      ctx.restore();
    }

    // Debug mode: Draw additional endpoint info
    if (debugMode) {
      const net = nets.find(n => n.id === metadata.conn.netId);
      const netName = net?.name || 'unknown';

      ctx.save();
      const labelColor = wireColors[metadata.index % wireColors.length];

      // Endpoint labels (device:pin)
      ctx.font = '10px monospace';

      // From endpoint
      const fromLabel = `${metadata.conn.fromDevice}:${metadata.conn.fromPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const fromMetrics = ctx.measureText(fromLabel);
      ctx.fillRect(
        metadata.fromX - fromMetrics.width / 2 - 2,
        metadata.fromY - 18,
        fromMetrics.width + 4,
        12
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fromLabel, metadata.fromX, metadata.fromY - 6);

      // To endpoint
      const toLabel = `${metadata.conn.toDevice}:${metadata.conn.toPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const toMetrics = ctx.measureText(toLabel);
      ctx.fillRect(
        metadata.toX - toMetrics.width / 2 - 2,
        metadata.toY + 6,
        toMetrics.width + 4,
        12
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(toLabel, metadata.toX, metadata.toY + 6);

      // Net name near wire midpoint
      const netLabel = `(${netName})`;
      ctx.font = '9px monospace';
      const netMetrics = ctx.measureText(netLabel);
      const midX = (metadata.fromX + metadata.toX) / 2;
      const midY = (metadata.fromY + metadata.toY) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(midX - netMetrics.width / 2 - 2, midY + 8, netMetrics.width + 4, 12);
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(netLabel, midX, midY + 8);

      ctx.restore();
    }
  }

  // Draw selection highlights for all selected devices (selectedDevices contains device IDs)
  if (options?.selectedDevices && options.selectedDevices.length > 0) {
    ctx.strokeStyle = t.selectionColor;
    ctx.lineWidth = t.selectionWidth;
    ctx.setLineDash(t.selectionDash);

    for (const selectedId of options.selectedDevices) {
      const device = devices.find(d => d.id === selectedId);
      if (device) {
        const position = positions.get(device.id);
        if (position) {
          const part = device.partId ? partMap.get(device.partId) : null;
          const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

          ctx.strokeRect(
            position.x - 5,
            position.y - 5,
            geometry.width + 10,
            geometry.height + 10
          );
        }
      }
    }

    ctx.setLineDash([]);
  }

  // Draw wire-in-progress indicator (highlight the start pin) and preview line
  // wireStart.device is now device ID
  if (options?.wireStart) {
    const device = devices.find(d => d.id === options.wireStart!.device);
    if (device) {
      const position = positions.get(device.id);
      if (position) {
        const part = device.partId ? partMap.get(device.partId) : null;
        const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
        const transform = options.deviceTransforms?.get(device.id);
        const pin = geometry.pins.find(p => p.id === options.wireStart!.pin);

        if (pin) {
          // Apply rotation transform to pin position if device is rotated
          let pinOffsetX = pin.position.x;
          let pinOffsetY = pin.position.y;
          if (transform?.rotation) {
            const cx = geometry.width / 2;
            const cy = geometry.height / 2;
            const rad = (transform.rotation * Math.PI) / 180;
            const dx = pin.position.x - cx;
            const dy = pin.position.y - cy;
            pinOffsetX = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
            pinOffsetY = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
          }

          const pinX = position.x + pinOffsetX;
          const pinY = position.y + pinOffsetY;

          // Draw pulsing highlight circle around the pin
          ctx.strokeStyle = t.wireStartHighlight;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pinX, pinY, 10, 0, Math.PI * 2);
          ctx.stroke();

          // Draw filled inner circle
          ctx.fillStyle = t.wireStartFill;
          ctx.beginPath();
          ctx.arc(pinX, pinY, 10, 0, Math.PI * 2);
          ctx.fill();

          // Draw preview line from start pin to mouse cursor (orthogonal L-shape)
          if (options.wirePreviewMouse) {
            const previewPath = toOrthogonalPath([
              { x: pinX, y: pinY },
              { x: options.wirePreviewMouse.x, y: options.wirePreviewMouse.y },
            ]);
            ctx.strokeStyle = t.wirePreviewColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(previewPath[0].x, previewPath[0].y);
            for (let i = 1; i < previewPath.length; i++) {
              ctx.lineTo(previewPath[i].x, previewPath[i].y);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw small circle at mouse position
            ctx.strokeStyle = t.wirePreviewColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(options.wirePreviewMouse.x, options.wirePreviewMouse.y, 5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }
  }

  // Draw ghost preview for placement mode
  if (options?.ghostSymbol) {
    ctx.globalAlpha = 0.5;
    drawSymbol(ctx, options.ghostSymbol.category, options.ghostSymbol.x, options.ghostSymbol.y, '');
    ctx.globalAlpha = 1.0;
  }

  // Draw ghost paste preview (multiple devices)
  if (options?.ghostPaste && options.ghostPaste.length > 0) {
    ctx.globalAlpha = 0.4;
    for (const ghost of options.ghostPaste) {
      if (ghost.rotation || ghost.mirrorH) {
        const geom = getSymbolGeometry(ghost.category);
        const cx = ghost.x + geom.width / 2;
        const cy = ghost.y + geom.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        if (ghost.rotation) ctx.rotate((ghost.rotation * Math.PI) / 180);
        if (ghost.mirrorH) ctx.scale(-1, 1);
        ctx.translate(-cx, -cy);
        drawSymbol(ctx, ghost.category, ghost.x, ghost.y, ghost.tag);
        ctx.restore();
      } else {
        drawSymbol(ctx, ghost.category, ghost.x, ghost.y, ghost.tag);
      }
    }
    ctx.globalAlpha = 1.0;
  }

  // Draw endpoint dragging preview (shows line from fixed endpoint to mouse)
  if (options?.draggingEndpoint) {
    const conn = connections[options.draggingEndpoint.connectionIndex];
    if (conn) {
      // Get the fixed endpoint position (the one NOT being dragged)
      const fixedEndpoint = options.draggingEndpoint.endpoint === 'from' ? 'to' : 'from';
      const fixedPinId = fixedEndpoint === 'from' ? conn.fromPin : conn.toPin;
      const fixedDeviceObj = resolveDevice(conn, fixedEndpoint, devices);

      if (fixedDeviceObj) {
        const fixedPos = positions.get(fixedDeviceObj.id);
        if (fixedPos) {
          const fixedPart = fixedDeviceObj.partId ? partMap.get(fixedDeviceObj.partId) : null;
          const fixedGeometry = getSymbolGeometry(fixedPart?.symbolCategory || fixedPart?.category || 'unknown');
          const fixedPin = fixedGeometry.pins.find(p => p.id === fixedPinId);

          const fixedX = fixedPos.x + (fixedPin?.position.x ?? fixedGeometry.width / 2);
          const fixedY = fixedPos.y + (fixedPin?.position.y ?? fixedGeometry.height / 2);

          // Draw preview line from fixed endpoint to mouse
          ctx.strokeStyle = t.dragEndpointColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(fixedX, fixedY);
          ctx.lineTo(options.draggingEndpoint.mousePos.x, options.draggingEndpoint.mousePos.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw circle at mouse position
          ctx.fillStyle = t.dragEndpointColor;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(options.draggingEndpoint.mousePos.x, options.draggingEndpoint.mousePos.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  // Render annotations (text labels on the active sheet)
  const annotations = circuit.annotations || [];
  const sheetAnnotations = activeSheetId
    ? annotations.filter(a => a.sheetId === activeSheetId)
    : annotations;

  for (const annotation of sheetAnnotations) {
    if (annotation.annotationType === 'text') {
      const fontSize = annotation.style?.fontSize || 14;
      const fontWeight = annotation.style?.fontWeight || 'normal';

      ctx.fillStyle = t.annotationColor;
      ctx.font = `${fontWeight} ${fontSize}px monospace`;
      ctx.textAlign = (annotation.style?.textAlign as CanvasTextAlign) || 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(annotation.content, annotation.position.x, annotation.position.y);

      // Draw selection highlight if this annotation is selected
      if (options?.selectedAnnotationId === annotation.id) {
        const textWidth = annotation.content.length * fontSize * 0.6;
        const textHeight = fontSize * 1.2;
        ctx.strokeStyle = t.annotationSelectionColor;
        ctx.lineWidth = t.selectionWidth;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(
          annotation.position.x - 3,
          annotation.position.y - 3,
          textWidth + 6,
          textHeight + 6
        );
        ctx.setLineDash([]);
      }
    }
  }

  // Draw marquee selection rectangle
  if (options?.marquee) {
    const { startX, startY, endX, endY, mode } = options.marquee;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    ctx.strokeStyle = mode === 'window' ? t.marqueeWindowColor : t.marqueeCrossingColor;
    ctx.lineWidth = 1 / viewport.scale;

    if (mode === 'window') {
      // Window select: solid border, light fill
      ctx.setLineDash([]);
      ctx.fillStyle = t.marqueeWindowFill;
    } else {
      // Crossing select: dashed border, light fill
      ctx.setLineDash([6 / viewport.scale, 3 / viewport.scale]);
      ctx.fillStyle = t.marqueeCrossingFill;
    }

    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

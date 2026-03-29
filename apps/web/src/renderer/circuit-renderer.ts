/**
 * Circuit Renderer
 *
 * Renders the golden circuit on canvas
 */

import type { Device, Net, Part, Sheet, Annotation, Terminal, Rung, AnyDiagramBlock, LadderBlock } from '@fusion-cad/core-model';
import { MM_TO_PX, GRID_MM } from '@fusion-cad/core-model';
import { drawSymbol, getSymbolGeometry } from './symbols';
import type { Point, Viewport, DeviceTransform } from './types';
import { DEFAULT_LADDER_CONFIG, generateCrossReferences, formatCrossRefText, autoAssignWireNumbers, computeRungDisplayNumber } from '@fusion-cad/core-engine';
import type { MarqueeRect } from '../hooks/useCanvasInteraction';
import { renderLadderOverlay } from './ladder-renderer';
import { renderTitleBlock, SHEET_SIZES } from './title-block';
import { getTheme } from './theme';


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
  /**
   * Wire routing waypoints. Three-state semantic:
   * - `undefined`: Auto-routed wire (visibility graph + A* pathfinding every frame)
   * - `[]` (empty array): User-drawn wire — bypasses auto-router, uses orthogonal path
   * - `[...points]`: Template/manual waypoints — bypasses auto-router, routes through points
   *
   * Check `waypoints != null` to distinguish auto-routed vs manual/template.
   * Check `waypoints?.length > 0` only when you need actual waypoint coordinates.
   */
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
  /** Show pin labels on devices (default true) */
  showPinLabels?: boolean;
  /** Show device function/description text above symbols (default true) */
  showDescriptions?: boolean;
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

    // If not already aligned, add intermediate point for orthogonal routing.
    // Choose direction based on which axis has the larger delta:
    // - Larger horizontal delta → horizontal first (good for ladder rungs)
    // - Larger vertical delta → vertical first (good for vertical feeds)
    if (prev.x !== curr.x && prev.y !== curr.y) {
      const dx = Math.abs(curr.x - prev.x);
      const dy = Math.abs(curr.y - prev.y);
      if (dx >= dy) {
        // Horizontal first, then vertical
        result.push({ x: curr.x, y: prev.y });
      } else {
        // Vertical first, then horizontal
        result.push({ x: prev.x, y: curr.y });
      }
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

    // Build path: waypoints if present, otherwise direct/L-shape
    let pathPoints: Point[];
    if (conn.waypoints && conn.waypoints.length > 0) {
      pathPoints = toOrthogonalPath([
        fromPinPos,
        ...conn.waypoints,
        toPinPos,
      ]);
    } else {
      pathPoints = toOrthogonalPath([fromPinPos, toPinPos]);
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
        bestHitIndex = i;
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

  // Check path segments for closest distance
  let minDist = Infinity;
  const pts = conn.waypoints && conn.waypoints.length > 0
    ? [fromPinPos, ...conn.waypoints, toPinPos]
    : [fromPinPos, toPinPos];
  const path = toOrthogonalPath(pts);
  for (let j = 0; j < path.length - 1; j++) {
    const d = pointToSegmentDistance(worldX, worldY, path[j].x, path[j].y, path[j + 1].x, path[j + 1].y);
    if (d < minDist) minDist = d;
  }

  return { index: idx, distance: minDist };
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

  // Apply viewport transform (mm → screen pixels)
  // MM_TO_PX converts mm coordinates to base screen pixels,
  // then viewport.scale applies user zoom on top.
  const mmScale = viewport.scale * MM_TO_PX;
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(mmScale, mmScale);

  // Round caps/joins for smoother, more polished lines
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Render visible grid with adaptive density
  if (options?.showGrid !== false) {
    const baseGridSize = options?.gridSize || GRID_MM;
    // Adaptive grid: coarsen when dots would be < 8px apart on screen
    let gridSize = baseGridSize;
    while (gridSize * mmScale < 8) {
      gridSize *= 5;
    }

    const invScale = 1 / mmScale;
    const startX = Math.floor((-viewport.offsetX * invScale) / gridSize) * gridSize;
    const startY = Math.floor((-viewport.offsetY * invScale) / gridSize) * gridSize;
    const endX = startX + (ctx.canvas.width * invScale) + gridSize;
    const endY = startY + (ctx.canvas.height * invScale) + gridSize;

    ctx.fillStyle = t.gridDotColor;
    for (let gx = startX; gx < endX; gx += gridSize) {
      for (let gy = startY; gy < endY; gy += gridSize) {
        ctx.fillRect(gx - 0.125, gy - 0.125, 0.25, 0.25);
      }
    }
  }

  // Device transforms — merge persisted transforms from circuitData with runtime transforms
  const deviceTransforms = options?.deviceTransforms;
  const persistedTransforms = circuit.transforms;

  const activeSheet = circuit.sheets?.find(s => s.id === activeSheetId);
  const sheetBlocks = (circuit.blocks || []).filter(b => b.sheetId === activeSheetId);
  const sheetNum = activeSheet?.number ?? 1;

  // Render title block FIRST (sheet background + border) so ladder overlay draws on top
  if (activeSheet) {
    renderTitleBlock(ctx, activeSheet);
  }

  // Sheet height for rung count calculation
  const sheetSizeMM = SHEET_SIZES[activeSheet?.size || 'Tabloid'] || SHEET_SIZES['Tabloid'];
  const sheetHeight = sheetSizeMM.height;

  // Render ladder overlays from blocks on this sheet
  for (const block of sheetBlocks) {
    if (block.blockType === 'ladder') {
      const ladderBlock = block as LadderBlock;
      const blockRungs = (circuit.rungs || []).filter(r => r.blockId === block.id);
      const mergedConfig = { ...DEFAULT_LADDER_CONFIG, ...ladderBlock.ladderConfig };
      renderLadderOverlay(ctx, mergedConfig, blockRungs, block.position, !!options?.wireStart, sheetNum, sheetHeight);
    }
  }

  // Fallback for un-migrated data: sheet-level ladder config
  if (sheetBlocks.length === 0 && activeSheet?.diagramType === 'ladder') {
    const sheetRungs = (circuit.rungs || []).filter(r => r.sheetId === activeSheetId);
    const fallbackConfig = activeSheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
    renderLadderOverlay(ctx, fallbackConfig, sheetRungs, { x: 0, y: 0 }, !!options?.wireStart, sheetNum, sheetHeight);
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
    const partLabel = part && part.partNumber && part.partNumber !== 'TBD' ? part.partNumber : undefined;

    drawSymbol(ctx, symbolKey, position.x, position.y, device.tag, transform, partLabel, device.pinAliases, options?.showPinLabels);

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
        ctx.font = 'bold 2.75px monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(voltageLabel, centerX, position.y - 0.5);

        if (crossRef) {
          ctx.fillStyle = t.annotationColor;
          ctx.font = '2.25px monospace';
          ctx.textBaseline = 'top';
          ctx.fillText(crossRef, centerX, position.y + geometry.height + 3.5);
        }
      } else {
        // Destination: cross-ref above pin, voltage label BELOW the triangle
        if (crossRef) {
          ctx.fillStyle = t.annotationColor;
          ctx.font = '2.25px monospace';
          ctx.textBaseline = 'bottom';
          ctx.fillText(crossRef, centerX, position.y - 3.5);
        }

        ctx.fillStyle = t.tagColor;
        ctx.font = 'bold 2.75px monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(voltageLabel, centerX, position.y + geometry.height + 0.5);
      }

      ctx.restore();
    }

    // Render device function text for regular devices (not arrows, not junctions)
    if (options?.showDescriptions !== false && symbolKey !== 'source-arrow' && symbolKey !== 'destination-arrow' && symbolKey !== 'junction') {
      const fn = device.function;
      if (fn) {
        const geometry = getSymbolGeometry(symbolKey);
        ctx.save();
        ctx.font = '2.25px monospace';
        ctx.fillStyle = t.annotationColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Render above the device tag (tag is at y-0.75, so function goes at y-4.5)
        ctx.fillText(fn, position.x + geometry.width / 2, position.y - 4.5);
        ctx.restore();
      }
    }
  }

  // Render cross-reference annotations (e.g., "/2, /3" next to devices appearing on multiple sheets)
  if (circuit.sheets && circuit.sheets.length > 1 && activeSheetId) {
    const crossRefDevices = circuit.devices.map(d => {
      const p = d.partId ? partMap.get(d.partId) : null;
      return { tag: d.tag, sheetId: d.sheetId, category: p?.symbolCategory || p?.category };
    });
    const crossRefSheets = circuit.sheets.map(s => ({ id: s.id, name: s.name, number: s.number ?? 0 }));
    const crossRefs = generateCrossReferences(crossRefDevices, crossRefSheets);

    if (crossRefs.length > 0) {
      ctx.save();
      ctx.font = 'bold 2.25px monospace';
      ctx.fillStyle = t.annotationColor;
      ctx.textBaseline = 'top';

      for (const device of devices) {
        const refText = formatCrossRefText(device.tag, activeSheetId, crossRefs);
        if (!refText) continue;

        const position = positions.get(device.id);
        if (!position) continue;

        const part = device.partId ? partMap.get(device.partId) : null;
        const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

        // Place cross-ref text to the right of the device, slightly below center
        const xRefX = position.x + geometry.width + 1;
        const xRefY = position.y + geometry.height / 2 + 0.5;

        ctx.textAlign = 'left';
        ctx.fillText(refText, xRefX, xRefY);
      }

      ctx.restore();
    }
  }

  // Resolve pin positions for all connections (no auto-routing — simple direct/L-shape paths)
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

    const fromPinDef = fromGeometry.pins.find(p => p.id === conn.fromPin);
    const toPinDef = toGeometry.pins.find(p => p.id === conn.toPin);

    const fromPinPos = fromPinDef
      ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeometry, getTransform(fromDevice.id))
      : { x: fromPos.x + fromGeometry.width / 2, y: fromPos.y + fromGeometry.height / 2 };
    const toPinPos = toPinDef
      ? getPinWorldPosition(toPos, toPinDef.position, toGeometry, getTransform(toDevice.id))
      : { x: toPos.x + toGeometry.width / 2, y: toPos.y + toGeometry.height / 2 };

    connectionMetadata.push({
      index: i,
      fromX: fromPinPos.x,
      fromY: fromPinPos.y,
      toX: toPinPos.x,
      toY: toPinPos.y,
      conn,
    });
  }

  // Auto-compute wire numbers for connections that don't have them
  const sheetRungs = (circuit.rungs || []).filter(r => r.sheetId === activeSheetId);

  // Resolve ladder config for display number computation
  const ladderBlock = sheetBlocks.find(b => b.blockType === 'ladder') as LadderBlock | undefined;
  const ladderConfig = { ...DEFAULT_LADDER_CONFIG, ...(activeSheet?.ladderConfig), ...(ladderBlock?.ladderConfig) };

  // Sort rungs and compute display numbers based on numbering scheme
  const sortedRungs = [...sheetRungs].sort((a, b) => a.number - b.number);

  // Enrich rung device lists with position-based assignment.
  // Devices placed near a rung's Y (e.g., junctions, manually placed devices) get
  // included even if they're not in rung.deviceIds, so wire numbering is correct.
  const blockOffset = ladderBlock?.position ?? { x: 0, y: 0 };
  const enrichedRungs = sortedRungs.map((r, i) => {
    const rungY = ladderConfig.firstRungY + i * ladderConfig.rungSpacing + blockOffset.y;
    const halfSpacing = ladderConfig.rungSpacing / 2;
    const knownIds = new Set(r.deviceIds);

    // Find sheet devices positioned within this rung's Y band
    for (const dev of devices) {
      if (knownIds.has(dev.id)) continue;
      const pos = positions.get(dev.id);
      if (!pos) continue;
      // Use device center Y (pos.y is top-left, typical symbol height ~15-25mm)
      const devCenterY = pos.y + 10; // approximate center
      if (Math.abs(devCenterY - rungY) < halfSpacing) {
        knownIds.add(dev.id);
      }
    }

    // Sort all device IDs by X position (left-to-right) for correct wire numbering
    const allIds = [...knownIds];
    allIds.sort((a, b) => {
      const posA = positions.get(a);
      const posB = positions.get(b);
      return (posA?.x ?? 0) - (posB?.x ?? 0);
    });

    return {
      number: r.number,
      displayNumber: computeRungDisplayNumber(i, r.number, sheetNum, ladderConfig),
      sheetId: r.sheetId,
      deviceIds: allIds,
    };
  });

  const wireAssignments = autoAssignWireNumbers(
    connections.map(c => ({
      fromDevice: c.fromDevice,
      fromDeviceId: c.fromDeviceId,
      fromPin: c.fromPin,
      toDevice: c.toDevice,
      toDeviceId: c.toDeviceId,
      toPin: c.toPin,
      netId: c.netId,
      sheetId: c.sheetId,
      wireNumber: c.wireNumber,
    })),
    circuit.nets,
    enrichedRungs,
    activeSheetId,
    positions,
  );
  const autoWireNumbers = new Map<number, string>();
  for (const a of wireAssignments) {
    if (!a.isManual) {
      autoWireNumbers.set(a.index, a.wireNumber);
    }
  }

  // SECOND: Render connections (wires) ON TOP - use visibility graph routing with nudging
  ctx.lineWidth = t.wireWidth;

  // Color palette for wires
  const wireColors = t.wireColors;

  for (let i = 0; i < connectionMetadata.length; i++) {
    const metadata = connectionMetadata[i];
    const isSelected = options?.selectedWireIndex === metadata.index;

    // Single wire color; selected wires highlight white
    const baseColor = wireColors[0];
    ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
    ctx.lineWidth = isSelected ? t.wireWidthSelected : t.wireWidth;

    // Build path: explicit waypoints if present, otherwise direct/L-shape
    let pathPoints: Point[];
    if (metadata.conn.waypoints && metadata.conn.waypoints.length > 0) {
      // Connection has explicit waypoints — route through them
      pathPoints = toOrthogonalPath([
        { x: metadata.fromX, y: metadata.fromY },
        ...metadata.conn.waypoints,
        { x: metadata.toX, y: metadata.toY },
      ]);
    } else {
      // Direct connection: straight line if aligned, L-shape otherwise
      pathPoints = toOrthogonalPath([
        { x: metadata.fromX, y: metadata.fromY },
        { x: metadata.toX, y: metadata.toY },
      ]);
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

    // Wire number label — show manual wire numbers and rung-based auto-numbers.
    // Skip generic W### placeholders (sequential fallback) to avoid clutter.
    const effectiveWireNumber = metadata.conn.wireNumber || autoWireNumbers.get(metadata.index);
    const isAutoPlaceholder = effectiveWireNumber?.startsWith('W') && /^W\d{3}$/.test(effectiveWireNumber);
    if (effectiveWireNumber && !isAutoPlaceholder) {
      const wireNumber = effectiveWireNumber;

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
      const labelColor = wireColors[0];
      ctx.font = t.wireLabelFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Offset label above the wire so it doesn't visually interrupt it
      const labelOffsetY = labelY - 1.5;

      const metrics = ctx.measureText(wireNumber);
      const padding = 1;
      const textHeight = 3.5; // approximate font height in mm

      // Background — tight, semi-transparent so wire shows through
      ctx.fillStyle = t.wireLabelBg;
      ctx.fillRect(
        labelX - metrics.width / 2 - padding,
        labelOffsetY - textHeight,
        metrics.width + padding * 2,
        textHeight + 0.5
      );

      // Text
      ctx.fillStyle = labelColor;
      ctx.fillText(wireNumber, labelX, labelOffsetY);
      ctx.restore();
    }

    // Debug mode: Draw additional endpoint info
    if (debugMode) {
      const net = nets.find(n => n.id === metadata.conn.netId);
      const netName = net?.name || 'unknown';

      ctx.save();
      const labelColor = wireColors[0];

      // Endpoint labels (device:pin)
      ctx.font = '2.5px monospace';

      // From endpoint
      const fromLabel = `${metadata.conn.fromDevice}:${metadata.conn.fromPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const fromMetrics = ctx.measureText(fromLabel);
      ctx.fillRect(
        metadata.fromX - fromMetrics.width / 2 - 0.5,
        metadata.fromY - 4.5,
        fromMetrics.width + 1,
        3
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fromLabel, metadata.fromX, metadata.fromY - 1.5);

      // To endpoint
      const toLabel = `${metadata.conn.toDevice}:${metadata.conn.toPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const toMetrics = ctx.measureText(toLabel);
      ctx.fillRect(
        metadata.toX - toMetrics.width / 2 - 0.5,
        metadata.toY + 1.5,
        toMetrics.width + 1,
        3
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(toLabel, metadata.toX, metadata.toY + 1.5);

      // Net name near wire midpoint
      const netLabel = `(${netName})`;
      ctx.font = '2.25px monospace';
      const netMetrics = ctx.measureText(netLabel);
      const midX = (metadata.fromX + metadata.toX) / 2;
      const midY = (metadata.fromY + metadata.toY) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(midX - netMetrics.width / 2 - 0.5, midY + 2, netMetrics.width + 1, 3);
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(netLabel, midX, midY + 2);

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
          const transform = getTransform(device.id);
          const rotation = transform?.rotation || 0;

          // Swap width/height for rotated devices (90° or 270°)
          const isRotated90 = rotation % 180 !== 0;
          const w = isRotated90 ? geometry.height : geometry.width;
          const h = isRotated90 ? geometry.width : geometry.height;

          // Center the selection box on the device center
          const cx = position.x + geometry.width / 2;
          const cy = position.y + geometry.height / 2;

          ctx.strokeRect(
            cx - w / 2 - 5,
            cy - h / 2 - 5,
            w + 10,
            h + 10
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

          // Draw highlight circle around the wire start pin
          ctx.strokeStyle = t.wireStartHighlight;
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.arc(pinX, pinY, 3, 0, Math.PI * 2);
          ctx.stroke();

          // Draw filled inner circle
          ctx.fillStyle = t.wireStartFill;
          ctx.beginPath();
          ctx.arc(pinX, pinY, 1.5, 0, Math.PI * 2);
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
        ctx.setLineDash(t.selectionDash);
        ctx.strokeRect(
          annotation.position.x - 0.75,
          annotation.position.y - 0.75,
          textWidth + 1.5,
          textHeight + 1.5
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
    ctx.lineWidth = 1 / mmScale;

    if (mode === 'window') {
      // Window select: solid border, light fill
      ctx.setLineDash([]);
      ctx.fillStyle = t.marqueeWindowFill;
    } else {
      // Crossing select: dashed border, light fill
      ctx.setLineDash([6 / mmScale, 3 / mmScale]);
      ctx.fillStyle = t.marqueeCrossingFill;
    }

    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

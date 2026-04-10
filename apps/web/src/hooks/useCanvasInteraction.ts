/**
 * Canvas interaction hook - all mouse/keyboard handlers
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Part, Annotation } from '@fusion-cad/core-model';
import { MM_TO_PX, GRID_MM } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import { getWireAtPoint, getWireHitWithDistance, getWaypointAtPoint, getWireEndpointAtPoint, getWireSegmentAtPoint, getWireSpecLabelAtPoint, toOrthogonalPath, getPinWorldPosition, resolveDevice, filterConnectionsBySheet } from '../renderer/circuit-renderer';
import type { Connection, SheetConnection } from '../renderer/circuit-renderer';
import type { Point, Viewport, DeviceTransform } from '../renderer/types';
import {
  snapToGrid,
  isSnapEnabled,
  setSnapEnabled,
  getPinAtPoint,
  getSymbolAtPoint,
  type InteractionMode,
  type SymbolCategory,
  type PinHit,
  type ShapeToolType,
} from '../types';
import { getSymbolGeometry } from '../renderer/symbols';

export type ManufacturerPart = Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>;

export interface DraggingEndpointState {
  connectionIndex: number;
  endpoint: 'from' | 'to';
  originalPin: PinHit;
}

export interface MarqueeRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  mode: 'window' | 'crossing'; // window = left-to-right (solid), crossing = right-to-left (dashed)
}

export interface UseCanvasInteractionReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  interactionMode: InteractionMode;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  placementCategory: SymbolCategory | null;
  setPlacementCategory: React.Dispatch<React.SetStateAction<SymbolCategory | null>>;
  wireStart: PinHit | null;
  setWireStart: React.Dispatch<React.SetStateAction<PinHit | null>>;
  wireWaypoints: Point[];
  mouseWorldPos: Point | null;
  draggingDevice: string | null;
  draggingEndpoint: DraggingEndpointState | null;
  marquee: MarqueeRect | null;
  contextMenu: { x: number; y: number; worldX: number; worldY: number; target: 'device' | 'wire' | 'canvas'; deviceTag?: string; wireIndex?: number } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<UseCanvasInteractionReturn['contextMenu']>>;
  zoomToFit: () => void;
  /** Ref for Canvas imperative render handle (zoom bypass) */
  renderHandleRef: React.MutableRefObject<import('../components/Canvas').CanvasRenderHandle | null>;
  /** Whether paste ghost preview is active */
  pastePreview: boolean;
  /** Pending text annotation position (waiting for user input) */
  pendingTextPosition: Point | null;
  setPendingTextPosition: React.Dispatch<React.SetStateAction<Point | null>>;
  editingAnnotationId: string | null;
  setEditingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Shape drawing tool type */
  shapeToolType: ShapeToolType;
  setShapeToolType: React.Dispatch<React.SetStateAction<ShapeToolType>>;
  /** Live shape drawing preview (computed from ref + mouseWorldPos) */
  drawingShapePreview: { type: ShapeToolType; start: Point; end: Point } | null;
  /** Sheet-filtered connections (same filtering as renderer) for passing to Canvas context menu */
  sheetConnections: SheetConnection[];
}

interface UseCanvasInteractionDeps {
  circuit: CircuitData | null;
  selectedDevices: string[];  // device IDs
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWireIndex: number | null;
  setSelectedWireIndex: React.Dispatch<React.SetStateAction<number | null>>;
  getAllPositions: () => Map<string, Point>;  // keyed by device ID
  placeSymbol: (worldX: number, worldY: number, category: SymbolCategory, partData?: ManufacturerPart) => void;
  pendingPartData: ManufacturerPart | null;
  clearPendingPartData: () => void;
  createWireConnection: (fromPin: PinHit, toPin: PinHit, waypoints?: Point[]) => void;
  deleteDevices: (deviceIds: string[]) => void;
  deleteWire: (connectionIndex: number) => void;
  addWaypoint: (connectionIndex: number, segmentIndex: number, point: Point) => void;
  moveWaypoint: (connectionIndex: number, waypointIndex: number, point: Point) => void;
  removeWaypoint: (connectionIndex: number, waypointIndex: number) => void;
  replaceWaypoints: (connectionIndex: number, waypoints: Point[] | undefined) => void;
  reconnectWire: (connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => void;
  updateWireField: (connectionIndex: number, field: 'wireGauge' | 'wireType' | 'wireColor' | 'wireSpecPosition', value: unknown) => void;
  connectToWire: (connectionIndex: number, worldX: number, worldY: number, startPin: PinHit) => void;
  addAnnotation: (worldX: number, worldY: number, content: string) => void;
  addShapeAnnotation: (annotationType: 'rectangle' | 'circle' | 'line' | 'arrow', position: { x: number; y: number }, style: import('@fusion-cad/core-model').Annotation['style']) => void;
  copyDevice: () => void;
  pasteDevice: (worldX: number, worldY: number) => void;
  duplicateDevice: () => void;
  clipboard: unknown;
  pushToHistoryRef: React.MutableRefObject<() => void>;
  undoRef: React.MutableRefObject<() => void>;
  redoRef: React.MutableRefObject<() => void>;
  devicePositions: Map<string, Point>;
  setDevicePositions: React.Dispatch<React.SetStateAction<Map<string, Point>>>;
  rotateDevice: (deviceId: string, direction: 'cw' | 'ccw') => void;
  rotateSelectedDevices: (direction: 'cw' | 'ccw') => void;
  mirrorDevice: (deviceId: string) => void;
  deviceTransforms: Map<string, DeviceTransform>;
  selectAnnotation: (id: string | null, addToSelection?: boolean) => void;
  updateAnnotation: (id: string, updates: { position?: { x: number; y: number }; groupId?: string }) => void;
  moveAnnotations: (ids: string[], dx: number, dy: number) => void;
  deleteAnnotation: (id: string) => void;
  selectedAnnotationIds: string[];
  activeSheetId: string;
  panelScale: number;
}

/**
 * Compute pin world positions for a connection's from/to devices.
 */
function computeWirePinPositions(
  conn: Connection,
  devices: import('@fusion-cad/core-model').Device[],
  parts: import('@fusion-cad/core-model').Part[],
  positions: Map<string, Point>,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): { fromPinPos: Point | null; toPinPos: Point | null } {
  const fromDevice = resolveDevice(conn, 'from', devices);
  const toDevice = resolveDevice(conn, 'to', devices);
  if (!fromDevice || !toDevice) return { fromPinPos: null, toPinPos: null };

  const fromPos = positions.get(fromDevice.id);
  const toPos = positions.get(toDevice.id);
  if (!fromPos || !toPos) return { fromPinPos: null, toPinPos: null };

  const partMap = new Map<string, import('@fusion-cad/core-model').Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

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

  return { fromPinPos, toPinPos };
}

/**
 * Remove collinear intermediate waypoints (3 consecutive points on same line → remove middle).
 */
function simplifyWaypoints(waypoints: Point[]): Point[] | undefined {
  if (waypoints.length <= 1) return waypoints.length === 0 ? undefined : waypoints;

  const result: Point[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    // Skip if collinear (all same X or all same Y)
    const sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
    const sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result.length > 0 ? result : undefined;
}

/**
 * Project a point onto the nearest segment of a wire's rendered path.
 * Returns the closest point ON the wire, ensuring T-junctions align perfectly.
 */
function projectPointOntoWire(
  worldX: number,
  worldY: number,
  conn: Connection,
  fromPinPos: Point,
  toPinPos: Point,
): Point {
  // Build the wire path: from pin → waypoints → to pin, orthogonalized
  const rawPoints: Point[] = [fromPinPos];
  if (conn.waypoints && conn.waypoints.length > 0) {
    rawPoints.push(...conn.waypoints);
  }
  rawPoints.push(toPinPos);
  const pathPoints = toOrthogonalPath(rawPoints);

  let bestDist = Infinity;
  let bestPoint: Point = { x: worldX, y: worldY };

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const ax = pathPoints[i].x, ay = pathPoints[i].y;
    const bx = pathPoints[i + 1].x, by = pathPoints[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let proj: Point;
    if (lenSq === 0) {
      proj = { x: ax, y: ay };
    } else {
      const t = Math.max(0, Math.min(1, ((worldX - ax) * dx + (worldY - ay) * dy) / lenSq));
      proj = { x: ax + t * dx, y: ay + t * dy };
    }

    const dist = Math.hypot(worldX - proj.x, worldY - proj.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = proj;
    }
  }

  return bestPoint;
}

/** Hit-test an annotation at a world coordinate. Returns true if the point is inside. */
function hitTestAnnotation(ann: import('@fusion-cad/core-model').Annotation, wx: number, wy: number): boolean {
  const s = ann.style || {};
  switch (ann.annotationType) {
    case 'text':
    case 'note': {
      const fontSize = s.fontSize || 3;
      const lines = ann.content.split('\n');
      const tw = Math.max(...lines.map(l => l.length)) * fontSize * 0.6;
      const th = lines.length * fontSize * 1.4;
      return wx >= ann.position.x && wx <= ann.position.x + tw &&
             wy >= ann.position.y && wy <= ann.position.y + th;
    }
    case 'rectangle': {
      const w = s.width || 10, h = s.height || 10;
      // Click anywhere inside the rectangle to select it
      return wx >= ann.position.x && wx <= ann.position.x + w &&
             wy >= ann.position.y && wy <= ann.position.y + h;
    }
    case 'circle': {
      const r = s.radius || 5;
      const dist = Math.hypot(wx - ann.position.x, wy - ann.position.y);
      // Click anywhere inside the circle
      return dist <= r;
    }
    case 'image': {
      const iw = s.width || 50, ih = s.height || 50;
      return wx >= ann.position.x && wx <= ann.position.x + iw &&
             wy >= ann.position.y && wy <= ann.position.y + ih;
    }
    case 'line':
    case 'arrow': {
      const ex = s.endX ?? ann.position.x + 10;
      const ey = s.endY ?? ann.position.y;
      // Point-to-segment distance — generous 3mm hit zone
      const dx = ex - ann.position.x, dy = ey - ann.position.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(wx - ann.position.x, wy - ann.position.y) < 3;
      let t = ((wx - ann.position.x) * dx + (wy - ann.position.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = ann.position.x + t * dx, py = ann.position.y + t * dy;
      return Math.hypot(wx - px, wy - py) < 3;
    }
    default:
      return false;
  }
}

/** Get the bounding box origin for any annotation (for drag offset). */
function getAnnotationOrigin(ann: import('@fusion-cad/core-model').Annotation): { x: number; y: number } {
  return ann.position;
}

/** Get resize handles for a shape annotation. */
function getShapeHandles(ann: import('@fusion-cad/core-model').Annotation): Array<{ id: string; x: number; y: number; cursor: string }> {
  const s = ann.style || {};
  switch (ann.annotationType) {
    case 'rectangle': {
      const x = ann.position.x, y = ann.position.y;
      const w = s.width || 10, h = s.height || 10;
      return [
        { id: 'nw', x, y, cursor: 'nw-resize' },
        { id: 'ne', x: x + w, y, cursor: 'ne-resize' },
        { id: 'se', x: x + w, y: y + h, cursor: 'se-resize' },
        { id: 'sw', x, y: y + h, cursor: 'sw-resize' },
      ];
    }
    case 'circle': {
      const cx = ann.position.x, cy = ann.position.y, r = s.radius || 5;
      return [
        { id: 'n', x: cx, y: cy - r, cursor: 'n-resize' },
        { id: 'e', x: cx + r, y: cy, cursor: 'e-resize' },
        { id: 's', x: cx, y: cy + r, cursor: 's-resize' },
        { id: 'w', x: cx - r, y: cy, cursor: 'w-resize' },
      ];
    }
    case 'image': {
      const x = ann.position.x, y = ann.position.y;
      const w = s.width || 50, h = s.height || 50;
      return [
        { id: 'nw', x, y, cursor: 'nw-resize' },
        { id: 'ne', x: x + w, y, cursor: 'ne-resize' },
        { id: 'se', x: x + w, y: y + h, cursor: 'se-resize' },
        { id: 'sw', x, y: y + h, cursor: 'sw-resize' },
      ];
    }
    case 'line':
    case 'arrow': {
      return [
        { id: 'start', x: ann.position.x, y: ann.position.y, cursor: 'crosshair' },
        { id: 'end', x: s.endX ?? ann.position.x + 10, y: s.endY ?? ann.position.y, cursor: 'crosshair' },
      ];
    }
    default:
      return [];
  }
}

export function useCanvasInteraction(deps: UseCanvasInteractionDeps): UseCanvasInteractionReturn {
  const {
    circuit,
    selectedDevices,
    setSelectedDevices,
    selectedWireIndex,
    setSelectedWireIndex,
    getAllPositions,
    placeSymbol,
    pendingPartData,
    clearPendingPartData,
    createWireConnection,
    deleteDevices,
    deleteWire,
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    replaceWaypoints,
    reconnectWire,
    updateWireField,
    connectToWire,
    addAnnotation,
    addShapeAnnotation,
    copyDevice,
    pasteDevice,
    duplicateDevice,
    clipboard,
    pushToHistoryRef,
    undoRef,
    redoRef,
    setDevicePositions,
    rotateDevice,
    rotateSelectedDevices,
    mirrorDevice,
    deviceTransforms,
    selectAnnotation,
    updateAnnotation,
    moveAnnotations,
    deleteAnnotation,
    selectedAnnotationIds,
    activeSheetId,
    panelScale,
  } = deps;

  // Sheet-filtered connections — same filtering as the renderer uses.
  // All hit detection must use this array so that indices match the renderer.
  // Use _globalIndex to map back to circuit.connections for mutations.
  const sheetConnections: SheetConnection[] = circuit
    ? filterConnectionsBySheet(
        circuit.connections,
        activeSheetId ? circuit.devices.filter(d => d.sheetId === activeSheetId) : circuit.devices,
        activeSheetId,
      )
    : [];

  // Helper: map a filtered (sheet) index to the global circuit.connections index
  const toGlobalIndex = (filteredIndex: number): number => {
    return sheetConnections[filteredIndex]?._globalIndex ?? filteredIndex;
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderHandleRef = useRef<import('../components/Canvas').CanvasRenderHandle | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

  // Ref-based viewport for smooth zoom (bypasses React during wheel gestures)
  // Default offset shifts the view right so world x=0 isn't hidden behind the sidebar
  const viewportRef = useRef<Viewport>({ offsetX: 50, offsetY: 20, scale: 1 });
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep ref in sync with React state
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [placementCategory, setPlacementCategory] = useState<SymbolCategory | null>(null);
  const [wireStart, setWireStart] = useState<PinHit | null>(null);
  const [wireWaypoints, setWireWaypoints] = useState<Point[]>([]);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);
  const [pastePreview, setPastePreview] = useState(false);
  const [pendingTextPosition, setPendingTextPosition] = useState<Point | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [shapeToolType, setShapeToolType] = useState<ShapeToolType>('rectangle');
  // Single ref for all shape drawing state — no stale closure issues
  const shapeToolTypeRef = useRef<ShapeToolType>('rectangle');
  shapeToolTypeRef.current = shapeToolType;
  const shapeDrawingRef = useRef<{ type: ShapeToolType; start: Point } | null>(null);

  // Drag state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const dragOffsetRef = useRef<Point | null>(null);
  const dragHistoryPushedRef = useRef(false);
  const draggingAnnotationRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  /** Active resize handle for shape annotation */
  const resizingShapeRef = useRef<{ annotationId: string; handleId: string; type: string } | null>(null);
  /** 'drag' = G key (move with wires), 'move' = M key (detach wires) */
  const dragModeRef = useRef<'drag' | 'move'>('drag');

  // Waypoint dragging state
  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    connectionIndex: number;
    waypointIndex: number;
  } | null>(null);

  // Wire endpoint dragging state
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpointState | null>(null);

  // Wire segment dragging state
  const [draggingSegment, setDraggingSegment] = useState<{
    connectionIndex: number;
    direction: 'h' | 'v';
    wpIndices: number[];        // waypoint indices to move (1 for edge, 2 for middle)
    isFirst: boolean;           // first segment (need jog insertion)
    isLast: boolean;            // last segment (need jog insertion)
    jogInserted: boolean;       // whether we've already inserted the jog waypoint
    pinPos: Point;              // pin position on the fixed side (for jog computation)
  } | null>(null);

  // Wire spec label dragging state
  const [draggingSpecLabel, setDraggingSpecLabel] = useState<{
    connectionIndex: number;
    offsetX: number; // offset from label position to mouse position
    offsetY: number;
  } | null>(null);

  // Pan state (middle-click or Space+drag)
  const isPanningRef = useRef(false);
  const spaceHeldRef = useRef(false);


  // Marquee selection state
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeStartRef = useRef<Point | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<UseCanvasInteractionReturn['contextMenu']>(null);

  // Zoom to fit all content (extracted as stable callback for external use)
  const zoomToFit = useCallback(() => {
    if (!circuit || circuit.devices.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const allPositions = getAllPositions();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const device of circuit.devices) {
      const pos = allPositions.get(device.id);
      if (!pos) continue;
      const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
      const geom = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + geom.width);
      maxY = Math.max(maxY, pos.y + geom.height);
    }

    // Include ladder block bounds (rung numbers, rail labels, descriptions)
    if (circuit.blocks) {
      for (const block of circuit.blocks) {
        if (block.blockType === 'ladder') {
          const lb = block as any; // LadderBlock
          const config = lb.ladderConfig;
          if (config) {
            const ox = block.position?.x ?? 0;
            const oy = block.position?.y ?? 0;
            // Rung numbers are drawn at railL1X - 24, so include margin
            minX = Math.min(minX, (config.railL1X || 100) + ox - 60);
            // Description text is right of railL2X
            maxX = Math.max(maxX, (config.railL2X || 900) + ox + 60);
            // Include rail labels above first rung
            minY = Math.min(minY, (config.firstRungY || 100) + oy - 60);
          }
        }
      }
    }

    if (!isFinite(minX)) return;

    const padding = 50;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const newScale = Math.min(scaleX, scaleY, 2);

    setViewport({
      scale: newScale,
      offsetX: (rect.width - contentW * newScale) / 2 - minX * newScale + padding * newScale,
      offsetY: (rect.height - contentH * newScale) / 2 - minY * newScale + padding * newScale,
    });
  }, [circuit, getAllPositions]);

  // Canvas interaction handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !circuit) return;

    /** Convert screen mouse position to world coordinates (mm). */
    const getWorldCoords = (e: MouseEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const mmScale = viewport.scale * MM_TO_PX;
      return {
        x: (mouseX - viewport.offsetX) / mmScale,
        y: (mouseY - viewport.offsetY) / mmScale,
      };
    };

    const getCursor = (): string => {
      if (draggingDevice) return 'move';
      if (spaceHeldRef.current) return isPanningRef.current ? 'grabbing' : 'grab';
      switch (interactionMode) {
        case 'wire': return 'crosshair';
        case 'place': return 'crosshair';
        case 'shape': return 'crosshair';
        case 'text': return 'text';
        case 'pan': return isPanningRef.current ? 'grabbing' : 'grab';
        case 'select':
        default: return 'default';
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Normalize deltaY across input devices (trackpad vs mouse wheel)
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 40;   // lines → pixels
      if (e.deltaMode === 2) dy *= 800;  // pages → pixels

      // Proportional zoom: trackpad pinch sends small deltas (smooth),
      // mouse wheel sends ~100 (feels like ~10% per click)
      const zoomIntensity = 0.002;
      const zoomFactor = Math.exp(-dy * zoomIntensity);

      // Read from ref (always current, no stale closure)
      const cur = viewportRef.current;
      const newScale = Math.min(Math.max(cur.scale * zoomFactor, 0.1), 5);
      const scaleRatio = newScale / cur.scale;
      const newOffsetX = mouseX - (mouseX - cur.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - cur.offsetY) * scaleRatio;

      const newViewport = { offsetX: newOffsetX, offsetY: newOffsetY, scale: newScale };
      viewportRef.current = newViewport;

      // Render directly — bypass React entirely for instant response
      if (renderHandleRef.current) {
        renderHandleRef.current.renderWithViewport(newViewport);
      }

      // Debounce: sync back to React state when zoom gesture settles
      if (zoomSettleTimerRef.current) clearTimeout(zoomSettleTimerRef.current);
      zoomSettleTimerRef.current = setTimeout(() => {
        setViewport(viewportRef.current);
        zoomSettleTimerRef.current = null;
      }, 150);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Middle-click or Space+left-click → pan
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        isDraggingRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;

      const world = getWorldCoords(e);
      const allPositions = getAllPositions();

      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (interactionMode === 'select') {
        // Check for endpoints on selected wire
        if (selectedWireIndex !== null) {
          const endpointHit = getWireEndpointAtPoint(
            world.x, world.y, selectedWireIndex,
            sheetConnections, circuit.devices, circuit.parts, allPositions, 10, circuit.transforms
          );
          if (endpointHit) {
            const conn = sheetConnections[selectedWireIndex];
            const originalPin: PinHit = endpointHit.endpoint === 'from'
              ? { device: conn.fromDevice, pin: conn.fromPin }
              : { device: conn.toDevice, pin: conn.toPin };
            setDraggingEndpoint({
              connectionIndex: selectedWireIndex,
              endpoint: endpointHit.endpoint,
              originalPin,
            });
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'crosshair';
            return;
          }

          // Check for wire spec label drag on selected wire
          const specLabelHit = getWireSpecLabelAtPoint(
            world.x, world.y, sheetConnections,
            circuit.devices, circuit.parts, allPositions, circuit.transforms as Record<string, { rotation: number; mirrorH?: boolean; dashed?: boolean }>,
          );
          if (specLabelHit && specLabelHit.connectionIndex === selectedWireIndex) {
            setDraggingSpecLabel({
              connectionIndex: selectedWireIndex,
              offsetX: 0,
              offsetY: 0,
            });
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'move';
            return;
          }

          const waypointHit = getWaypointAtPoint(world.x, world.y, sheetConnections);
          if (waypointHit && waypointHit.connectionIndex === selectedWireIndex) {
            setDraggingWaypoint(waypointHit);
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'move';
            return;
          }

          // Check for segment drag on selected wire
          const conn = sheetConnections[selectedWireIndex];
          const { fromPinPos, toPinPos } = computeWirePinPositions(
            conn, circuit.devices, circuit.parts, allPositions, circuit.transforms
          );
          if (fromPinPos && toPinPos) {
            const segIdx = getWireSegmentAtPoint(
              world.x, world.y, conn, fromPinPos.x, fromPinPos.y, toPinPos.x, toPinPos.y
            );
            if (segIdx !== null) {
              // Materialize the full rendered path as waypoints
              const fullPath = toOrthogonalPath([
                fromPinPos, ...(conn.waypoints || []), toPinPos
              ]);
              const interior = fullPath.slice(1, -1);
              const totalSegments = fullPath.length - 1;

              // Determine segment direction
              const p1 = fullPath[segIdx];
              const p2 = fullPath[segIdx + 1];
              const dir: 'h' | 'v' = Math.abs(p1.y - p2.y) < 1 ? 'h' : 'v';

              const isFirst = segIdx === 0;
              const isLast = segIdx === totalSegments - 1;

              // Map to waypoint indices (interior is offset by 1 from fullPath)
              let wpIndices: number[];
              if (isFirst) {
                wpIndices = [0]; // only first interior point
              } else if (isLast) {
                wpIndices = [interior.length - 1]; // only last interior point
              } else {
                wpIndices = [segIdx - 1, segIdx]; // both endpoints in interior
              }

              // Materialize waypoints
              replaceWaypoints(toGlobalIndex(selectedWireIndex), interior.length > 0 ? interior : undefined);

              setDraggingSegment({
                connectionIndex: selectedWireIndex,
                direction: dir,
                wpIndices,
                isFirst,
                isLast,
                jogInserted: false,
                pinPos: isFirst ? fromPinPos : toPinPos,
              });
              dragHistoryPushedRef.current = false;
              canvas.style.cursor = dir === 'h' ? 'ns-resize' : 'ew-resize';
              return;
            }
          }
        }

        // Check resize handles on selected shape annotation first
        if (selectedAnnotationIds.length === 1) {
          const selAnn = (circuit.annotations || []).find(a => a.id === selectedAnnotationIds[0]);
          if (selAnn && ['rectangle', 'circle', 'line', 'arrow', 'image'].includes(selAnn.annotationType) && !selAnn.style?.locked) {
            const handles = getShapeHandles(selAnn);
            const hitRadius = 3; // mm
            for (const h of handles) {
              if (Math.abs(world.x - h.x) < hitRadius && Math.abs(world.y - h.y) < hitRadius) {
                resizingShapeRef.current = { annotationId: selAnn.id, handleId: h.id, type: selAnn.annotationType };
                pushToHistoryRef.current();
                canvas.style.cursor = h.cursor;
                return;
              }
            }
          }
        }

        // Check annotation hit BEFORE device hit — shapes render on top of devices
        // Skip already-selected annotations to allow marquee drag from on top of them.
        // Also skip image annotations unless they're already selected (they're reference images,
        // not primary interaction targets — clicking through them to marquee-select devices is expected).
        const annots = (circuit.annotations || []).filter(a =>
          !activeSheetId || a.sheetId === activeSheetId
        );
        for (const ann of annots) {
          if (!hitTestAnnotation(ann, world.x, world.y)) continue;
          // Image annotations: only intercept if already selected (to allow drag/move)
          // Otherwise let the click fall through to device hit test or marquee
          if (ann.annotationType === 'image' && !selectedAnnotationIds.includes(ann.id)) continue;
          const origin = getAnnotationOrigin(ann);
          selectAnnotation(ann.id, e.shiftKey);
          draggingAnnotationRef.current = {
            id: ann.id,
            offsetX: world.x - origin.x,
            offsetY: world.y - origin.y,
          };
          pushToHistoryRef.current();
          canvas.style.cursor = 'move';
          return;
        }

        // Hit radii are screen-space constant (divided by zoom scale)
        const wireHitRadius = 8 / (viewport.scale * MM_TO_PX);
        const wirePriorityRadius = 4 / (viewport.scale * MM_TO_PX);

        const hitDeviceId = getSymbolAtPoint(world.x, world.y, activeSheetId ? circuit.devices.filter(d => d.sheetId === activeSheetId) : circuit.devices, circuit.parts, allPositions, circuit.transforms, viewport.scale, panelScale);
        const wireHit = getWireHitWithDistance(world.x, world.y, sheetConnections, circuit.devices, circuit.parts, allPositions, wireHitRadius, circuit.transforms);
        const hitWire = wireHit?.index ?? null;

        // When both are hit, prefer wire only if click is within ~4 screen-px of the wire path.
        // Exception: junctions are ON wires by design — always prefer the junction device.
        const WIRE_PRIORITY_THRESHOLD = wirePriorityRadius;
        const hitDeviceIsJunction = hitDeviceId
          ? circuit.devices.find(d => d.id === hitDeviceId)?.function?.toLowerCase().includes('junction') ?? false
          : false;
        const preferWire = wireHit !== null && hitDeviceId !== null
          && wireHit.distance <= WIRE_PRIORITY_THRESHOLD
          && !hitDeviceIsJunction;

        if (hitDeviceId && !preferWire) {
          setSelectedWireIndex(null);

          if (e.shiftKey) {
            setSelectedDevices(prev => {
              if (prev.includes(hitDeviceId)) {
                return prev.filter(d => d !== hitDeviceId);
              } else {
                return [...prev, hitDeviceId];
              }
            });
          } else {
            if (!selectedDevices.includes(hitDeviceId)) {
              setSelectedDevices([hitDeviceId]);
            }
          }

          setDraggingDevice(hitDeviceId);
          dragModeRef.current = 'drag'; // Mouse-initiated drag always uses drag-with-wires
          dragHistoryPushedRef.current = false;
          const symbolPos = allPositions.get(hitDeviceId);
          if (symbolPos) {
            const ps = panelScale > 1 ? panelScale : 1;
            dragOffsetRef.current = {
              x: world.x - symbolPos.x / ps,
              y: world.y - symbolPos.y / ps,
            };
          }
          canvas.style.cursor = 'move';
          return;
        }

        if (hitWire !== null) {
          setSelectedDevices([]);
          if (hitWire !== selectedWireIndex) {
            setSelectedWireIndex(hitWire);
          } else {
            // Already selected — try segment drag with relaxed tolerance
            const conn = sheetConnections[hitWire];
            const { fromPinPos, toPinPos } = computeWirePinPositions(
              conn, circuit.devices, circuit.parts, allPositions, circuit.transforms
            );
            if (fromPinPos && toPinPos) {
              const segIdx = getWireSegmentAtPoint(
                world.x, world.y, conn, fromPinPos.x, fromPinPos.y, toPinPos.x, toPinPos.y, 12
              );
              if (segIdx !== null) {
                const fullPath = toOrthogonalPath([
                  fromPinPos, ...(conn.waypoints || []), toPinPos
                ]);
                const interior = fullPath.slice(1, -1);
                const totalSegments = fullPath.length - 1;
                const p1 = fullPath[segIdx];
                const p2 = fullPath[segIdx + 1];
                const dir: 'h' | 'v' = Math.abs(p1.y - p2.y) < 1 ? 'h' : 'v';
                const isFirst = segIdx === 0;
                const isLast = segIdx === totalSegments - 1;
                let wpIndices: number[];
                if (isFirst) { wpIndices = [0]; }
                else if (isLast) { wpIndices = [interior.length - 1]; }
                else { wpIndices = [segIdx - 1, segIdx]; }
                replaceWaypoints(toGlobalIndex(hitWire), interior.length > 0 ? interior : undefined);
                setDraggingSegment({
                  connectionIndex: hitWire,
                  direction: dir,
                  wpIndices,
                  isFirst,
                  isLast,
                  jogInserted: false,
                  pinPos: isFirst ? fromPinPos : toPinPos,
                });
                dragHistoryPushedRef.current = false;
                canvas.style.cursor = dir === 'h' ? 'ns-resize' : 'ew-resize';
                return;
              }
            }
          }
          isDraggingRef.current = false;
          return;
        }
      }

      // Hand/Pan mode: always pan on drag
      if (interactionMode === 'pan') {
        isPanningRef.current = true;
        canvas.style.cursor = 'grabbing';
        return;
      }

      // Select mode on empty space: start marquee selection
      // Shift preserves existing selection; plain click deselects first
      if (interactionMode === 'select') {
        if (!e.shiftKey) {
          setSelectedDevices([]);
          setSelectedWireIndex(null);
        }
        marqueeStartRef.current = world;
      }

      // Shape mode: record start point on mouseDown (drag to draw)
      if (interactionMode === 'shape') {
        shapeDrawingRef.current = {
          type: shapeToolTypeRef.current,
          start: { x: snapToGrid(world.x), y: snapToGrid(world.y) },
        };
      }

      canvas.style.cursor = getCursor();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const mmScale = viewport.scale * MM_TO_PX;
      const world: Point = {
        x: (mouseX - viewport.offsetX) / mmScale,
        y: (mouseY - viewport.offsetY) / mmScale,
      };

      // Track mouse position for placement preview, wire preview, paste preview, and shape drawing
      if (interactionMode === 'place' || interactionMode === 'wire' || interactionMode === 'shape' || pastePreview) {
        setMouseWorldPos(world);
      }

      if (!isDraggingRef.current) return;

      // Pan canvas (middle-click or Space+drag)
      if (isPanningRef.current) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setViewport(prev => ({
          ...prev,
          offsetX: prev.offsetX + dx,
          offsetY: prev.offsetY + dy,
        }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDraggedRef.current = true;
      }

      // Drag wire spec label
      if (draggingSpecLabel) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }
        const snapped = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
        updateWireField(
          toGlobalIndex(draggingSpecLabel.connectionIndex),
          'wireSpecPosition',
          snapped,
        );
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag waypoint
      if (draggingWaypoint) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }
        moveWaypoint(toGlobalIndex(draggingWaypoint.connectionIndex), draggingWaypoint.waypointIndex, world);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag segment
      if (draggingSegment) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }

        const conn = sheetConnections[draggingSegment.connectionIndex];
        if (!conn.waypoints) return;
        const waypoints = [...conn.waypoints.map(wp => ({ ...wp }))];

        const snappedX = snapToGrid(world.x);
        const snappedY = snapToGrid(world.y);

        if (draggingSegment.direction === 'h') {
          // Horizontal segment: move Y of waypoints
          for (const idx of draggingSegment.wpIndices) {
            if (idx >= 0 && idx < waypoints.length) {
              waypoints[idx] = { ...waypoints[idx], y: snappedY };
            }
          }
          // For first/last segment: insert jog waypoint on first move
          if ((draggingSegment.isFirst || draggingSegment.isLast) && !draggingSegment.jogInserted) {
            const jogPoint = { x: draggingSegment.pinPos.x, y: snappedY };
            if (draggingSegment.isFirst) {
              waypoints.unshift(jogPoint);
              setDraggingSegment(prev => prev ? {
                ...prev,
                wpIndices: prev.wpIndices.map(i => i + 1),
                jogInserted: true,
              } : null);
            } else {
              waypoints.push(jogPoint);
              setDraggingSegment(prev => prev ? { ...prev, jogInserted: true } : null);
            }
          }
        } else {
          // Vertical segment: move X of waypoints
          for (const idx of draggingSegment.wpIndices) {
            if (idx >= 0 && idx < waypoints.length) {
              waypoints[idx] = { ...waypoints[idx], x: snappedX };
            }
          }
          if ((draggingSegment.isFirst || draggingSegment.isLast) && !draggingSegment.jogInserted) {
            const jogPoint = { x: snappedX, y: draggingSegment.pinPos.y };
            if (draggingSegment.isFirst) {
              waypoints.unshift(jogPoint);
              setDraggingSegment(prev => prev ? {
                ...prev,
                wpIndices: prev.wpIndices.map(i => i + 1),
                jogInserted: true,
              } : null);
            } else {
              waypoints.push(jogPoint);
              setDraggingSegment(prev => prev ? { ...prev, jogInserted: true } : null);
            }
          }
        }

        replaceWaypoints(toGlobalIndex(draggingSegment.connectionIndex), waypoints);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag endpoint
      if (draggingEndpoint) {
        setMouseWorldPos(world);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Resize shape handle drag
      if (resizingShapeRef.current && circuit) {
        const { annotationId, handleId, type } = resizingShapeRef.current;
        const ann = (circuit.annotations || []).find(a => a.id === annotationId);
        if (ann) {
          const s = ann.style || {};
          const snapped = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
          let updates: { position?: { x: number; y: number }; style?: typeof s } | null = null;

          if (type === 'image') {
            // Aspect-ratio-locked resize for images
            const origW = s.width || 50, origH = s.height || 50;
            const aspect = origW / origH;
            const h = handleId;
            // Determine new width from the dragged corner
            let newW: number;
            if (h === 'se' || h === 'ne') {
              newW = Math.abs(snapped.x - ann.position.x);
            } else {
              newW = Math.abs((ann.position.x + origW) - snapped.x);
            }
            newW = Math.max(5, newW); // minimum 5mm
            const newH = newW / aspect;
            // Compute new position (anchor the opposite corner)
            let newX = ann.position.x, newY = ann.position.y;
            if (h === 'nw') { newX = ann.position.x + origW - newW; newY = ann.position.y + origH - newH; }
            else if (h === 'ne') { newY = ann.position.y + origH - newH; }
            else if (h === 'sw') { newX = ann.position.x + origW - newW; }
            // 'se' keeps position as-is
            updates = {
              position: { x: snapToGrid(newX), y: snapToGrid(newY) },
              style: { ...s, width: newW, height: newH },
            };
          } else if (type === 'rectangle') {
            let x1 = ann.position.x, y1 = ann.position.y;
            let x2 = x1 + (s.width || 10), y2 = y1 + (s.height || 10);
            const h = handleId;
            if (h === 'nw' || h === 'sw') x1 = snapped.x;
            if (h === 'nw' || h === 'ne') y1 = snapped.y;
            if (h === 'ne' || h === 'se') x2 = snapped.x;
            if (h === 'se' || h === 'sw') y2 = snapped.y;
            if (Math.abs(x2 - x1) >= 2 && Math.abs(y2 - y1) >= 2) {
              updates = {
                position: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
                style: { ...s, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
              };
            }
          } else if (type === 'circle') {
            const newRadius = Math.max(2, Math.hypot(snapped.x - ann.position.x, snapped.y - ann.position.y));
            updates = { style: { ...s, radius: snapToGrid(newRadius) } };
          } else if (type === 'line' || type === 'arrow') {
            if (handleId === 'start') {
              updates = { position: snapped, style: s };
            } else {
              updates = { style: { ...s, endX: snapped.x, endY: snapped.y } };
            }
          }

          if (updates) {
            updateAnnotation(annotationId, updates);
          }
        }
        hasDraggedRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag annotation — live update positions (like device drag)
      if (draggingAnnotationRef.current && circuit) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }
        hasDraggedRef.current = true;
        const dragRef = draggingAnnotationRef.current;
        const idsToMove = selectedAnnotationIds.includes(dragRef.id) ? selectedAnnotationIds : [dragRef.id];
        const dx = world.x - lastMousePosRef.current.x / (viewport.scale * MM_TO_PX) - (viewport.offsetX / (viewport.scale * MM_TO_PX) - viewport.offsetX / (viewport.scale * MM_TO_PX));
        // Simpler: compute delta from last mouse position in world coords
        const prevWorld = {
          x: (lastMousePosRef.current.x - canvasRef.current!.getBoundingClientRect().left - viewport.offsetX) / (viewport.scale * MM_TO_PX),
          y: (lastMousePosRef.current.y - canvasRef.current!.getBoundingClientRect().top - viewport.offsetY) / (viewport.scale * MM_TO_PX),
        };
        const moveDx = world.x - prevWorld.x;
        const moveDy = world.y - prevWorld.y;
        if (Math.abs(moveDx) > 0.01 || Math.abs(moveDy) > 0.01) {
          moveAnnotations(idsToMove, moveDx, moveDy);
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag device
      // draggingDevice is now a device ID
      if (draggingDevice && dragOffsetRef.current) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }

        const allPositions = getAllPositions();
        const draggedPos = allPositions.get(draggingDevice);
        if (draggedPos) {
          // Panel scale: mouse is in visual mm, positions in real mm
          const ps = panelScale > 1 ? panelScale : 1;
          const newX = snapToGrid((world.x - dragOffsetRef.current.x) * ps);
          const newY = snapToGrid((world.y - dragOffsetRef.current.y) * ps);
          const dx = newX - draggedPos.x;
          const dy = newY - draggedPos.y;

          // selectedDevices and draggingDevice are both device IDs now
          const devicesToMove = selectedDevices.includes(draggingDevice)
            ? selectedDevices
            : [draggingDevice];

          setDevicePositions(prev => {
            const next = new Map(prev);
            for (const deviceId of devicesToMove) {
              const currentPos = allPositions.get(deviceId);
              if (currentPos) {
                next.set(deviceId, {
                  x: snapToGrid(currentPos.x + dx),
                  y: snapToGrid(currentPos.y + dy),
                });
              }
            }
            return next;
          });

          // KiCad-style "drag with wires" (G key): update wire paths when endpoints move.
          // "Move" mode (M key): skip wire updates, detaching device from wires.
          if (circuit && (dx !== 0 || dy !== 0) && dragModeRef.current === 'drag') {
            const movedSet = new Set(devicesToMove);
            for (let ci = 0; ci < circuit.connections.length; ci++) {
              const conn = circuit.connections[ci];

              const fromId = conn.fromDeviceId || circuit.devices.find(d => d.tag === conn.fromDevice)?.id;
              const toId = conn.toDeviceId || circuit.devices.find(d => d.tag === conn.toDevice)?.id;
              if (!fromId || !toId) continue;

              const fromMoved = movedSet.has(fromId);
              const toMoved = movedSet.has(toId);

              if (fromMoved && toMoved) {
                // BOTH endpoints moving: shift all waypoints by (dx, dy)
                if (conn.waypoints && conn.waypoints.length > 0) {
                  const shifted = conn.waypoints.map(wp => ({
                    x: snapToGrid(wp.x + dx),
                    y: snapToGrid(wp.y + dy),
                  }));
                  replaceWaypoints(ci, shifted);
                }
              } else if (fromMoved || toMoved) {
                // ONE endpoint moving: wire rubber-bands to follow.
                // Reset waypoints to empty [] so the orthogonal path
                // recomputes from the new pin positions on each render.
                // Only reset if waypoints have actual coordinates (avoid no-op state updates).
                if (conn.waypoints && conn.waypoints.length > 0) {
                  replaceWaypoints(ci, []);
                }
              }
            }
          }

          // Also move selected annotations along with devices
          if (selectedAnnotationIds.length > 0 && (dx !== 0 || dy !== 0)) {
            const ps = panelScale > 1 ? panelScale : 1;
            moveAnnotations(selectedAnnotationIds, dx / ps, dy / ps);
          }
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Marquee selection
      if (interactionMode === 'select' && marqueeStartRef.current && !draggingDevice && !draggingWaypoint && !draggingEndpoint && !draggingSegment && !draggingSpecLabel) {
        if (hasDraggedRef.current) {
          const startWorld = marqueeStartRef.current;
          const mode = world.x >= startWorld.x ? 'window' : 'crossing';
          setMarquee({
            startX: startWorld.x,
            startY: startWorld.y,
            endX: world.x,
            endY: world.y,
            mode,
          });
          lastMousePosRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      // End pan
      if (isPanningRef.current) {
        isPanningRef.current = false;
        isDraggingRef.current = false;
        canvas.style.cursor = spaceHeldRef.current ? 'grab' : getCursor();
        return;
      }

      const world = getWorldCoords(e);
      const allPositions = getAllPositions();

      // End wire spec label dragging
      if (draggingSpecLabel) {
        setDraggingSpecLabel(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End waypoint dragging
      if (draggingWaypoint) {
        setDraggingWaypoint(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End segment dragging
      if (draggingSegment) {
        // Simplify: remove collinear waypoints
        const conn = sheetConnections[draggingSegment.connectionIndex];
        if (conn.waypoints && conn.waypoints.length > 2) {
          const simplified = simplifyWaypoints(conn.waypoints);
          replaceWaypoints(toGlobalIndex(draggingSegment.connectionIndex), simplified);
        }
        setDraggingSegment(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End shape resize
      if (resizingShapeRef.current) {
        resizingShapeRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End endpoint dragging
      if (draggingEndpoint) {
        const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms, viewport.scale);
        if (hitPin) {
          const isOriginalPin = hitPin.device === draggingEndpoint.originalPin.device &&
                               hitPin.pin === draggingEndpoint.originalPin.pin;
          if (!isOriginalPin) {
            reconnectWire(toGlobalIndex(draggingEndpoint.connectionIndex), draggingEndpoint.endpoint, hitPin);
          }
        } else if (hasDraggedRef.current) {
          const conn = sheetConnections[draggingEndpoint.connectionIndex];
          const waypointPos = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
          const globalIdx = toGlobalIndex(draggingEndpoint.connectionIndex);

          if (draggingEndpoint.endpoint === 'from') {
            addWaypoint(globalIdx, 0, waypointPos);
          } else {
            const insertIndex = conn.waypoints ? conn.waypoints.length : 0;
            addWaypoint(globalIdx, insertIndex, waypointPos);
          }
        }
        setDraggingEndpoint(null);
        setMouseWorldPos(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End annotation dragging — positions already updated live during mouseMove
      if (draggingAnnotationRef.current) {
        // Snap final positions to grid
        if (hasDraggedRef.current) {
          const idsToMove = selectedAnnotationIds.includes(draggingAnnotationRef.current.id) ? selectedAnnotationIds : [draggingAnnotationRef.current.id];
          for (const annId of idsToMove) {
            const a = (circuit.annotations || []).find(an => an.id === annId);
            if (a) {
              const snappedX = snapToGrid(a.position.x);
              const snappedY = snapToGrid(a.position.y);
              if (snappedX !== a.position.x || snappedY !== a.position.y) {
                moveAnnotations([annId], snappedX - a.position.x, snappedY - a.position.y);
              }
            }
          }
        }
        draggingAnnotationRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End shape drawing
      if (shapeDrawingRef.current) {
        const { type: tool, start } = shapeDrawingRef.current;
        shapeDrawingRef.current = null;
        const endPt = { x: snapToGrid(world.x), y: snapToGrid(world.y) };
        const dx = endPt.x - start.x;
        const dy = endPt.y - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 1) { // minimum 1mm to prevent accidental clicks
          if (tool === 'rectangle') {
            addShapeAnnotation('rectangle', {
              x: Math.min(start.x, endPt.x),
              y: Math.min(start.y, endPt.y),
            }, { width: Math.abs(dx), height: Math.abs(dy) });
          } else if (tool === 'circle') {
            addShapeAnnotation('circle', start, { radius: dist });
          } else if (tool === 'line') {
            addShapeAnnotation('line', start, { endX: endPt.x, endY: endPt.y });
          } else if (tool === 'arrow') {
            addShapeAnnotation('arrow', start, { endX: endPt.x, endY: endPt.y });
          }
        }
        return;
      }

      // End device dragging
      if (draggingDevice) {
        setDraggingDevice(null);
        dragOffsetRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End marquee selection
      if (marquee && marqueeStartRef.current) {
        const allPositions = getAllPositions();
        const minX = Math.min(marquee.startX, marquee.endX);
        const maxX = Math.max(marquee.startX, marquee.endX);
        const minY = Math.min(marquee.startY, marquee.endY);
        const maxY = Math.max(marquee.startY, marquee.endY);

        const hits: string[] = [];
        const sheetDevices = activeSheetId
          ? circuit.devices.filter(d => d.sheetId === activeSheetId)
          : circuit.devices;
        const ps = panelScale > 1 ? panelScale : 1;
        for (const device of sheetDevices) {
          const rawPos = allPositions.get(device.id);
          if (!rawPos) continue;
          // Panel scale: device renders at pos/panelScale
          const pos = { x: rawPos.x / ps, y: rawPos.y / ps };
          const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
          const geom = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

          // Account for rotation when computing bounding box
          const transform = circuit.transforms?.[device.id];
          const rotation = transform?.rotation || 0;
          const effectiveWidth = ((rotation % 180 !== 0) ? geom.height : geom.width) / ps;
          const effectiveHeight = ((rotation % 180 !== 0) ? geom.width : geom.height) / ps;
          const cx = pos.x + (geom.width / ps) / 2;
          const cy = pos.y + (geom.height / ps) / 2;
          const devMinX = cx - effectiveWidth / 2;
          const devMinY = cy - effectiveHeight / 2;
          const devMaxX = cx + effectiveWidth / 2;
          const devMaxY = cy + effectiveHeight / 2;

          if (marquee.mode === 'window') {
            // Window select: fully enclosed
            if (devMinX >= minX && devMaxX <= maxX && devMinY >= minY && devMaxY <= maxY) {
              hits.push(device.id);
            }
          } else {
            // Crossing select: any overlap
            if (devMaxX >= minX && devMinX <= maxX && devMaxY >= minY && devMinY <= maxY) {
              hits.push(device.id);
            }
          }
        }

        // Also check annotations in marquee
        const annHits: string[] = [];
        const sheetAnnotations = (circuit.annotations || []).filter(a =>
          !activeSheetId || a.sheetId === activeSheetId
        );
        for (const ann of sheetAnnotations) {
          const s = ann.style || {};
          let aMinX = ann.position.x, aMinY = ann.position.y, aMaxX = aMinX, aMaxY = aMinY;
          if (ann.annotationType === 'rectangle') {
            aMaxX = aMinX + (s.width || 10); aMaxY = aMinY + (s.height || 10);
          } else if (ann.annotationType === 'circle') {
            const r = s.radius || 5; aMinX -= r; aMinY -= r; aMaxX += r; aMaxY += r;
          } else if (ann.annotationType === 'line' || ann.annotationType === 'arrow') {
            const ex = s.endX ?? aMinX, ey = s.endY ?? aMinY;
            aMinX = Math.min(aMinX, ex); aMinY = Math.min(aMinY, ey);
            aMaxX = Math.max(ann.position.x, ex); aMaxY = Math.max(ann.position.y, ey);
          } else if (ann.annotationType === 'text') {
            const fontSize = s.fontSize || 3;
            const lines = ann.content.split('\n');
            aMaxX = aMinX + Math.max(...lines.map(l => l.length)) * fontSize * 0.6;
            aMaxY = aMinY + lines.length * fontSize * 1.4;
          } else continue;

          const inside = marquee.mode === 'window'
            ? aMinX >= minX && aMaxX <= maxX && aMinY >= minY && aMaxY <= maxY
            : aMaxX >= minX && aMinX <= maxX && aMaxY >= minY && aMinY <= maxY;
          if (inside) annHits.push(ann.id);
        }

        if (hits.length > 0) {
          if (e.shiftKey) {
            setSelectedDevices(prev => [...new Set([...prev, ...hits])]);
          } else {
            setSelectedDevices(hits);
          }
          // Also select annotations if any
          if (annHits.length > 0) {
            for (const id of annHits) selectAnnotation(id, true);
          }
        } else if (annHits.length > 0) {
          // Only annotations hit
          if (!e.shiftKey) setSelectedDevices([]);
          selectAnnotation(null);
          for (const id of annHits) selectAnnotation(id, true);
        } else if (!e.shiftKey) {
          setSelectedDevices([]);
          selectAnnotation(null);
        }

        setMarquee(null);
        marqueeStartRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      marqueeStartRef.current = null;

      // Handle paste preview commit on click
      if (pastePreview && !hasDraggedRef.current) {
        pasteDevice(snapToGrid(world.x), snapToGrid(world.y));
        setPastePreview(false);
        setMouseWorldPos(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // Handle click actions
      if (!hasDraggedRef.current && isDraggingRef.current) {
        switch (interactionMode) {
          case 'place': {
            if (placementCategory) {
              placeSymbol(world.x, world.y, placementCategory, pendingPartData || undefined);
              // Stay in placement mode — press Escape or V to exit (CAD-style continuous placement)
              // Shift+click = single placement (exits after one)
              if (e.shiftKey) {
                setInteractionMode('select');
                setPlacementCategory(null);
                clearPendingPartData();
              }
            }
            break;
          }
          case 'wire': {
            const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms, viewport.scale);
            const hitWireIdx = getWireAtPoint(world.x, world.y, sheetConnections, circuit.devices, circuit.parts, allPositions, 8 / (viewport.scale * MM_TO_PX), circuit.transforms);

            if (!wireStart) {
              // === CLICK 1: Starting a new wire ===
              // Prefer WIRE over PIN so users can branch from existing wires.
              // In ladder diagrams, pins are on wires — without this priority,
              // clicking a wire always snaps to a nearby pin instead.
              if (hitWireIdx !== null) {
                // KiCad approach: split wire at click point, creating a junction.
                // The junction becomes the wireStart for the new branch.
                // connectToWire(null) splits without creating a branch wire.
                const hitConn = sheetConnections[hitWireIdx];
                const { fromPinPos, toPinPos } = computeWirePinPositions(
                  hitConn, circuit.devices, circuit.parts, allPositions, circuit.transforms
                );
                let junctionX = world.x, junctionY = world.y;
                if (fromPinPos && toPinPos) {
                  const projected = projectPointOntoWire(world.x, world.y, hitConn, fromPinPos, toPinPos);
                  junctionX = projected.x;
                  junctionY = projected.y;
                }
                // Split wire at click point — creates junction, returns its device ID
                connectToWire(toGlobalIndex(hitWireIdx), junctionX, junctionY, null as any);
                // Junction was created at the click point — start wire from it
                // The connectToWire function creates the junction device internally
              } else if (hitPin) {
                // No wire hit — use pin
                setWireStart(hitPin);
              }
            } else {
              // === CLICK 2+: Completing or adding waypoint ===
              if (hitPin) {
                // Finish wire at pin (with accumulated waypoints)
                if (hitPin.device !== wireStart.device || hitPin.pin !== wireStart.pin) {
                  createWireConnection(wireStart, hitPin, wireWaypoints.length > 0 ? wireWaypoints : undefined);
                }
                setWireStart(null); setWireWaypoints([]);
              } else if (hitWireIdx !== null) {
                // T-junction: connect to existing wire
                const hitConn = sheetConnections[hitWireIdx];
                const { fromPinPos, toPinPos } = computeWirePinPositions(
                  hitConn, circuit.devices, circuit.parts, allPositions, circuit.transforms
                );
                let junctionX = world.x, junctionY = world.y;
                if (fromPinPos && toPinPos) {
                  const projected = projectPointOntoWire(world.x, world.y, hitConn, fromPinPos, toPinPos);
                  junctionX = projected.x;
                  junctionY = projected.y;
                }
                connectToWire(toGlobalIndex(hitWireIdx), junctionX, junctionY, wireStart);
                setWireStart(null); setWireWaypoints([]);
              } else {
                // Empty space: add waypoint (bend point) and keep drawing
                setWireWaypoints(prev => [...prev, { x: snapToGrid(world.x), y: snapToGrid(world.y) }]);
              }
            }
            break;
          }
          case 'text': {
            // Show text input at click position
            setPendingTextPosition({ x: world.x, y: world.y });
            break;
          }
          case 'shape':
            // Shape drawing handled in mouseDown (drag to draw)
            break;
          case 'select': {
            const hitDeviceId = getSymbolAtPoint(world.x, world.y, activeSheetId ? circuit.devices.filter(d => d.sheetId === activeSheetId) : circuit.devices, circuit.parts, allPositions, circuit.transforms, viewport.scale, panelScale);
            const hitWire = getWireAtPoint(world.x, world.y, sheetConnections, circuit.devices, circuit.parts, allPositions, 8 / (viewport.scale * MM_TO_PX), circuit.transforms);

            if (hitWire !== null && hitWire === selectedWireIndex) {
              const conn = sheetConnections[hitWire];
              const segmentIndex = conn.waypoints ? conn.waypoints.length : 0;
              addWaypoint(toGlobalIndex(hitWire), segmentIndex, {
                x: snapToGrid(world.x),
                y: snapToGrid(world.y),
              });
              break;
            }

            // Check annotation hit (if no device/wire hit)
            if (!hitDeviceId && hitWire === null) {
              const annotations = circuit.annotations || [];
              const sheetAnnotations = activeSheetId
                ? annotations.filter(a => a.sheetId === activeSheetId)
                : annotations;

              let hitAnnotation: string | null = null;
              for (const annotation of sheetAnnotations) {
                if (hitTestAnnotation(annotation, world.x, world.y)) {
                  hitAnnotation = annotation.id;
                  break;
                }
              }

              if (hitAnnotation) {
                selectAnnotation(hitAnnotation);
                const ann = sheetAnnotations.find(a => a.id === hitAnnotation);
                if (ann) {
                  const origin = getAnnotationOrigin(ann);
                  draggingAnnotationRef.current = {
                    id: hitAnnotation,
                    offsetX: world.x - origin.x,
                    offsetY: world.y - origin.y,
                  };
                  pushToHistoryRef.current();
                }
                break;
              }
            }

            if (!hitDeviceId && hitWire === null && !e.shiftKey) {
              setSelectedDevices([]);
              setSelectedWireIndex(null);
              selectAnnotation(null);
            }
            break;
          }
        }
      }

      isDraggingRef.current = false;
      canvas.style.cursor = getCursor();
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (interactionMode !== 'select') return;

      const world = getWorldCoords(e);
      const waypointHit = getWaypointAtPoint(world.x, world.y, sheetConnections);

      if (waypointHit) {
        removeWaypoint(toGlobalIndex(waypointHit.connectionIndex), waypointHit.waypointIndex);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }

      // Space = temporary pan mode
      if (e.key === ' ' && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        if (canvas) canvas.style.cursor = 'grab';
        return;
      }

      // Close context menu on any key
      if (contextMenu) {
        setContextMenu(null);
      }

      // V = select mode
      if (e.key === 'v' || e.key === 'V') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setInteractionMode('select');
          setPlacementCategory(null);
          setWireStart(null); setWireWaypoints([]);
        }
      }

      // H = hand/pan mode
      if (e.key === 'h' || e.key === 'H') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setInteractionMode('pan');
          setPlacementCategory(null);
          setWireStart(null); setWireWaypoints([]);
          setSelectedDevices([]);
        }
      }

      // W = wire mode
      if (e.key === 'w' || e.key === 'W') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setInteractionMode('wire');
          setPlacementCategory(null);
          setSelectedDevices([]);
        }
      }

      // T = text mode
      if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setInteractionMode('text');
          setPlacementCategory(null);
          setWireStart(null); setWireWaypoints([]);
          setSelectedDevices([]);
        }
      }

      // S = shape mode (cycle: rectangle → circle → line → arrow)
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (interactionMode === 'shape') {
            // Cycle through shape tools (use ref to avoid stale closure)
            const tools: ShapeToolType[] = ['rectangle', 'circle', 'line', 'arrow'];
            const idx = tools.indexOf(shapeToolTypeRef.current);
            setShapeToolType(tools[(idx + 1) % tools.length]);
          } else {
            setInteractionMode('shape');
            setPlacementCategory(null);
            setWireStart(null); setWireWaypoints([]);
            setSelectedDevices([]);
            shapeDrawingRef.current = null;
          }
        }
      }

      // + = zoom in (without modifier keys)
      if (e.key === '=' || e.key === '+') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setViewport(prev => {
            const canvas = canvasRef.current;
            if (!canvas) return prev;
            const rect = canvas.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newScale = Math.min(prev.scale * 1.25, 5);
            const ratio = newScale / prev.scale;
            return {
              offsetX: cx - (cx - prev.offsetX) * ratio,
              offsetY: cy - (cy - prev.offsetY) * ratio,
              scale: newScale,
            };
          });
        }
      }

      // - = zoom out (without modifier keys)
      if (e.key === '-' || e.key === '_') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setViewport(prev => {
            const canvas = canvasRef.current;
            if (!canvas) return prev;
            const rect = canvas.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const newScale = Math.max(prev.scale * 0.8, 0.1);
            const ratio = newScale / prev.scale;
            return {
              offsetX: cx - (cx - prev.offsetX) * ratio,
              offsetY: cy - (cy - prev.offsetY) * ratio,
              scale: newScale,
            };
          });
        }
      }

      if (e.key === 'Escape') {
        if (pastePreview) {
          setPastePreview(false);
          setMouseWorldPos(null);
        } else if (wireStart) {
          setWireStart(null); setWireWaypoints([]);
        } else if (shapeDrawingRef.current) {
          shapeDrawingRef.current = null;
        } else if (interactionMode === 'place' || interactionMode === 'text' || interactionMode === 'pan' || interactionMode === 'shape') {
          setInteractionMode('select');
          setPlacementCategory(null);
          shapeDrawingRef.current = null;
        } else if (selectedWireIndex !== null) {
          setSelectedWireIndex(null);
        } else if (selectedDevices.length > 0) {
          setSelectedDevices([]);
        }
      }

      // F2 = edit selected annotation
      if (e.key === 'F2' && selectedAnnotationIds.length === 1) {
        e.preventDefault();
        setEditingAnnotationId(selectedAnnotationIds[0]);
      }

      // Arrow keys = nudge selected annotation by one grid step
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedAnnotationIds.length > 0) {
        e.preventDefault();
        const step = GRID_MM;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        pushToHistoryRef.current();
        for (const annId of selectedAnnotationIds) {
          const ann = (circuit.annotations || []).find(a => a.id === annId);
          if (ann) {
            const updates: Parameters<typeof updateAnnotation>[1] = {
              position: { x: ann.position.x + dx, y: ann.position.y + dy },
            };
            // Line/arrow: also move end point
            if ((ann.annotationType === 'line' || ann.annotationType === 'arrow') && ann.style?.endX != null && ann.style?.endY != null) {
              updates.style = { ...ann.style, endX: ann.style.endX + dx, endY: ann.style.endY + dy };
            }
            updateAnnotation(ann.id, updates);
          }
        }
      }

      // Arrow keys = nudge selected devices by one grid step
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedDevices.length > 0) {
        e.preventDefault();
        const step = GRID_MM;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        pushToHistoryRef.current();
        setDevicePositions(prev => {
          const next = new Map(prev);
          for (const id of selectedDevices) {
            const pos = next.get(id);
            if (pos) {
              next.set(id, { x: pos.x + dx, y: pos.y + dy });
            }
          }
          return next;
        });
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDevices.length > 0) {
          e.preventDefault();
          deleteDevices(selectedDevices);
        } else if (selectedWireIndex !== null) {
          e.preventDefault();
          deleteWire(toGlobalIndex(selectedWireIndex));
          setSelectedWireIndex(null);
        } else if (selectedAnnotationIds.length > 0) {
          e.preventDefault();
          for (const annId of selectedAnnotationIds) deleteAnnotation(annId);
          selectAnnotation(null);
        }
      }

      // Rotation: R = clockwise, Shift+R = counter-clockwise
      if (e.key === 'r' || e.key === 'R') {
        if (selectedDevices.length > 0 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const direction = e.shiftKey ? 'ccw' : 'cw';
          rotateSelectedDevices(direction);
        }
      }

      // Mirror: F = flip horizontal
      if (e.key === 'f' || e.key === 'F') {
        if (selectedDevices.length > 0 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          for (const tag of selectedDevices) {
            mirrorDevice(tag);
          }
        }
      }

      // G = grab/drag with wires (KiCad style) — initiate drag on selected device
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (selectedDevices.length > 0 && !draggingDevice) {
          e.preventDefault();
          dragModeRef.current = 'drag';
          const deviceId = selectedDevices[0];
          const allPositions = getAllPositions();
          const pos = allPositions.get(deviceId);
          if (pos) {
            pushToHistoryRef.current();
            dragHistoryPushedRef.current = true;
            setDraggingDevice(deviceId);
            dragOffsetRef.current = { x: 0, y: 0 };
          }
        }
      }

      // M = move (detach from wires) — initiate move on selected device
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        if (selectedDevices.length > 0 && !draggingDevice) {
          e.preventDefault();
          dragModeRef.current = 'move';
          const deviceId = selectedDevices[0];
          const allPositions = getAllPositions();
          const pos = allPositions.get(deviceId);
          if (pos) {
            pushToHistoryRef.current();
            dragHistoryPushedRef.current = true;
            setDraggingDevice(deviceId);
            dragOffsetRef.current = { x: 0, y: 0 };
          }
        }
      }

      // Shift+G = toggle snap to grid (moved from G)
      if ((e.key === 'G') && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSnapEnabled(!isSnapEnabled());
        window.dispatchEvent(new CustomEvent('snap-toggled'));
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const sheetDevices = activeSheetId
          ? circuit.devices.filter(d => d.sheetId === activeSheetId)
          : circuit.devices;
        setSelectedDevices(sheetDevices.map(d => d.id));
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && (selectedDevices.length > 0 || selectedAnnotationIds.length > 0)) {
        e.preventDefault();
        copyDevice();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && (selectedDevices.length > 0 || selectedAnnotationIds.length > 0)) {
        e.preventDefault();
        copyDevice();
        if (selectedDevices.length > 0) {
          deleteDevices(selectedDevices);
        } else if (selectedAnnotationIds.length > 0) {
          for (const annId of selectedAnnotationIds) deleteAnnotation(annId);
          selectAnnotation(null);
        }
      }

      // Cmd+G = group selected annotations
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && !e.shiftKey && selectedAnnotationIds.length >= 2) {
        e.preventDefault();
        pushToHistoryRef.current();
        const groupId = `group-${Date.now()}`;
        for (const annId of selectedAnnotationIds) {
          updateAnnotation(annId, { groupId } as any);
        }
      }

      // Cmd+Shift+G = ungroup
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && e.shiftKey && selectedAnnotationIds.length > 0) {
        e.preventDefault();
        pushToHistoryRef.current();
        for (const annId of selectedAnnotationIds) {
          updateAnnotation(annId, { groupId: undefined } as any);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        setPastePreview(true);
        // Set initial mouse position for ghost preview
        const rect = canvas.getBoundingClientRect();
        const mouseX = lastMousePosRef.current.x - rect.left;
        const mouseY = lastMousePosRef.current.y - rect.top;
        const mmScalePaste = viewport.scale * MM_TO_PX;
        setMouseWorldPos({
          x: (mouseX - viewport.offsetX) / mmScalePaste,
          y: (mouseY - viewport.offsetY) / mmScalePaste,
        });
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedDevices.length > 0) {
        e.preventDefault();
        duplicateDevice();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      }

      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redoRef.current();
      }

      // Zoom to fit: Ctrl+0
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        zoomToFit();
      }
    };

    // Right-click context menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const world = getWorldCoords(e);
      const allPositions = getAllPositions();
      const rect = canvas.getBoundingClientRect();

      const hitDeviceId = getSymbolAtPoint(world.x, world.y, activeSheetId ? circuit.devices.filter(d => d.sheetId === activeSheetId) : circuit.devices, circuit.parts, allPositions, circuit.transforms, viewport.scale, panelScale);
      const wireHit = getWireHitWithDistance(world.x, world.y, sheetConnections, circuit.devices, circuit.parts, allPositions, 8 / (viewport.scale * MM_TO_PX), circuit.transforms);
      const hitWire = wireHit?.index ?? null;

      // Wire takes priority when click is very close to wire path (within ~4 screen-px)
      if (wireHit !== null && hitDeviceId && wireHit.distance <= 4 / (viewport.scale * MM_TO_PX)) {
        setSelectedWireIndex(hitWire);
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          worldX: world.x,
          worldY: world.y,
          target: 'wire',
          wireIndex: hitWire ?? undefined,
        });
      } else if (hitDeviceId) {
        if (!selectedDevices.includes(hitDeviceId)) {
          setSelectedDevices([hitDeviceId]);
        }
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          worldX: world.x,
          worldY: world.y,
          target: 'device',
          deviceTag: hitDeviceId,  // now actually device ID
        });
      } else if (hitWire !== null) {
        setSelectedWireIndex(hitWire);
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          worldX: world.x,
          worldY: world.y,
          target: 'wire',
          wireIndex: hitWire,
        });
      } else {
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          worldX: world.x,
          worldY: world.y,
          target: 'canvas',
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeldRef.current = false;
        if (!isPanningRef.current && canvas) {
          canvas.style.cursor = getCursor();
        }
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.style.cursor = getCursor();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [viewport, interactionMode, placementCategory, circuit, wireStart, selectedDevices, selectedWireIndex, draggingDevice, draggingWaypoint, draggingEndpoint, draggingSegment, marquee, contextMenu, getAllPositions, placeSymbol, pendingPartData, clearPendingPartData, createWireConnection, connectToWire, deleteDevices, copyDevice, pasteDevice, duplicateDevice, clipboard, addWaypoint, moveWaypoint, removeWaypoint, replaceWaypoints, reconnectWire, pushToHistoryRef, undoRef, redoRef, setSelectedDevices, setSelectedWireIndex, setDevicePositions, rotateDevice, rotateSelectedDevices, mirrorDevice, deviceTransforms, zoomToFit, selectAnnotation, activeSheetId, pastePreview]);

  return {
    canvasRef,
    viewport,
    setViewport,
    interactionMode,
    setInteractionMode,
    placementCategory,
    setPlacementCategory,
    wireStart,
    setWireStart,
    wireWaypoints,
    mouseWorldPos,
    draggingDevice,
    draggingEndpoint,
    marquee,
    contextMenu,
    setContextMenu,
    pastePreview,
    pendingTextPosition,
    setPendingTextPosition,
    editingAnnotationId,
    setEditingAnnotationId,
    zoomToFit,
    renderHandleRef,
    shapeToolType,
    setShapeToolType,
    // Compute preview from ref at render time — mouseWorldPos change triggers re-render
    drawingShapePreview: shapeDrawingRef.current && mouseWorldPos ? {
      type: shapeDrawingRef.current.type,
      start: shapeDrawingRef.current.start,
      end: mouseWorldPos,
    } : null,
    sheetConnections,
  };
}

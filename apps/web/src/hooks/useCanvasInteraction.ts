/**
 * Canvas interaction hook - all mouse/keyboard handlers
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Part, Annotation } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import { getWireAtPoint, getWaypointAtPoint, getWireEndpointAtPoint, getWireSegmentAtPoint, toOrthogonalPath, getPinWorldPosition, resolveDevice } from '../renderer/circuit-renderer';
import type { Connection } from '../renderer/circuit-renderer';
import type { Point, Viewport, DeviceTransform } from '../renderer/types';
import {
  snapToGrid,
  getPinAtPoint,
  getSymbolAtPoint,
  type InteractionMode,
  type SymbolCategory,
  type PinHit,
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
  mouseWorldPos: Point | null;
  draggingDevice: string | null;
  draggingEndpoint: DraggingEndpointState | null;
  marquee: MarqueeRect | null;
  contextMenu: { x: number; y: number; worldX: number; worldY: number; target: 'device' | 'wire' | 'canvas'; deviceTag?: string; wireIndex?: number } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<UseCanvasInteractionReturn['contextMenu']>>;
  zoomToFit: () => void;
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
  createWireConnection: (fromPin: PinHit, toPin: PinHit) => void;
  deleteDevices: (deviceIds: string[]) => void;
  deleteWire: (connectionIndex: number) => void;
  addWaypoint: (connectionIndex: number, segmentIndex: number, point: Point) => void;
  moveWaypoint: (connectionIndex: number, waypointIndex: number, point: Point) => void;
  removeWaypoint: (connectionIndex: number, waypointIndex: number) => void;
  replaceWaypoints: (connectionIndex: number, waypoints: Point[] | undefined) => void;
  reconnectWire: (connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => void;
  connectToWire: (connectionIndex: number, worldX: number, worldY: number, startPin: PinHit) => void;
  addAnnotation: (worldX: number, worldY: number, content: string) => void;
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
  mirrorDevice: (deviceId: string) => void;
  deviceTransforms: Map<string, DeviceTransform>;
  selectAnnotation: (id: string | null) => void;
  activeSheetId: string;
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

  const fromGeometry = getSymbolGeometry(fromPart?.category || 'unknown');
  const toGeometry = getSymbolGeometry(toPart?.category || 'unknown');

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
    connectToWire,
    addAnnotation,
    copyDevice,
    pasteDevice,
    duplicateDevice,
    clipboard,
    pushToHistoryRef,
    undoRef,
    redoRef,
    setDevicePositions,
    rotateDevice,
    mirrorDevice,
    deviceTransforms,
    selectAnnotation,
    activeSheetId,
  } = deps;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [placementCategory, setPlacementCategory] = useState<SymbolCategory | null>(null);
  const [wireStart, setWireStart] = useState<PinHit | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);

  // Drag state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const dragOffsetRef = useRef<Point | null>(null);
  const dragHistoryPushedRef = useRef(false);

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
      const geom = getSymbolGeometry(part?.category || 'unknown');
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + geom.width);
      maxY = Math.max(maxY, pos.y + geom.height);
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

    const getWorldCoords = (e: MouseEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      return {
        x: (mouseX - viewport.offsetX) / viewport.scale,
        y: (mouseY - viewport.offsetY) / viewport.scale,
      };
    };

    const getCursor = (): string => {
      if (draggingDevice) return 'move';
      switch (interactionMode) {
        case 'wire': return 'crosshair';
        case 'place': return 'crosshair';
        case 'text': return 'text';
        case 'select':
        default: return isDraggingRef.current ? 'grabbing' : 'grab';
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = viewport.scale * zoomFactor;
      const clampedScale = Math.min(Math.max(newScale, 0.1), 5);
      const scaleRatio = clampedScale / viewport.scale;
      const newOffsetX = mouseX - (mouseX - viewport.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - viewport.offsetY) * scaleRatio;

      setViewport({
        offsetX: newOffsetX,
        offsetY: newOffsetY,
        scale: clampedScale,
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
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
            circuit.connections, circuit.devices, circuit.parts, allPositions, 10, circuit.transforms
          );
          if (endpointHit) {
            const conn = circuit.connections[selectedWireIndex];
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

          const waypointHit = getWaypointAtPoint(world.x, world.y, circuit.connections);
          if (waypointHit && waypointHit.connectionIndex === selectedWireIndex) {
            setDraggingWaypoint(waypointHit);
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'move';
            return;
          }

          // Check for segment drag on selected wire
          const conn = circuit.connections[selectedWireIndex];
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
              replaceWaypoints(selectedWireIndex, interior.length > 0 ? interior : undefined);

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

        // hitSymbol returns device ID
        const hitDeviceId = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms);
        if (hitDeviceId) {
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
          dragHistoryPushedRef.current = false;
          const symbolPos = allPositions.get(hitDeviceId);
          if (symbolPos) {
            dragOffsetRef.current = {
              x: world.x - symbolPos.x,
              y: world.y - symbolPos.y,
            };
          }
          canvas.style.cursor = 'move';
          return;
        }

        const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions, 8, circuit.transforms);
        if (hitWire !== null) {
          setSelectedDevices([]);
          if (hitWire !== selectedWireIndex) {
            setSelectedWireIndex(hitWire);
          }
          isDraggingRef.current = false;
          return;
        }
      }

      // If no hit in select mode, start marquee selection
      if (interactionMode === 'select') {
        marqueeStartRef.current = world;
      }

      canvas.style.cursor = getCursor();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world: Point = {
        x: (mouseX - viewport.offsetX) / viewport.scale,
        y: (mouseY - viewport.offsetY) / viewport.scale,
      };

      // Track mouse position for placement preview and wire preview
      if (interactionMode === 'place' || interactionMode === 'wire') {
        setMouseWorldPos(world);
      }

      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDraggedRef.current = true;
      }

      // Drag waypoint
      if (draggingWaypoint) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }
        moveWaypoint(draggingWaypoint.connectionIndex, draggingWaypoint.waypointIndex, world);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag segment
      if (draggingSegment) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }

        const conn = circuit.connections[draggingSegment.connectionIndex];
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

        replaceWaypoints(draggingSegment.connectionIndex, waypoints);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag endpoint
      if (draggingEndpoint) {
        setMouseWorldPos(world);
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
          const newX = snapToGrid(world.x - dragOffsetRef.current.x);
          const newY = snapToGrid(world.y - dragOffsetRef.current.y);
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
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Marquee selection
      if (interactionMode === 'select' && marqueeStartRef.current && !draggingDevice && !draggingWaypoint && !draggingEndpoint && !draggingSegment) {
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

      // Pan canvas
      if (interactionMode === 'select' || hasDraggedRef.current) {
        setViewport(prev => ({
          ...prev,
          offsetX: prev.offsetX + deltaX,
          offsetY: prev.offsetY + deltaY,
        }));
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      const world = getWorldCoords(e);
      const allPositions = getAllPositions();

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
        const conn = circuit.connections[draggingSegment.connectionIndex];
        if (conn.waypoints && conn.waypoints.length > 2) {
          const simplified = simplifyWaypoints(conn.waypoints);
          replaceWaypoints(draggingSegment.connectionIndex, simplified);
        }
        setDraggingSegment(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End endpoint dragging
      if (draggingEndpoint) {
        const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms);
        if (hitPin) {
          const isOriginalPin = hitPin.device === draggingEndpoint.originalPin.device &&
                               hitPin.pin === draggingEndpoint.originalPin.pin;
          if (!isOriginalPin) {
            reconnectWire(draggingEndpoint.connectionIndex, draggingEndpoint.endpoint, hitPin);
          }
        } else if (hasDraggedRef.current) {
          const conn = circuit.connections[draggingEndpoint.connectionIndex];
          const waypointPos = { x: snapToGrid(world.x), y: snapToGrid(world.y) };

          if (draggingEndpoint.endpoint === 'from') {
            addWaypoint(draggingEndpoint.connectionIndex, 0, waypointPos);
          } else {
            const insertIndex = conn.waypoints ? conn.waypoints.length : 0;
            addWaypoint(draggingEndpoint.connectionIndex, insertIndex, waypointPos);
          }
        }
        setDraggingEndpoint(null);
        setMouseWorldPos(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
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
        for (const device of circuit.devices) {
          const pos = allPositions.get(device.id);
          if (!pos) continue;
          const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
          const geom = getSymbolGeometry(part?.category || 'unknown');

          const devMinX = pos.x;
          const devMinY = pos.y;
          const devMaxX = pos.x + geom.width;
          const devMaxY = pos.y + geom.height;

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

        if (hits.length > 0) {
          if (e.shiftKey) {
            setSelectedDevices(prev => [...new Set([...prev, ...hits])]);
          } else {
            setSelectedDevices(hits);
          }
        } else if (!e.shiftKey) {
          setSelectedDevices([]);
        }

        setMarquee(null);
        marqueeStartRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      marqueeStartRef.current = null;

      // Handle click actions
      if (!hasDraggedRef.current && isDraggingRef.current) {
        switch (interactionMode) {
          case 'place': {
            if (placementCategory) {
              placeSymbol(world.x, world.y, placementCategory, pendingPartData || undefined);
              // Exit placement mode after placing
              setInteractionMode('select');
              setPlacementCategory(null);
              clearPendingPartData();
            }
            break;
          }
          case 'wire': {
            const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms);
            if (hitPin) {
              if (!wireStart) {
                setWireStart(hitPin);
              } else {
                if (hitPin.device !== wireStart.device || hitPin.pin !== wireStart.pin) {
                  createWireConnection(wireStart, hitPin);
                }
                setWireStart(null);
              }
            } else if (wireStart) {
              // Check if clicking on an existing wire for T-junction
              const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions, 8, circuit.transforms);
              if (hitWire !== null) {
                connectToWire(hitWire, world.x, world.y, wireStart);
                setWireStart(null);
              }
            }
            break;
          }
          case 'text': {
            const text = prompt('Enter annotation text:');
            if (text) {
              addAnnotation(world.x, world.y, text);
            }
            break;
          }
          case 'select': {
            const hitDeviceId = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms);
            const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions, 8, circuit.transforms);

            if (hitWire !== null && hitWire === selectedWireIndex) {
              const conn = circuit.connections[hitWire];
              const segmentIndex = conn.waypoints ? conn.waypoints.length : 0;
              addWaypoint(hitWire, segmentIndex, {
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
                if (annotation.annotationType !== 'text') continue;
                const fontSize = annotation.style?.fontSize || 14;
                const textWidth = annotation.content.length * fontSize * 0.6;
                const textHeight = fontSize * 1.2;
                if (
                  world.x >= annotation.position.x &&
                  world.x <= annotation.position.x + textWidth &&
                  world.y >= annotation.position.y &&
                  world.y <= annotation.position.y + textHeight
                ) {
                  hitAnnotation = annotation.id;
                  break;
                }
              }

              if (hitAnnotation) {
                selectAnnotation(hitAnnotation);
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
      const waypointHit = getWaypointAtPoint(world.x, world.y, circuit.connections);

      if (waypointHit) {
        removeWaypoint(waypointHit.connectionIndex, waypointHit.waypointIndex);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keys when user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
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
          setWireStart(null);
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
          setWireStart(null);
          setSelectedDevices([]);
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
        if (wireStart) {
          setWireStart(null);
        } else if (interactionMode === 'place' || interactionMode === 'text') {
          setInteractionMode('select');
          setPlacementCategory(null);
        } else if (selectedWireIndex !== null) {
          setSelectedWireIndex(null);
        } else if (selectedDevices.length > 0) {
          setSelectedDevices([]);
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDevices.length > 0) {
          e.preventDefault();
          deleteDevices(selectedDevices);
        } else if (selectedWireIndex !== null) {
          e.preventDefault();
          deleteWire(selectedWireIndex);
          setSelectedWireIndex(null);
        }
      }

      // Rotation: R = clockwise, Shift+R = counter-clockwise
      if (e.key === 'r' || e.key === 'R') {
        if (selectedDevices.length > 0 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const direction = e.shiftKey ? 'ccw' : 'cw';
          for (const tag of selectedDevices) {
            rotateDevice(tag, direction);
          }
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

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedDevices(circuit.devices.map(d => d.id));
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedDevices.length > 0) {
        e.preventDefault();
        copyDevice();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = lastMousePosRef.current.x - rect.left;
        const mouseY = lastMousePosRef.current.y - rect.top;
        const worldX = (mouseX - viewport.offsetX) / viewport.scale;
        const worldY = (mouseY - viewport.offsetY) / viewport.scale;
        pasteDevice(worldX, worldY);
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

      const hitDeviceId = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions, circuit.transforms);
      const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions, 8, circuit.transforms);

      if (hitDeviceId) {
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

    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    canvas.style.cursor = getCursor();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewport, interactionMode, placementCategory, circuit, wireStart, selectedDevices, selectedWireIndex, draggingDevice, draggingWaypoint, draggingEndpoint, draggingSegment, marquee, contextMenu, getAllPositions, placeSymbol, pendingPartData, clearPendingPartData, createWireConnection, connectToWire, deleteDevices, copyDevice, pasteDevice, duplicateDevice, clipboard, addWaypoint, moveWaypoint, removeWaypoint, replaceWaypoints, reconnectWire, pushToHistoryRef, undoRef, redoRef, setSelectedDevices, setSelectedWireIndex, setDevicePositions, rotateDevice, mirrorDevice, deviceTransforms, zoomToFit, selectAnnotation, activeSheetId]);

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
    mouseWorldPos,
    draggingDevice,
    draggingEndpoint,
    marquee,
    contextMenu,
    setContextMenu,
    zoomToFit,
  };
}

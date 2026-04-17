/**
 * Sequential wire routing for device drag release.
 *
 * On drag release, collect every connection attached to a moved device and
 * route them together with `routeWires()` from core-engine. The router runs
 * A* for each wire, then nudges overlapping parallel segments apart — the
 * exact behavior needed to fix "drag motor down 30mm → 3 phase wires all
 * collapse to the same line" (Problem 1 from docs/plans/wiring-drag-quality.md).
 *
 * The renderer's current fallback (toOrthogonalPath L-shape) stays active for
 * unaffected wires. This helper only produces new waypoints for wires whose
 * endpoints were part of the drag.
 */

import type { Device, Part } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { Point as EnginePoint, Obstacle, RouteRequest } from '@fusion-cad/core-engine';
import { routeWires } from '@fusion-cad/core-engine';
import { getSymbolGeometry } from '../renderer/symbols';
import { applyPinTransform } from './pin-math';

/** Cap attached-wire count before we give up and fall back to L-shape. */
const PERF_GUARD_MAX_WIRES = 30;

/** Map fusionCad pin direction to the router's ConnDirection. */
function mapPinDirection(
  dir: string | undefined,
  transformRotation: number | undefined,
): 'left' | 'right' | 'up' | 'down' | undefined {
  if (!dir) return undefined;
  // First normalize to up/down/left/right in the unrotated frame.
  let base: 'left' | 'right' | 'up' | 'down';
  switch (dir) {
    case 'top': base = 'up'; break;
    case 'bottom': base = 'down'; break;
    case 'left': base = 'left'; break;
    case 'right': base = 'right'; break;
    default: return undefined;
  }
  const rot = ((transformRotation || 0) % 360 + 360) % 360;
  if (rot === 0) return base;
  // Rotate direction by device rotation.
  const order: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];
  const idx = order.indexOf(base);
  const shift = rot === 90 ? 1 : rot === 180 ? 2 : 3;
  return order[(idx + shift) % 4];
}

/** Build the device's rotated bounding box in world space. */
function getDeviceBounds(
  pos: Point,
  geometry: { width: number; height: number },
  transform?: { rotation: number; mirrorH?: boolean },
): { x: number; y: number; width: number; height: number } {
  const rot = ((transform?.rotation || 0) % 360 + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const w = swapped ? geometry.height : geometry.width;
  const h = swapped ? geometry.width : geometry.height;
  return { x: pos.x, y: pos.y, width: w, height: h };
}

/** Internal shape describing a pin lookup. */
interface PinInfo {
  world: EnginePoint;
  direction: 'left' | 'right' | 'up' | 'down' | undefined;
}

function resolvePin(
  device: Device,
  pinId: string,
  parts: Part[],
  positions: Map<string, Point>,
  transforms: Record<string, { rotation: number; mirrorH?: boolean }> | undefined,
): PinInfo | null {
  const pos = positions.get(device.id);
  if (!pos) return null;
  const part = device.partId ? parts.find(p => p.id === device.partId) : null;
  const symbolKey = (part as any)?.symbolCategory || (part as any)?.category || 'unknown';
  const geometry = getSymbolGeometry(symbolKey);
  const pin = geometry.pins.find((p: any) => p.id === pinId);
  if (!pin) return null;
  const transform = transforms?.[device.id];
  const world = applyPinTransform(pos, pin.position, geometry, transform);
  return {
    world,
    direction: mapPinDirection(pin.direction, transform?.rotation),
  };
}

export interface SequentialRouteInput {
  circuit: CircuitData;
  positions: Map<string, Point>;
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>;
  activeSheetId: string;
  movedDeviceIds: Set<string>;
}

export interface SequentialRouteOutput {
  /** Map from sheet-wide connection index → interior waypoints (empty = straight). */
  connectionWaypoints: Map<number, EnginePoint[]>;
  /** True if the perf guard skipped routing. */
  skippedForPerf: boolean;
}

/**
 * Run sequential routing for wires attached to `movedDeviceIds` on the active
 * sheet. Returns the waypoints to apply via replaceWaypoints — callers are
 * responsible for issuing the history push + applying the mutation.
 */
export function sequentialRouteAfterDrag(input: SequentialRouteInput): SequentialRouteOutput {
  const { circuit, positions, transforms, activeSheetId, movedDeviceIds } = input;

  // Find sheet-scoped connections that touch a moved device.
  const affectedIdx: number[] = [];
  for (let i = 0; i < circuit.connections.length; i++) {
    const c = circuit.connections[i];
    if (c.sheetId && c.sheetId !== activeSheetId) continue;
    const fromId = c.fromDeviceId || circuit.devices.find((d: Device) => d.tag === c.fromDevice)?.id;
    const toId = c.toDeviceId || circuit.devices.find((d: Device) => d.tag === c.toDevice)?.id;
    if (!fromId || !toId) continue;
    if (movedDeviceIds.has(fromId) || movedDeviceIds.has(toId)) {
      affectedIdx.push(i);
    }
  }

  if (affectedIdx.length === 0) {
    return { connectionWaypoints: new Map(), skippedForPerf: false };
  }
  if (affectedIdx.length > PERF_GUARD_MAX_WIRES) {
    return { connectionWaypoints: new Map(), skippedForPerf: true };
  }

  // Build obstacles: all OTHER devices on the active sheet (not moved, not junction).
  const obstacles: Obstacle[] = [];
  for (const device of circuit.devices) {
    if (device.sheetId !== activeSheetId) continue;
    if (movedDeviceIds.has(device.id)) continue;
    const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const symbolKey = (part as any)?.symbolCategory || (part as any)?.category || 'unknown';
    if (symbolKey === 'junction' || (device as any).function?.toLowerCase?.().includes('junction')) continue;
    const pos = positions.get(device.id);
    if (!pos) continue;
    const geometry = getSymbolGeometry(symbolKey);
    const bounds = getDeviceBounds(pos, geometry, transforms?.[device.id]);
    obstacles.push({ id: device.id, bounds });
  }

  // Build route requests from the affected connections.
  const requests: RouteRequest[] = [];
  const requestToIdx = new Map<string, number>();
  for (const idx of affectedIdx) {
    const c = circuit.connections[idx];
    const fromDev = c.fromDeviceId
      ? circuit.devices.find(d => d.id === c.fromDeviceId)
      : circuit.devices.find(d => d.tag === c.fromDevice);
    const toDev = c.toDeviceId
      ? circuit.devices.find(d => d.id === c.toDeviceId)
      : circuit.devices.find(d => d.tag === c.toDevice);
    if (!fromDev || !toDev) continue;
    const fromPin = resolvePin(fromDev, c.fromPin, circuit.parts, positions, transforms);
    const toPin = resolvePin(toDev, c.toPin, circuit.parts, positions, transforms);
    if (!fromPin || !toPin) continue;
    const reqId = `conn-${idx}`;
    requests.push({
      id: reqId,
      start: fromPin.world,
      end: toPin.world,
      startDirection: fromPin.direction,
      endDirection: toPin.direction,
      netId: c.netId,
    });
    requestToIdx.set(reqId, idx);
  }

  if (requests.length === 0) {
    return { connectionWaypoints: new Map(), skippedForPerf: false };
  }

  // Route. padding=2 (tight around device edges); spacing=5 (one grid unit).
  const results = routeWires(requests, obstacles, 2, 5);

  const out = new Map<number, EnginePoint[]>();
  for (const result of results) {
    const idx = requestToIdx.get(result.id);
    if (idx === undefined) continue;
    if (!result.success || result.path.waypoints.length < 2) continue;
    // Strip endpoints — connection endpoints are the pin positions already.
    const interior = result.path.waypoints.slice(1, -1);
    out.set(idx, interior);
  }
  return { connectionWaypoints: out, skippedForPerf: false };
}

/** Re-export Point so callers don't need two imports. */
export type Point = { x: number; y: number };

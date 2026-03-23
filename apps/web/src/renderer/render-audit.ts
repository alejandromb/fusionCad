/**
 * Render Audit — captures computed render data without drawing.
 *
 * Mirrors the render pipeline logic to extract:
 * - Wire paths (straight, waypoint, or auto-routed)
 * - Device bounding boxes (after rotation)
 * - Text label positions (tags, functions, rung numbers)
 * - Overlap detection
 *
 * Dev-only tool for validating schematic quality from structured data.
 * Used by getLayoutReport() in the state bridge and by E2E tests.
 */

import type { CircuitData } from './circuit-renderer';
import { toOrthogonalPath, filterConnectionsBySheet, getPinWorldPosition } from './circuit-renderer';
import { getSymbolGeometry } from './symbols';
import { SHEET_SIZES } from './title-block';
import type { Point } from './types';
import type { Part, Sheet, LadderBlock } from '@fusion-cad/core-model';

// ================================================================
//  Types
// ================================================================

export interface WireAudit {
  index: number;
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  pathPoints: Point[];
  pathType: 'straight' | 'waypoint' | 'fallback';
  isHorizontal: boolean;
  isVertical: boolean;
  totalLength: number;
}

export interface DeviceAudit {
  id: string;
  tag: string;
  fn: string;
  symbol: string;
  position: Point;
  rotation: number;
  bounds: { x: number; y: number; width: number; height: number };
  pinPositions: Array<{ pinId: string; x: number; y: number }>;
}

export interface LabelAudit {
  type: 'tag' | 'function' | 'rungNumber' | 'rungDesc' | 'wireNumber';
  text: string;
  x: number;
  y: number;
}

export interface OverlapIssue {
  type: 'device-device' | 'label-label' | 'label-device';
  a: string;
  b: string;
  overlapArea: number;
}

export interface RenderAuditResult {
  sheet: {
    id: string;
    name: string;
    size: string;
    width: number;
    height: number;
  };
  wires: WireAudit[];
  devices: DeviceAudit[];
  labels: LabelAudit[];
  overlaps: OverlapIssue[];
  stats: {
    totalDevices: number;
    totalWires: number;
    horizontalWires: number;
    verticalWires: number;
    diagonalWires: number;
    unconnectedDevices: string[];
    devicesOutsideSheet: string[];
    labelsOutsideSheet: number;
  };
}

// ================================================================
//  Main Audit Function
// ================================================================

export function captureRenderAudit(
  circuit: CircuitData,
  devicePositions: Map<string, Point>,
  activeSheetId: string,
  sheets: Sheet[],
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): RenderAuditResult {
  const sheet = sheets.find(s => s.id === activeSheetId);
  const sheetSize = SHEET_SIZES[sheet?.size || 'Tabloid'] || SHEET_SIZES['Tabloid'];

  // Filter devices and connections by sheet
  const devices = circuit.devices.filter(d => d.sheetId === activeSheetId);
  const connections = filterConnectionsBySheet(
    circuit.connections,
    devices,
    activeSheetId,
  );

  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) partMap.set(part.id, part);

  const mergedTransforms = { ...(circuit.transforms || {}), ...(transforms || {}) };

  // ---- Audit devices ----
  const deviceAudits: DeviceAudit[] = [];
  for (const device of devices) {
    const pos = devicePositions.get(device.id);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const symbolKey = part?.symbolCategory || (part as any)?.category || 'unknown';

    let geometry = { width: 40, height: 40, pins: [] as any[] };
    try { geometry = getSymbolGeometry(symbolKey); } catch { /* fallback */ }

    const transform = mergedTransforms[device.id];
    const rotation = transform?.rotation || 0;
    const isRotated90 = rotation % 180 !== 0;
    const w = isRotated90 ? geometry.height : geometry.width;
    const h = isRotated90 ? geometry.width : geometry.height;
    const cx = pos.x + geometry.width / 2;
    const cy = pos.y + geometry.height / 2;

    // Compute pin world positions
    const pinPositions = geometry.pins.map((pin: any) => {
      const worldPos = getPinWorldPosition(
        pos, pin.position, geometry, transform
      );
      return { pinId: pin.id, x: worldPos.x, y: worldPos.y };
    });

    deviceAudits.push({
      id: device.id,
      tag: device.tag,
      fn: device.function || '',
      symbol: symbolKey,
      position: pos,
      rotation,
      bounds: { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
      pinPositions,
    });
  }

  // ---- Audit wires ----
  const wireAudits: WireAudit[] = [];
  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];

    // Resolve pin positions
    const fromDev = conn.fromDeviceId
      ? devices.find(d => d.id === conn.fromDeviceId)
      : devices.find(d => d.tag === conn.fromDevice);
    const toDev = conn.toDeviceId
      ? devices.find(d => d.id === conn.toDeviceId)
      : devices.find(d => d.tag === conn.toDevice);

    if (!fromDev || !toDev) continue;

    const fromPos = devicePositions.get(fromDev.id);
    const toPos = devicePositions.get(toDev.id);
    if (!fromPos || !toPos) continue;

    const fromPart = fromDev.partId ? partMap.get(fromDev.partId) : null;
    const toPart = toDev.partId ? partMap.get(toDev.partId) : null;
    const fromSymbol = fromPart?.symbolCategory || (fromPart as any)?.category || 'unknown';
    const toSymbol = toPart?.symbolCategory || (toPart as any)?.category || 'unknown';

    let fromGeom = { width: 40, height: 40, pins: [] as any[] };
    let toGeom = { width: 40, height: 40, pins: [] as any[] };
    try { fromGeom = getSymbolGeometry(fromSymbol); } catch {}
    try { toGeom = getSymbolGeometry(toSymbol); } catch {}

    const fromPinDef = fromGeom.pins.find((p: any) => p.id === conn.fromPin);
    const toPinDef = toGeom.pins.find((p: any) => p.id === conn.toPin);

    const fromPinPos = fromPinDef
      ? getPinWorldPosition(fromPos, fromPinDef.position, fromGeom, mergedTransforms[fromDev.id])
      : { x: fromPos.x + fromGeom.width / 2, y: fromPos.y + fromGeom.height / 2 };
    const toPinPos = toPinDef
      ? getPinWorldPosition(toPos, toPinDef.position, toGeom, mergedTransforms[toDev.id])
      : { x: toPos.x + toGeom.width / 2, y: toPos.y + toGeom.height / 2 };

    // Compute path
    let pathPoints: Point[];
    let pathType: 'straight' | 'waypoint' | 'fallback';

    const isStraight = Math.abs(fromPinPos.x - toPinPos.x) < 1 || Math.abs(fromPinPos.y - toPinPos.y) < 1;

    if (isStraight && conn.waypoints == null) {
      pathPoints = [fromPinPos, toPinPos];
      pathType = 'straight';
    } else if (conn.waypoints != null) {
      const rawPoints = [fromPinPos, ...conn.waypoints, toPinPos];
      pathPoints = toOrthogonalPath(rawPoints);
      pathType = 'waypoint';
    } else {
      // Fallback orthogonal (auto-router would run here in the renderer,
      // but we can't run it without obstacles. Use simple orthogonal.)
      pathPoints = toOrthogonalPath([fromPinPos, toPinPos]);
      pathType = 'fallback';
    }

    // Compute metrics
    let totalLength = 0;
    for (let j = 1; j < pathPoints.length; j++) {
      totalLength += Math.hypot(
        pathPoints[j].x - pathPoints[j - 1].x,
        pathPoints[j].y - pathPoints[j - 1].y,
      );
    }

    const isHorizontal = pathPoints.length === 2 && Math.abs(pathPoints[0].y - pathPoints[1].y) < 1;
    const isVertical = pathPoints.length === 2 && Math.abs(pathPoints[0].x - pathPoints[1].x) < 1;

    wireAudits.push({
      index: i,
      fromDevice: fromDev.tag,
      fromPin: conn.fromPin,
      toDevice: toDev.tag,
      toPin: conn.toPin,
      pathPoints,
      pathType,
      isHorizontal,
      isVertical,
      totalLength,
    });
  }

  // ---- Audit labels ----
  const labels: LabelAudit[] = [];

  // Device tags and function text
  for (const da of deviceAudits) {
    if (da.tag) {
      labels.push({
        type: 'tag',
        text: da.tag,
        x: da.position.x + da.bounds.width / 2,
        y: da.position.y - 3,
      });
    }
    if (da.fn && da.symbol !== 'source-arrow' && da.symbol !== 'destination-arrow' && da.symbol !== 'junction') {
      labels.push({
        type: 'function',
        text: da.fn,
        x: da.position.x + da.bounds.width / 2,
        y: da.position.y - 18,
      });
    }
  }

  // Rung numbers and descriptions
  const blocks = (circuit.blocks || []).filter(b => b.sheetId === activeSheetId);
  for (const block of blocks) {
    if (block.blockType !== 'ladder') continue;
    const lb = block as LadderBlock;
    const cfg = lb.ladderConfig;
    const blockRungs = (circuit.rungs || [])
      .filter(r => r.blockId === block.id)
      .sort((a, b) => a.number - b.number);

    for (let ri = 0; ri < blockRungs.length; ri++) {
      const rung = blockRungs[ri];
      const rungY = cfg.firstRungY + ri * cfg.rungSpacing;
      labels.push({
        type: 'rungNumber',
        text: String(rung.number),
        x: cfg.railL1X - 20,
        y: rungY,
      });
      if (rung.description) {
        labels.push({
          type: 'rungDesc',
          text: rung.description,
          x: cfg.railL2X + 16,
          y: rungY,
        });
      }
    }
  }

  // ---- Detect overlaps ----
  // Skip: junctions (sit on wires), arrows (manual), and large multi-rung devices
  // (PLC modules intentionally span multiple rungs and overlap with rung devices).
  const overlaps: OverlapIssue[] = [];
  const MULTI_RUNG_HEIGHT_THRESHOLD = 200; // devices taller than this are multi-rung
  const overlapCandidates = deviceAudits.filter(d =>
    d.symbol !== 'junction' &&
    d.symbol !== 'source-arrow' &&
    d.symbol !== 'destination-arrow' &&
    d.bounds.height < MULTI_RUNG_HEIGHT_THRESHOLD &&
    d.bounds.width < MULTI_RUNG_HEIGHT_THRESHOLD
  );
  for (let i = 0; i < overlapCandidates.length; i++) {
    for (let j = i + 1; j < overlapCandidates.length; j++) {
      const a = overlapCandidates[i].bounds;
      const b = overlapCandidates[j].bounds;
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const area = overlapX * overlapY;
      if (area > 50) {
        overlaps.push({
          type: 'device-device',
          a: overlapCandidates[i].tag,
          b: overlapCandidates[j].tag,
          overlapArea: area,
        });
      }
    }
  }

  // ---- Compute stats ----
  const connectedDevIds = new Set<string>();
  for (const conn of connections) {
    if (conn.fromDeviceId) connectedDevIds.add(conn.fromDeviceId);
    if (conn.toDeviceId) connectedDevIds.add(conn.toDeviceId);
  }
  const unconnectedDevices = devices
    .filter(d => !connectedDevIds.has(d.id))
    .map(d => d.tag);

  const devicesOutsideSheet = deviceAudits
    .filter(d => d.bounds.x + d.bounds.width > sheetSize.width || d.bounds.y + d.bounds.height > sheetSize.height)
    .map(d => d.tag);

  const labelsOutsideSheet = labels.filter(
    l => l.x < 0 || l.y < 0 || l.x > sheetSize.width || l.y > sheetSize.height,
  ).length;

  return {
    sheet: {
      id: activeSheetId,
      name: sheet?.name || '',
      size: sheet?.size || 'Tabloid',
      width: sheetSize.width,
      height: sheetSize.height,
    },
    wires: wireAudits,
    devices: deviceAudits,
    labels,
    overlaps,
    stats: {
      totalDevices: deviceAudits.length,
      totalWires: wireAudits.length,
      horizontalWires: wireAudits.filter(w => w.isHorizontal).length,
      verticalWires: wireAudits.filter(w => w.isVertical).length,
      diagonalWires: wireAudits.filter(w => !w.isHorizontal && !w.isVertical && w.pathPoints.length === 2).length,
      unconnectedDevices,
      devicesOutsideSheet,
      labelsOutsideSheet,
    },
  };
}

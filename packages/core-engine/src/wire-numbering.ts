/**
 * Wire Numbering System
 *
 * Auto-assigns wire numbers based on rung numbers in ladder diagrams.
 * Falls back to sequential numbering for non-ladder wires.
 *
 * Industry standard: wire numbers match the rung they belong to.
 * Page-based: page 1 rung 1 → 101 → wires 1011, 1012, 1013.
 * Power nets keep their net name (L1, N, +24V, 0V).
 */

import type { LadderConfig } from '@fusion-cad/core-model';

export interface WireNumberingConnection {
  fromDevice: string;
  fromDeviceId?: string;
  fromPin: string;
  toDevice: string;
  toDeviceId?: string;
  toPin: string;
  netId: string;
  sheetId?: string;
  wireNumber?: string;
}

export interface WireNumberingNet {
  id: string;
  name?: string;
  netType: string;
}

export interface WireNumberingRung {
  number: number;
  /** Display number (computed from numbering scheme). If omitted, uses number. */
  displayNumber?: number;
  sheetId: string;
  deviceIds: string[];
}

/**
 * Compute the display rung number based on the ladder numbering scheme.
 * This ensures consistent numbering between the renderer and wire numbering.
 */
export function computeRungDisplayNumber(
  rungIndex: number,
  storedNumber: number,
  pageNumber: number,
  config?: Pick<LadderConfig, 'numberingScheme' | 'firstRungNumber'>,
): number {
  if (config?.firstRungNumber != null) {
    return config.firstRungNumber + rungIndex;
  }
  switch (config?.numberingScheme) {
    case 'page-based':
      return pageNumber * 100 + rungIndex + 1;
    case 'page-tens':
      return pageNumber * 100 + (rungIndex + 1) * 10;
    default:
      return storedNumber;
  }
}

export interface WireNumberAssignment {
  /** Connection index in the original array */
  index: number;
  /** Assigned wire number */
  wireNumber: string;
  /** Whether this was manually assigned (preserved) or auto-generated */
  isManual: boolean;
}

/**
 * Auto-assign wire numbers to connections.
 *
 * Rules:
 * 1. Manual overrides (existing wireNumber) are always preserved
 * 2. Power nets use net name (L1, N, +24V, 0V)
 * 3. Rung-based: wire number = rungDisplayNumber * 10 + nodeIndex (1-based, L-to-R)
 *    e.g., rung 101 → wires 1011, 1012, 1013
 *    Node index sorted by actual X position of leftmost endpoint device
 * 4. Fallback: sequential W001, W002 for wires not on any rung
 *
 * @param devicePositions Optional map of deviceId → {x, y} for accurate L-to-R sorting
 */
export function autoAssignWireNumbers(
  connections: WireNumberingConnection[],
  nets: WireNumberingNet[],
  rungs?: WireNumberingRung[],
  defaultSheetId?: string,
  devicePositions?: Map<string, { x: number; y: number }>,
): WireNumberAssignment[] {
  const netMap = new Map<string, WireNumberingNet>();
  for (const net of nets) {
    netMap.set(net.id, net);
  }

  // Build device-to-rung lookup (deviceId → rung display number)
  const deviceIdToRungNum = new Map<string, number>();
  if (rungs) {
    for (const rung of rungs) {
      const rungNum = rung.displayNumber ?? rung.number;
      for (const deviceId of rung.deviceIds) {
        deviceIdToRungNum.set(deviceId, rungNum);
      }
    }
  }

  // First pass: classify each connection and group rung-based ones
  interface PendingConn { index: number; rungNum: number; sortX: number }
  const rungGroups = new Map<number, PendingConn[]>();
  const assignments: WireNumberAssignment[] = [];

  // Group connections by sheet for fallback sequential numbering
  const sheetCounters = new Map<string, number>();

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];

    // 1. Preserve manual overrides
    if (conn.wireNumber) {
      assignments.push({ index: i, wireNumber: conn.wireNumber, isManual: true });
      continue;
    }

    // 2. Power nets use net name
    const net = netMap.get(conn.netId);
    if (net && net.netType === 'power' && net.name) {
      assignments.push({ index: i, wireNumber: net.name, isManual: false });
      continue;
    }

    // 3. Rung-based numbering — find which rung this connection belongs to
    const fromRung = conn.fromDeviceId ? deviceIdToRungNum.get(conn.fromDeviceId) : undefined;
    const toRung = conn.toDeviceId ? deviceIdToRungNum.get(conn.toDeviceId) : undefined;
    const rungNum = fromRung ?? toRung;

    if (rungNum != null) {
      // Sort key: leftmost X position of the two endpoint devices
      const fromX = conn.fromDeviceId ? (devicePositions?.get(conn.fromDeviceId)?.x ?? 0) : 0;
      const toX = conn.toDeviceId ? (devicePositions?.get(conn.toDeviceId)?.x ?? 0) : 0;
      const sortX = Math.min(fromX, toX);

      if (!rungGroups.has(rungNum)) {
        rungGroups.set(rungNum, []);
      }
      rungGroups.get(rungNum)!.push({ index: i, rungNum, sortX });
      continue;
    }

    // 4. Fallback: sequential per sheet
    const sheetId = conn.sheetId || defaultSheetId || 'default';
    const counter = sheetCounters.get(sheetId) ?? 1;
    const wireNumber = `W${String(counter).padStart(3, '0')}`;
    sheetCounters.set(sheetId, counter + 1);
    assignments.push({ index: i, wireNumber, isManual: false });
  }

  // Second pass: assign rung-based wire numbers sorted L-to-R by X position
  for (const [rungNum, group] of rungGroups) {
    group.sort((a, b) => a.sortX - b.sortX);
    for (let nodeIdx = 0; nodeIdx < group.length; nodeIdx++) {
      const { index } = group[nodeIdx];
      // Wire number = rungDisplayNumber * 10 + 1-based node index
      const wireNumber = String(rungNum * 10 + nodeIdx + 1);
      assignments.push({ index, wireNumber, isManual: false });
    }
  }

  // Sort by original index to maintain stable output order
  assignments.sort((a, b) => a.index - b.index);

  return assignments;
}

/**
 * Wire Numbering System
 *
 * Auto-assigns wire numbers based on rung numbers in ladder diagrams.
 * Falls back to sequential numbering for non-ladder wires.
 *
 * Industry standard: wire numbers match the rung they belong to.
 * Rung 100 → wires 100, 101, 102; Rung 110 → wires 110, 111, 112.
 * Power nets keep their net name (L1, N, +24V, 0V).
 */

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
  sheetId: string;
  deviceIds: string[];
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
 * 3. Rung-based: wires on a rung get rungNumber, rungNumber+1, etc.
 * 4. Fallback: sequential W001, W002 for wires not on any rung
 */
export function autoAssignWireNumbers(
  connections: WireNumberingConnection[],
  nets: WireNumberingNet[],
  rungs?: WireNumberingRung[],
  defaultSheetId?: string,
): WireNumberAssignment[] {
  const netMap = new Map<string, WireNumberingNet>();
  for (const net of nets) {
    netMap.set(net.id, net);
  }

  // Build device-to-rung lookup (deviceId → rung number)
  const deviceIdToRung = new Map<string, number>();
  const deviceTagToRung = new Map<string, number>();
  if (rungs) {
    for (const rung of rungs) {
      for (const deviceId of rung.deviceIds) {
        deviceIdToRung.set(deviceId, rung.number);
      }
    }
  }

  // Track per-rung wire counter for incrementing within a rung
  const rungCounters = new Map<number, number>();

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

    // 3. Rung-based numbering
    const fromRung = conn.fromDeviceId
      ? deviceIdToRung.get(conn.fromDeviceId)
      : undefined;
    const toRung = conn.toDeviceId
      ? deviceIdToRung.get(conn.toDeviceId)
      : undefined;

    // Use the rung that either endpoint belongs to (prefer from, then to)
    const rungNumber = fromRung ?? toRung;

    if (rungNumber != null) {
      const offset = rungCounters.get(rungNumber) ?? 0;
      const wireNumber = String(rungNumber + offset);
      rungCounters.set(rungNumber, offset + 1);
      assignments.push({ index: i, wireNumber, isManual: false });
      continue;
    }

    // 4. Fallback: sequential per sheet
    const sheetId = conn.sheetId || defaultSheetId || 'default';
    const counter = sheetCounters.get(sheetId) ?? 1;
    const wireNumber = `W${String(counter).padStart(3, '0')}`;
    sheetCounters.set(sheetId, counter + 1);
    assignments.push({ index: i, wireNumber, isManual: false });
  }

  return assignments;
}

/**
 * Wire Numbering System
 *
 * Auto-assigns sequential wire numbers per sheet.
 * Respects manual overrides and uses net names for power nets.
 */

export interface WireNumberingConnection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
  sheetId?: string;
  wireNumber?: string;
}

export interface WireNumberingNet {
  id: string;
  name: string;
  netType: string;
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
 * - Sequential per sheet: W001, W002, ...
 * - Power nets use net name instead (e.g., +24V, 0V, L1, N)
 * - Manual overrides (existing wireNumber) are preserved
 * - Connections without a sheetId use the provided defaultSheetId
 */
export function autoAssignWireNumbers(
  connections: WireNumberingConnection[],
  nets: WireNumberingNet[],
  defaultSheetId?: string
): WireNumberAssignment[] {
  const netMap = new Map<string, WireNumberingNet>();
  for (const net of nets) {
    netMap.set(net.id, net);
  }

  // Group connections by sheet
  const sheetConnections = new Map<string, { index: number; conn: WireNumberingConnection }[]>();

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    const sheetId = conn.sheetId || defaultSheetId || 'default';
    const group = sheetConnections.get(sheetId) || [];
    group.push({ index: i, conn });
    sheetConnections.set(sheetId, group);
  }

  const assignments: WireNumberAssignment[] = [];

  for (const [, group] of sheetConnections) {
    let counter = 1;

    for (const { index, conn } of group) {
      // If manually assigned, preserve it
      if (conn.wireNumber) {
        assignments.push({
          index,
          wireNumber: conn.wireNumber,
          isManual: true,
        });
        continue;
      }

      // Check if this is a power net
      const net = netMap.get(conn.netId);
      if (net && net.netType === 'power') {
        assignments.push({
          index,
          wireNumber: net.name,
          isManual: false,
        });
        continue;
      }

      // Auto-assign sequential number
      const wireNumber = `W${String(counter).padStart(3, '0')}`;
      counter++;
      assignments.push({
        index,
        wireNumber,
        isManual: false,
      });
    }
  }

  return assignments;
}

/**
 * Wire List Generator
 *
 * Generates a connection list showing all wiring between devices
 */

import type { Net } from '@fusion-cad/core-model';

export interface WireListRow {
  wireNumber: string;
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netName: string;
  netType: string;
}

export interface WireListReport {
  rows: WireListRow[];
  totalWires: number;
  generatedAt: number;
}

/**
 * Connection data (simplified for Phase 1)
 */
export interface Connection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
}

/**
 * Generate wire list from connections and nets
 */
export function generateWireList(
  connections: Connection[],
  nets: Net[]
): WireListReport {
  // Create a map of netId -> net
  const netMap = new Map<string, Net>();
  for (const net of nets) {
    netMap.set(net.id, net);
  }

  // Build wire list rows
  const rows: WireListRow[] = [];
  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    const net = netMap.get(conn.netId);

    rows.push({
      wireNumber: `W${String(i + 1).padStart(3, '0')}`, // W001, W002, etc.
      fromDevice: conn.fromDevice,
      fromPin: conn.fromPin,
      toDevice: conn.toDevice,
      toPin: conn.toPin,
      netName: net?.name || 'UNNAMED',
      netType: net?.netType || 'signal',
    });
  }

  // Sort by wire number
  rows.sort((a, b) => a.wireNumber.localeCompare(b.wireNumber));

  return {
    rows,
    totalWires: rows.length,
    generatedAt: Date.now(),
  };
}

/**
 * Convert wire list to CSV format
 */
export function wireListToCSV(wireList: WireListReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Wire Number,From Device,From Pin,To Device,To Pin,Net Name,Net Type');

  // Rows
  for (const row of wireList.rows) {
    lines.push(
      `"${row.wireNumber}","${row.fromDevice}","${row.fromPin}","${row.toDevice}","${row.toPin}","${row.netName}","${row.netType}"`
    );
  }

  // Footer
  lines.push('');
  lines.push(`Total Wires,${wireList.totalWires}`);
  lines.push(`Generated,${new Date(wireList.generatedAt).toISOString()}`);

  return lines.join('\n');
}

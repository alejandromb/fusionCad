/**
 * Cable Schedule Report Generator
 *
 * Groups wires into cables based on shared device connections
 * and generates a cable schedule for procurement and installation.
 */

import type { Net } from '@fusion-cad/core-model';

export interface CableConnection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
  wireNumber?: string;
}

export interface CableScheduleRow {
  cableTag: string;
  fromDevice: string;
  toDevice: string;
  conductorCount: number;
  wireNumbers: string[];
  cableType: string;
}

export interface CableScheduleReport {
  rows: CableScheduleRow[];
  totalCables: number;
  totalConductors: number;
  generatedAt: number;
}

/**
 * Generate cable schedule by grouping wires between the same device pairs.
 *
 * Wires connecting the same pair of devices are grouped into a single cable.
 */
export function generateCableSchedule(
  connections: CableConnection[],
  nets: Net[]
): CableScheduleReport {
  const netMap = new Map<string, Net>();
  for (const net of nets) {
    netMap.set(net.id, net);
  }

  // Group connections by device pair (order-independent)
  const cableGroups = new Map<string, CableConnection[]>();

  for (const conn of connections) {
    const [devA, devB] = [conn.fromDevice, conn.toDevice].sort();
    const key = `${devA}--${devB}`;
    const group = cableGroups.get(key) || [];
    group.push(conn);
    cableGroups.set(key, group);
  }

  const rows: CableScheduleRow[] = [];
  let cableIndex = 1;

  // Sort by cable key for deterministic output
  const sortedKeys = Array.from(cableGroups.keys()).sort();

  for (const key of sortedKeys) {
    const group = cableGroups.get(key)!;
    const [devA, devB] = key.split('--');

    const wireNumbers = group.map((c, i) =>
      c.wireNumber || `W${String(i + 1).padStart(3, '0')}`
    );

    // Determine cable type based on net types
    const netTypes = new Set(
      group.map(c => netMap.get(c.netId)?.netType || 'signal')
    );
    let cableType = 'Control';
    if (netTypes.has('power')) cableType = 'Power';

    rows.push({
      cableTag: `C${String(cableIndex).padStart(3, '0')}`,
      fromDevice: devA,
      toDevice: devB,
      conductorCount: group.length,
      wireNumbers,
      cableType,
    });

    cableIndex++;
  }

  return {
    rows,
    totalCables: rows.length,
    totalConductors: connections.length,
    generatedAt: Date.now(),
  };
}

/**
 * Convert cable schedule to CSV format
 */
export function cableScheduleToCSV(report: CableScheduleReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Cable Tag,From Device,To Device,Conductors,Wire Numbers,Cable Type');

  // Rows
  for (const row of report.rows) {
    lines.push(
      `"${row.cableTag}","${row.fromDevice}","${row.toDevice}","${row.conductorCount}","${row.wireNumbers.join('; ')}","${row.cableType}"`
    );
  }

  // Footer
  lines.push('');
  lines.push(`Total Cables,${report.totalCables}`);
  lines.push(`Total Conductors,${report.totalConductors}`);
  lines.push(`Generated,${new Date(report.generatedAt).toISOString()}`);

  return lines.join('\n');
}

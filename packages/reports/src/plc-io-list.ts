/**
 * PLC I/O List Report Generator
 *
 * Generates a complete PLC I/O mapping showing rack, slot, channel,
 * address, signal names, and terminal references.
 */

import type { PLCRack, PLCModule, PLCChannel } from '@fusion-cad/core-model';

export interface PLCIOListRow {
  rack: number;
  slot: number;
  channel: number;
  address: string;
  moduleType: string;
  signalName: string;
  description: string;
  terminalRef: string;
  wireNumber: string;
}

export interface PLCIOListReport {
  rows: PLCIOListRow[];
  totalChannels: number;
  totalModules: number;
  generatedAt: number;
}

/**
 * Generate PLC I/O list from racks, modules, and channels.
 */
export function generatePLCIOList(
  racks: PLCRack[],
  modules: PLCModule[],
  channels: PLCChannel[]
): PLCIOListReport {
  const rackMap = new Map<string, PLCRack>();
  for (const rack of racks) {
    rackMap.set(rack.id, rack);
  }

  const moduleMap = new Map<string, PLCModule>();
  for (const mod of modules) {
    moduleMap.set(mod.id, mod);
  }

  const rows: PLCIOListRow[] = [];

  // Sort channels by rack -> slot -> channel
  const sorted = [...channels].sort((a, b) => {
    const modA = moduleMap.get(a.moduleId);
    const modB = moduleMap.get(b.moduleId);
    const rackA = modA ? rackMap.get(modA.rackId) : null;
    const rackB = modB ? rackMap.get(modB.rackId) : null;

    const rackNumA = rackA?.rackNumber ?? 0;
    const rackNumB = rackB?.rackNumber ?? 0;
    if (rackNumA !== rackNumB) return rackNumA - rackNumB;

    const slotA = modA?.slotNumber ?? 0;
    const slotB = modB?.slotNumber ?? 0;
    if (slotA !== slotB) return slotA - slotB;

    return a.channelNumber - b.channelNumber;
  });

  for (const channel of sorted) {
    const mod = moduleMap.get(channel.moduleId);
    const rack = mod ? rackMap.get(mod.rackId) : null;

    rows.push({
      rack: rack?.rackNumber ?? 0,
      slot: mod?.slotNumber ?? 0,
      channel: channel.channelNumber,
      address: channel.address,
      moduleType: mod?.moduleType ?? '',
      signalName: channel.signalName || '',
      description: channel.description || '',
      terminalRef: channel.terminalRef || '',
      wireNumber: '',
    });
  }

  return {
    rows,
    totalChannels: rows.length,
    totalModules: modules.length,
    generatedAt: Date.now(),
  };
}

/**
 * Convert PLC I/O list to CSV format
 */
export function plcIOListToCSV(report: PLCIOListReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Rack,Slot,Channel,Address,Module Type,Signal Name,Description,Terminal Ref,Wire Number');

  // Rows
  for (const row of report.rows) {
    lines.push(
      `"${row.rack}","${row.slot}","${row.channel}","${row.address}","${row.moduleType}","${row.signalName}","${row.description}","${row.terminalRef}","${row.wireNumber}"`
    );
  }

  // Footer
  lines.push('');
  lines.push(`Total Channels,${report.totalChannels}`);
  lines.push(`Total Modules,${report.totalModules}`);
  lines.push(`Generated,${new Date(report.generatedAt).toISOString()}`);

  return lines.join('\n');
}

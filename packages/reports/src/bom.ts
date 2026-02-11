/**
 * BOM (Bill of Materials) Generator
 *
 * Groups devices by part and generates a BOM report.
 *
 * Terminal block handling:
 * - Devices with `terminalId` are visual representations of terminal levels
 * - BOM counts Terminals (physical parts), not individual Device entities
 * - A dual-level terminal = 2 Device entities but 1 BOM line item
 */

import type { Part, Device, Terminal } from '@fusion-cad/core-model';

export interface BomRow {
  partNumber: string;
  manufacturer: string;
  description: string;
  category: string;
  quantity: number;
  deviceTags: string[];
}

export interface BomReport {
  rows: BomRow[];
  totalItems: number;
  generatedAt: number;
}

/**
 * Generate BOM from parts, devices, and terminals
 *
 * @param parts - All parts in the project
 * @param devices - All devices (symbols on schematic)
 * @param terminals - Optional: Terminal entities for proper terminal block counting
 */
export function generateBom(parts: Part[], devices: Device[], terminals: Terminal[] = []): BomReport {
  // Create a map of partId -> part
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Group devices by partId (excluding terminal levels)
  const devicesByPart = new Map<string, Device[]>();
  for (const device of devices) {
    // Skip devices that are terminal levels - they're counted via Terminal entity
    if (device.terminalId) {
      continue;
    }

    if (!device.partId) continue; // Skip devices without assigned parts

    // Skip junction devices (internal wire junctions)
    const part = partMap.get(device.partId);
    if (part && part.category === 'Junction') continue;

    if (!devicesByPart.has(device.partId)) {
      devicesByPart.set(device.partId, []);
    }
    devicesByPart.get(device.partId)!.push(device);
  }

  // Build BOM rows from regular devices
  const rows: BomRow[] = [];
  for (const [partId, devicesForPart] of devicesByPart.entries()) {
    const part = partMap.get(partId);
    if (!part) continue; // Shouldn't happen, but be defensive

    rows.push({
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
      description: part.description,
      category: part.category,
      quantity: devicesForPart.length,
      deviceTags: devicesForPart.map((d) => d.tag).sort(),
    });
  }

  // Add Terminal entities as BOM items (grouped by partId)
  const terminalsByPart = new Map<string, Terminal[]>();
  for (const terminal of terminals) {
    if (!terminal.partId) continue;

    if (!terminalsByPart.has(terminal.partId)) {
      terminalsByPart.set(terminal.partId, []);
    }
    terminalsByPart.get(terminal.partId)!.push(terminal);
  }

  for (const [partId, terminalsForPart] of terminalsByPart.entries()) {
    const part = partMap.get(partId);
    if (!part) continue;

    // Generate tags like "X1:1", "X1:2", etc.
    const terminalTags = terminalsForPart
      .map((t) => `${t.stripTag}:${t.index}`)
      .sort();

    rows.push({
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
      description: part.description,
      category: part.category,
      quantity: terminalsForPart.length,
      deviceTags: terminalTags,
    });
  }

  // Sort by manufacturer, then part number
  rows.sort((a, b) => {
    const mfgCompare = a.manufacturer.localeCompare(b.manufacturer);
    if (mfgCompare !== 0) return mfgCompare;
    return a.partNumber.localeCompare(b.partNumber);
  });

  return {
    rows,
    totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
    generatedAt: Date.now(),
  };
}

/**
 * Convert BOM report to CSV format
 */
export function bomToCSV(bom: BomReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Part Number,Manufacturer,Description,Category,Quantity,Device Tags');

  // Rows
  for (const row of bom.rows) {
    const deviceTagsStr = row.deviceTags.join('; ');
    lines.push(
      `"${row.partNumber}","${row.manufacturer}","${row.description}","${row.category}",${row.quantity},"${deviceTagsStr}"`
    );
  }

  // Footer
  lines.push('');
  lines.push(`Total Items,${bom.totalItems}`);
  lines.push(`Generated,${new Date(bom.generatedAt).toISOString()}`);

  return lines.join('\n');
}

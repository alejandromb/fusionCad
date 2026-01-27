/**
 * BOM (Bill of Materials) Generator
 *
 * Groups devices by part and generates a BOM report
 */

import type { Part, Device } from '@fusion-cad/core-model';

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
 * Generate BOM from parts and devices
 */
export function generateBom(parts: Part[], devices: Device[]): BomReport {
  // Create a map of partId -> part
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Group devices by partId
  const devicesByPart = new Map<string, Device[]>();
  for (const device of devices) {
    if (!device.partId) continue; // Skip devices without assigned parts

    if (!devicesByPart.has(device.partId)) {
      devicesByPart.set(device.partId, []);
    }
    devicesByPart.get(device.partId)!.push(device);
  }

  // Build BOM rows
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

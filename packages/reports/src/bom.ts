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

export interface BomWarning {
  deviceTag: string;
  deviceFunction: string;
  reason: 'unassigned' | 'placeholder';
}

export interface BomReport {
  rows: BomRow[];
  warnings: BomWarning[];
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

  const warnings: BomWarning[] = [];

  // Collect warnings for devices without real parts assigned
  // Track seen tags to avoid duplicate warnings for linked devices
  const warnedTags = new Set<string>();
  for (const device of devices) {
    if (device.terminalId) continue;
    if (warnedTags.has(device.tag)) continue;
    // Skip junction and no-connect devices
    if (/^J[LR]\d+$/.test(device.tag)) continue;
    if (/^NC\d+$/.test(device.tag)) continue;
    if (device.partId) {
      const part = partMap.get(device.partId);
      if (part && part.category.toLowerCase() === 'junction') continue;
      if (part && isNoConnectCategory(part.category)) continue;
    }

    if (!device.partId) {
      warnings.push({ deviceTag: device.tag, deviceFunction: device.function, reason: 'unassigned' });
      warnedTags.add(device.tag);
    } else {
      const part = partMap.get(device.partId);
      if (part && isPlaceholderPart(part)) {
        warnings.push({ deviceTag: device.tag, deviceFunction: device.function, reason: 'placeholder' });
        warnedTags.add(device.tag);
      }
    }
  }

  // Separate devices into linked groups (by deviceGroupId) and standalone
  // Linked devices share a deviceGroupId → count as 1 physical item in BOM
  const linkedGroups = new Map<string, Device[]>();
  const standaloneDevices: Device[] = [];

  for (const device of devices) {
    // Skip terminal levels - counted via Terminal entity
    if (device.terminalId) continue;
    if (!device.partId) continue;

    // Skip junction and no-connect devices (internal wiring nodes / ERC markers, not physical parts)
    const part = partMap.get(device.partId);
    if (part && part.category.toLowerCase() === 'junction') continue;
    if (part && isNoConnectCategory(part.category)) continue;

    // Skip placeholder parts — they go in warnings only
    if (part && isPlaceholderPart(part)) continue;

    if (device.deviceGroupId) {
      const group = linkedGroups.get(device.deviceGroupId) || [];
      group.push(device);
      linkedGroups.set(device.deviceGroupId, group);
    } else {
      standaloneDevices.push(device);
    }
  }

  // Group standalone devices by partNumber + manufacturer (aggregate same parts)
  const devicesByPartKey = new Map<string, { part: Part; devices: Device[] }>();
  for (const device of standaloneDevices) {
    const part = partMap.get(device.partId!);
    if (!part) continue;
    const key = `${part.manufacturer}::${part.partNumber}`;
    if (!devicesByPartKey.has(key)) {
      devicesByPartKey.set(key, { part, devices: [] });
    }
    devicesByPartKey.get(key)!.devices.push(device);
  }

  // Build BOM rows from standalone devices (grouped by part number)
  const rows: BomRow[] = [];
  for (const [, { part, devices: devicesForPart }] of devicesByPartKey.entries()) {
    // Deduplicate tags (same tag on multiple sheets = 1 physical device)
    const uniqueTags = [...new Set(devicesForPart.map(d => d.tag))].sort();
    rows.push({
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
      description: part.description,
      category: part.category,
      quantity: uniqueTags.length,
      deviceTags: uniqueTags,
    });
  }

  // Build BOM rows from linked device groups (each group = 1 physical item)
  // Aggregate groups that share the same part number
  const linkedByPartKey = new Map<string, { part: Part; tags: Set<string> }>();
  for (const [, groupDevices] of linkedGroups.entries()) {
    const primaryDevice = groupDevices[0];
    const part = partMap.get(primaryDevice.partId!);
    if (!part) continue;
    const key = `${part.manufacturer}::${part.partNumber}`;
    if (!linkedByPartKey.has(key)) {
      linkedByPartKey.set(key, { part, tags: new Set() });
    }
    // Use the shared tag (all devices in a group share the same tag typically)
    linkedByPartKey.get(key)!.tags.add(primaryDevice.tag);
  }

  for (const [, { part, tags }] of linkedByPartKey.entries()) {
    rows.push({
      partNumber: part.partNumber,
      manufacturer: part.manufacturer,
      description: part.description,
      category: part.category,
      quantity: tags.size,
      deviceTags: [...tags].sort(),
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
    warnings,
    totalItems: rows.reduce((sum, row) => sum + row.quantity, 0),
    generatedAt: Date.now(),
  };
}

/**
 * Check if a part is a placeholder (auto-created by placeDevice, not a real catalog part).
 */
function isNoConnectCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return lower === 'no-connect' || lower === 'noconnect' || lower === 'no_connect';
}

function isPlaceholderPart(part: Part): boolean {
  return part.partNumber === 'TBD' || part.manufacturer === 'Unassigned';
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

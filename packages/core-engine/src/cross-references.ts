/**
 * Cross-Reference System
 *
 * Auto-generates cross-references when the same device tag appears
 * on multiple sheets (e.g., contactor K1 coil on sheet 1, contacts on sheet 2).
 */

export interface CrossRefDevice {
  tag: string;
  sheetId: string;
  category?: string;
}

export interface CrossRefSheet {
  id: string;
  name: string;
  number: number;
}

export interface CrossRefEntry {
  deviceTag: string;
  sourceSheetId: string;
  targetSheetId: string;
  targetSheetNumber: number;
  referenceType: 'coil-contact' | 'device-appearance' | 'terminal-terminal';
}

/**
 * Auto-generate cross-references from device placements.
 *
 * When the same device tag appears on multiple sheets, generates
 * cross-reference entries linking them.
 *
 * Special handling:
 * - Relay coils + relay contacts with same prefix -> coil-contact references
 * - Terminal strips on multiple sheets -> terminal-terminal references
 * - All other duplicates -> device-appearance references
 */
export function generateCrossReferences(
  devices: CrossRefDevice[],
  sheets: CrossRefSheet[]
): CrossRefEntry[] {
  const sheetMap = new Map<string, CrossRefSheet>();
  for (const sheet of sheets) {
    sheetMap.set(sheet.id, sheet);
  }

  // Group devices by tag
  const devicesByTag = new Map<string, CrossRefDevice[]>();
  for (const device of devices) {
    const group = devicesByTag.get(device.tag) || [];
    group.push(device);
    devicesByTag.set(device.tag, group);
  }

  const entries: CrossRefEntry[] = [];

  for (const [tag, group] of devicesByTag) {
    // Only generate cross-refs for tags appearing on multiple sheets
    const uniqueSheets = new Set(group.map(d => d.sheetId));
    if (uniqueSheets.size <= 1) continue;

    // Determine reference type
    const categories = new Set(group.map(d => d.category).filter(Boolean));
    let refType: CrossRefEntry['referenceType'] = 'device-appearance';

    if (categories.has('relay-coil') || categories.has('relay-contact-no') || categories.has('relay-contact-nc')) {
      refType = 'coil-contact';
    } else if (categories.has('terminal') || categories.has('single-terminal')) {
      refType = 'terminal-terminal';
    }

    // Generate cross-ref from each sheet to every other sheet
    const sheetList = Array.from(uniqueSheets);
    for (let i = 0; i < sheetList.length; i++) {
      for (let j = 0; j < sheetList.length; j++) {
        if (i === j) continue;

        const targetSheet = sheetMap.get(sheetList[j]);
        entries.push({
          deviceTag: tag,
          sourceSheetId: sheetList[i],
          targetSheetId: sheetList[j],
          targetSheetNumber: targetSheet?.number ?? 0,
          referenceType: refType,
        });
      }
    }
  }

  return entries;
}

/**
 * Format cross-reference annotation text for display next to a device.
 * E.g., "/10, /12" means this device also appears on sheets 10 and 12.
 */
export function formatCrossRefText(
  deviceTag: string,
  currentSheetId: string,
  entries: CrossRefEntry[]
): string {
  const refs = entries
    .filter(e => e.deviceTag === deviceTag && e.sourceSheetId === currentSheetId)
    .map(e => `/${e.targetSheetNumber}`)
    .sort();

  return refs.join(', ');
}

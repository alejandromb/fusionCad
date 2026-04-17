import type { Part } from '../types.js';

/**
 * Hoffman A-Series Type 1 painted steel enclosures + matching subpanels.
 *
 * Scope: the sizes the motor-starter panel generator emits
 * (`generateMotorStarterPanel` in packages/mcp-server/src/circuit-templates.ts).
 * HP thresholds:
 *   hp ≤ 10  → 20"H × 16"W × 8"D   (A201608 + A20P16)
 *   hp ≤ 30  → 24"H × 20"W × 8"D   (A242008 + A24P20)
 *   hp >  30 → 30"H × 24"W × 8"D   (A302408 + A30P24)
 *
 * Naming convention (Hoffman A-series):
 *   A<HH><WW><DD>  → height × width × depth in inches (enclosure body)
 *   A<HH>P<WW>     → painted subpanel matching the enclosure interior
 * Suffixes (LP / SS / etc.) dropped — these catalog entries represent the
 * generic painted-steel Type 1 variant. Users can upgrade to SS / NEMA 4 /
 * etc. by editing the BOM row.
 *
 * `symbolCategory` matches the layout-symbol IDs the generator places, so
 * assignPart() preserves the render category while replacing the placeholder
 * part with a real Hoffman row in the BOM.
 *
 * Reference: Hoffman A-Series Type 1 catalog (nVent Hoffman).
 */

type EnclosureSize = '20x16' | '24x20' | '30x24';

export interface HoffmanEnclosureMatch {
  enclosure: { manufacturer: string; partNumber: string; description: string; symbolCategory: string };
  subpanel: { manufacturer: string; partNumber: string; description: string; symbolCategory: string };
}

export const hoffmanParts: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>[] = [
  // ---- Enclosures ----
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A201608LP',
    description: 'A-Series Type 1 Enclosure, 20" × 16" × 8", painted steel',
    category: 'enclosure',
    certifications: ['UL', 'CSA', 'NEMA 1'],
    symbolCategory: 'panel-enclosure-20x16',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { series: 'A', type: 'NEMA 1', heightIn: 20, widthIn: 16, depthIn: 8, material: 'painted steel' },
  },
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A242008LP',
    description: 'A-Series Type 1 Enclosure, 24" × 20" × 8", painted steel',
    category: 'enclosure',
    certifications: ['UL', 'CSA', 'NEMA 1'],
    symbolCategory: 'panel-enclosure-24x20',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { series: 'A', type: 'NEMA 1', heightIn: 24, widthIn: 20, depthIn: 8, material: 'painted steel' },
  },
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A302408LP',
    description: 'A-Series Type 1 Enclosure, 30" × 24" × 8", painted steel',
    category: 'enclosure',
    certifications: ['UL', 'CSA', 'NEMA 1'],
    symbolCategory: 'panel-enclosure-30x24',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { series: 'A', type: 'NEMA 1', heightIn: 30, widthIn: 24, depthIn: 8, material: 'painted steel' },
  },

  // ---- Subpanels (flat back panels for DIN-rail / component mounting) ----
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A20P16',
    description: 'A-Series Subpanel, fits 20" × 16" enclosure, painted steel',
    category: 'subpanel',
    certifications: ['UL'],
    symbolCategory: 'panel-subpanel-20x16',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { fitsEnclosure: 'A201608LP', heightIn: 17.9, widthIn: 13.9, material: 'painted steel' },
  },
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A24P20',
    description: 'A-Series Subpanel, fits 24" × 20" enclosure, painted steel',
    category: 'subpanel',
    certifications: ['UL'],
    symbolCategory: 'panel-subpanel-24x20',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { fitsEnclosure: 'A242008LP', heightIn: 21.9, widthIn: 17.9, material: 'painted steel' },
  },
  {
    type: 'part',
    manufacturer: 'Hoffman',
    partNumber: 'A30P24',
    description: 'A-Series Subpanel, fits 30" × 24" enclosure, painted steel',
    category: 'subpanel',
    certifications: ['UL'],
    symbolCategory: 'panel-subpanel-30x24',
    datasheetUrl: 'https://hoffman.nvent.com/en-us/products/a-series-type-1-enclosures',
    attributes: { fitsEnclosure: 'A302408LP', heightIn: 27.9, widthIn: 21.9, material: 'painted steel' },
  },
];

/**
 * Look up the Hoffman enclosure + subpanel pair for a given size.
 * The motor-starter generator already picks a size from HP; this helper
 * gives it the matching part numbers to assign via assignPart().
 */
export function getHoffmanEnclosurePair(size: EnclosureSize): HoffmanEnclosureMatch {
  const match = (pn: string) => {
    const p = hoffmanParts.find(x => x.partNumber === pn);
    if (!p) throw new Error(`Hoffman part ${pn} missing from catalog`);
    return {
      manufacturer: p.manufacturer,
      partNumber: p.partNumber,
      description: p.description ?? '',
      symbolCategory: p.symbolCategory ?? '',
    };
  };
  switch (size) {
    case '20x16': return { enclosure: match('A201608LP'), subpanel: match('A20P16') };
    case '24x20': return { enclosure: match('A242008LP'), subpanel: match('A24P20') };
    case '30x24': return { enclosure: match('A302408LP'), subpanel: match('A30P24') };
  }
}

import type { Part } from '../types.js';
import { phoenixContactParts } from './phoenix-contact.js';
import { allenBradleyParts } from './allen-bradley.js';
import { schneiderElectricParts } from './schneider-electric.js';
import { schneiderMotorCatalogParts } from './schneider-motor-catalog.js';

export { phoenixContactParts } from './phoenix-contact.js';
export { allenBradleyParts } from './allen-bradley.js';
export { schneiderElectricParts } from './schneider-electric.js';
export { schneiderMotorCatalogParts } from './schneider-motor-catalog.js';

/** All manufacturer parts combined */
export const ALL_MANUFACTURER_PARTS: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>[] = [
  ...phoenixContactParts,
  ...allenBradleyParts,
  ...schneiderElectricParts,
  ...schneiderMotorCatalogParts,
];

/** Get parts filtered by manufacturer */
export function getPartsByManufacturer(manufacturer: string): Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>[] {
  return ALL_MANUFACTURER_PARTS.filter(p => p.manufacturer === manufacturer);
}

/** Get parts filtered by category */
export function getPartsByCategory(category: string): Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>[] {
  return ALL_MANUFACTURER_PARTS.filter(p => p.category === category);
}

/** Get all unique manufacturers */
export function getManufacturers(): string[] {
  return [...new Set(ALL_MANUFACTURER_PARTS.map(p => p.manufacturer))];
}

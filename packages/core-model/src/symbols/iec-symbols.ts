/**
 * IEC 60617 Symbol Definitions
 *
 * Loads built-in symbols from JSON and registers them in the library.
 * This replaces the old hardcoded TypeScript symbol definitions.
 *
 * Custom symbols (paid tier) are stored in the database and loaded separately.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';
import { loadSymbolsFromJson } from './symbol-loader.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON import handled by bundler
import builtinSymbolsJson from './builtin-symbols.json';

// Re-export raw JSON for API seeding
export { builtinSymbolsJson };

// Re-export for convenience
export type { SymbolDefinition } from '../types.js';
export { registerSymbol, getSymbolDefinition, getSymbolById, getAllSymbols, getAllCategories } from '../symbol-library.js';

/**
 * Register all built-in IEC symbol definitions.
 * Call this once at application startup.
 */
export function registerBuiltinSymbols(): void {
  // Load symbols from JSON
  loadSymbolsFromJson(builtinSymbolsJson as any);

  // Register the generic component symbol (used when a part has no symbol assigned)
  registerSymbol(genericComponentSymbol);

  console.log(`Loaded ${builtinSymbolsJson.symbols.length + 1} built-in symbols`);
}

/**
 * Get all symbol categories (for UI display)
 */
export function getSymbolCategories(): string[] {
  const categories = new Set<string>();
  for (const symbol of builtinSymbolsJson.symbols) {
    categories.add(symbol.category);
  }
  return Array.from(categories).sort();
}

/**
 * Generic Component Symbol
 *
 * A placeholder symbol used when a part from the catalog has no specific
 * symbol assigned. Features a rectangular body with 4 pins (2 left, 2 right)
 * and a "?" in the center to indicate unassigned/unknown component type.
 */
const genericComponentSymbol: SymbolDefinition = {
  id: 'builtin-generic-component',
  type: 'symbol-definition',
  name: 'Generic Component',
  category: 'generic',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 0, y: 10 }, direction: 'left' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 0, y: 30 }, direction: 'left' },
    { id: '3', name: '3', pinType: 'passive', position: { x: 40, y: 10 }, direction: 'right' },
    { id: '4', name: '4', pinType: 'passive', position: { x: 40, y: 30 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Rectangular body
    { d: 'M 5,0 L 35,0 L 35,40 L 5,40 Z', stroke: true, strokeWidth: 2 },
    // Pin lead-in lines from left pins to body
    { d: 'M 0,10 L 5,10', stroke: true, strokeWidth: 1.5 },
    { d: 'M 0,30 L 5,30', stroke: true, strokeWidth: 1.5 },
    // Pin lead-in lines from right pins to body
    { d: 'M 35,10 L 40,10', stroke: true, strokeWidth: 1.5 },
    { d: 'M 35,30 L 40,30', stroke: true, strokeWidth: 1.5 },
  ],
  texts: [
    { content: '?', x: 20, y: 20, fontSize: 18, fontWeight: 'bold' },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

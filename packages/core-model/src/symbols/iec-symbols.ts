/**
 * IEC 60617 Symbol Definitions
 *
 * Loads built-in symbols from JSON and registers them in the library.
 * This replaces the old hardcoded TypeScript symbol definitions.
 *
 * Custom symbols (paid tier) are stored in the database and loaded separately.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol, registerCategoryAlias } from '../symbol-library.js';
import { loadSymbolsFromJson } from './symbol-loader.js';
import { generatePLCDigitalSymbol, generatePLCAnalogSymbol, generateLC50_24_Input, generateLC50_24_Output } from './symbol-generators.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON import handled by bundler
import builtinSymbolsJson from './builtin-symbols.json' with { type: 'json' };

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

  // Register category aliases that bridge part-catalog categories to symbol IDs.
  // Without these, parts render as 40x40 placeholder boxes because their category
  // (e.g., 'contactor') doesn't match any symbol ID or registered display category.
  const aliases: [string, string][] = [
    // Schneider motor catalog / electrical parts
    ['contactor', 'iec-contactor-3p'],
    ['circuit-breaker', 'iec-circuit-breaker-thermal-magnetic'],
    ['disconnect-switch', 'iec-disconnector-3p'],
    ['overload', 'iec-thermal-overload-relay-3p'],
    ['thermal-unit', 'iec-thermal-overload-relay'],
    // Terminals (Phoenix Contact etc.)
    ['dual-terminal', 'iec-terminal-dual'],
    ['single-terminal', 'iec-terminal-single'],
    ['ground-terminal', 'iec-terminal-ground'],
    ['fuse-terminal', 'iec-terminal-fuse'],
    // Control devices (Schneider pushbuttons etc.)
    ['iec-no-contact', 'iec-normally-open-contact'],
    ['iec-nc-contact', 'iec-normally-closed-contact'],
    ['iec-indicator-light', 'iec-pilot-light'],
    ['pushbutton', 'iec-normally-open-contact'],
    ['pilot-light', 'iec-pilot-light'],
    ['e-stop', 'iec-emergency-stop'],
    ['selector-switch', 'iec-selector-switch'],
    // PLC modules — generator handles all I/O channel counts (DI, DO, AI, AO)
    ['plc-cpu', 'iec-plc-cpu'],
    ['plc-ps', 'iec-power-supply-ac-dc'],
    // Power distribution
    ['transformer', 'iec-transformer-1ph'],
    ['surge-arrester', 'iec-surge-arrester'],
    ['receptacle', 'iec-receptacle'],
    ['circuit-breaker-2p', 'iec-circuit-breaker-2p'],
    // Starter kits / assemblies (use contactor as primary symbol)
    ['manual-starter', 'iec-manual-switch'],
    ['nema-starter', 'iec-contactor-3p'],
    ['starter-kit', 'iec-contactor-3p'],
    // Generic fallback
    ['accessory', 'builtin-generic-component'],
    ['unknown', 'builtin-generic-component'],
  ];
  for (const [alias, symbolId] of aliases) {
    registerCategoryAlias(alias, symbolId);
  }

  // Pre-generate common PLC I/O module symbols so they appear in the palette.
  // The parametric generator handles any channel count, but these are the standard ones.
  const plcDefaults = [
    generatePLCDigitalSymbol('DI', 8),
    generatePLCDigitalSymbol('DI', 16),
    generatePLCDigitalSymbol('DO', 8),
    generatePLCDigitalSymbol('DO', 16),
    generatePLCAnalogSymbol('AI', 4),
    generatePLCAnalogSymbol('AI', 8),
    generatePLCAnalogSymbol('AO', 4),
    generatePLCAnalogSymbol('AO', 8),
    // Allen-Bradley 2080-LC50-24QBB separate I/O terminal blocks
    generateLC50_24_Input(),
    generateLC50_24_Output(),
  ];
  for (const def of plcDefaults) {
    registerSymbol(def);
  }

  console.log(`Loaded ${builtinSymbolsJson.symbols.length + 1} built-in symbols + ${plcDefaults.length} PLC generators + ${aliases.length} category aliases`);
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

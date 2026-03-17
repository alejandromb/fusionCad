/**
 * @fusion-cad/core-model
 *
 * Core data model types and utilities
 */

export * from './types.js';
export * from './id.js';
export * from './symbol-library.js';
export { registerBuiltinSymbols, getSymbolCategories, builtinSymbolsJson } from './symbols/iec-symbols.js';
export { loadSymbolsFromJson, loadSingleSymbol, convertSymbol } from './symbols/symbol-loader.js';
export { SYMBOL_CATEGORY_GROUPS, HIDDEN_SYMBOL_CATEGORIES, getAllSymbolCategories, findCategoryDef } from './symbols/symbol-categories.js';
export type { SymbolCategoryDef, SymbolCategoryGroup } from './symbols/symbol-categories.js';
export { generatePLCDigitalSymbol, generatePLCAnalogSymbol, tryGeneratePLCSymbol, parsePLCCategory, generateSmartFallback, generateMicro800Symbol, tryGenerateMicro800Symbol } from './symbols/symbol-generators.js';
export type { PLCDigitalType, PLCAnalogType } from './symbols/symbol-generators.js';
export * from './parts/index.js';
export * from './motor-data/index.js';
export { migrateToBlocks } from './migrations/migrate-blocks.js';
export type { MigratableCircuit } from './migrations/migrate-blocks.js';

/**
 * @fusion-cad/core-model
 *
 * Core data model types and utilities
 */

export * from './types.js';
export * from './id.js';
export * from './symbol-library.js';
export { registerBuiltinSymbols, getSymbolCategories } from './symbols/iec-symbols.js';
export { loadSymbolsFromJson, loadSingleSymbol } from './symbols/symbol-loader.js';
export { SYMBOL_CATEGORY_GROUPS, HIDDEN_SYMBOL_CATEGORIES, getAllSymbolCategories, findCategoryDef } from './symbols/symbol-categories.js';
export type { SymbolCategoryDef, SymbolCategoryGroup } from './symbols/symbol-categories.js';
export * from './parts/index.js';

/**
 * Symbol Library Registry
 *
 * In-memory registry of symbol definitions keyed by category.
 * Built-in IEC symbols are registered at startup.
 * User-defined symbols can be registered at runtime.
 */

import type { SymbolDefinition } from './types.js';

const symbolRegistry: Map<string, SymbolDefinition> = new Map();

/**
 * Register a symbol definition in the library.
 * If a symbol with the same category already exists, it is replaced.
 */
export function registerSymbol(def: SymbolDefinition): void {
  symbolRegistry.set(def.category, def);
}

/**
 * Get a symbol definition by category.
 */
export function getSymbolDefinition(
  category: string
): SymbolDefinition | undefined {
  return symbolRegistry.get(category);
}

/**
 * Get all registered symbol categories.
 */
export function getAllCategories(): string[] {
  return Array.from(symbolRegistry.keys());
}

/**
 * Clear all registered symbols (useful for testing).
 */
export function clearSymbolRegistry(): void {
  symbolRegistry.clear();
}

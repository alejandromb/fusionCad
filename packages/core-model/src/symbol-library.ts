/**
 * Symbol Library Registry
 *
 * In-memory registry of symbol definitions.
 * Symbols are keyed by ID, with a secondary category index.
 * Multiple symbols can share a category (e.g., DI-16, DI-32 both in "plc-module").
 */

import type { SymbolDefinition, SymbolPath, SymbolText, SymbolVariant } from './types.js';

// Primary registry: ID -> SymbolDefinition
const symbolById: Map<string, SymbolDefinition> = new Map();

// Secondary index: category -> SymbolDefinition (first registered wins for backward compat)
const symbolByCategory: Map<string, SymbolDefinition> = new Map();

// Category -> all symbols in that category
const symbolsByCategory: Map<string, SymbolDefinition[]> = new Map();

/**
 * Register a symbol definition in the library.
 * Keyed by both ID and category.
 */
export function registerSymbol(def: SymbolDefinition): void {
  symbolById.set(def.id, def);

  // Category index: first registered for a category becomes the default
  if (!symbolByCategory.has(def.category)) {
    symbolByCategory.set(def.category, def);
  }

  // Category group index
  const group = symbolsByCategory.get(def.category) || [];
  // Replace if same ID already registered in group
  const existingIdx = group.findIndex(s => s.id === def.id);
  if (existingIdx >= 0) {
    group[existingIdx] = def;
  } else {
    group.push(def);
  }
  symbolsByCategory.set(def.category, group);
}

/**
 * Get a symbol definition by category (backward compatible).
 * Returns the first symbol registered for this category.
 */
export function getSymbolDefinition(
  category: string
): SymbolDefinition | undefined {
  return symbolByCategory.get(category);
}

/**
 * Get a symbol definition by its unique ID.
 */
export function getSymbolById(id: string): SymbolDefinition | undefined {
  return symbolById.get(id);
}

/**
 * Get all symbols in a category.
 */
export function getSymbolsByCategory(category: string): SymbolDefinition[] {
  return symbolsByCategory.get(category) || [];
}

/**
 * Get all registered symbol categories.
 */
export function getAllCategories(): string[] {
  return Array.from(symbolByCategory.keys());
}

/**
 * Get all registered symbols.
 */
export function getAllSymbols(): SymbolDefinition[] {
  return Array.from(symbolById.values());
}

/**
 * Clear all registered symbols (useful for testing).
 */
export function clearSymbolRegistry(): void {
  symbolById.clear();
  symbolByCategory.clear();
  symbolsByCategory.clear();
}

/**
 * Get available variants for a symbol.
 * Returns empty array if no variants defined.
 */
export function getSymbolVariants(symbolId: string): SymbolVariant[] {
  const def = symbolById.get(symbolId);
  return def?.variants || [];
}

/**
 * Get the rendering paths for a symbol, optionally for a specific variant.
 * If variantId is not found or not provided, returns the default paths.
 *
 * @param symbolId The symbol definition ID
 * @param variantId Optional variant ID (e.g., 'iec-standard', 'ansi')
 * @returns Object with paths and texts for rendering
 */
export function getSymbolRenderingData(
  symbolId: string,
  variantId?: string
): { paths: SymbolPath[]; texts: SymbolText[] } {
  const def = symbolById.get(symbolId);

  if (!def) {
    return { paths: [], texts: [] };
  }

  // If a variant is requested, try to find it
  if (variantId && def.variants) {
    const variant = def.variants.find(v => v.variantId === variantId);
    if (variant) {
      return {
        paths: variant.paths,
        texts: variant.texts || def.texts || [],
      };
    }
  }

  // Return default paths/texts
  return {
    paths: def.paths || [],
    texts: def.texts || [],
  };
}

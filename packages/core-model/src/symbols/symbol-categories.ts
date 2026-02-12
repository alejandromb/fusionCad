/**
 * Symbol category definitions with grouping for palette UI
 */

export interface SymbolCategoryDef {
  id: string;
  label: string;
  prefix: string;
}

/**
 * Hidden categories that are registered but not shown in the symbol palette.
 * These are used programmatically (e.g., when dragging a part from catalog
 * that has no specific symbol assigned).
 */
export const HIDDEN_SYMBOL_CATEGORIES: SymbolCategoryDef[] = [
  { id: 'generic', label: 'Generic Component', prefix: 'U' },
  { id: 'Junction', label: 'Junction', prefix: 'J' },
];

export interface SymbolCategoryGroup {
  name: string;
  categories: SymbolCategoryDef[];
}

export const SYMBOL_CATEGORY_GROUPS: SymbolCategoryGroup[] = [
  {
    name: 'Power',
    categories: [
      { id: 'Power', label: 'Power', prefix: 'CB' },
    ],
  },
  {
    name: 'Control',
    categories: [
      { id: 'Control', label: 'Control', prefix: 'CR' },
    ],
  },
  {
    name: 'Motor',
    categories: [
      { id: 'Motor', label: 'Motor', prefix: 'M' },
    ],
  },
  {
    name: 'Field',
    categories: [
      { id: 'Field', label: 'Field', prefix: 'S' },
    ],
  },
  {
    name: 'Passive',
    categories: [
      { id: 'Passive', label: 'Passive', prefix: 'R' },
    ],
  },
  {
    name: 'Ground',
    categories: [
      { id: 'Ground', label: 'Ground', prefix: 'PE' },
    ],
  },
  {
    name: 'Meter',
    categories: [
      { id: 'Meter', label: 'Meter', prefix: 'M' },
    ],
  },
  {
    name: 'Terminal',
    categories: [
      { id: 'Terminal', label: 'Terminal', prefix: 'X' },
    ],
  },
  {
    name: 'PLC',
    categories: [
      { id: 'PLC', label: 'PLC', prefix: 'PLC' },
    ],
  },
];

/**
 * Flatten all categories into a single list
 */
export function getAllSymbolCategories(): SymbolCategoryDef[] {
  return SYMBOL_CATEGORY_GROUPS.flatMap(g => g.categories);
}

/**
 * Find a category definition by ID.
 * Searches both visible palette categories and hidden programmatic categories.
 */
export function findCategoryDef(categoryId: string): SymbolCategoryDef | undefined {
  // First check visible palette categories
  for (const group of SYMBOL_CATEGORY_GROUPS) {
    const found = group.categories.find(c => c.id === categoryId);
    if (found) return found;
  }
  // Then check hidden categories
  return HIDDEN_SYMBOL_CATEGORIES.find(c => c.id === categoryId);
}

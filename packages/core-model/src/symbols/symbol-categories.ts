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
    name: 'PLC',
    categories: [
      { id: 'plc-di-16', label: 'DI-16', prefix: 'PLC' },
      { id: 'plc-do-16', label: 'DO-16', prefix: 'PLC' },
      { id: 'plc-ai-8', label: 'AI-8', prefix: 'PLC' },
      { id: 'plc-ao-4', label: 'AO-4', prefix: 'PLC' },
      { id: 'plc-cpu', label: 'CPU', prefix: 'PLC' },
      { id: 'plc-ps', label: 'PLC PS', prefix: 'PLC' },
    ],
  },
  {
    name: 'Power',
    categories: [
      { id: 'power-supply', label: 'Power Supply', prefix: 'PS' },
      { id: 'circuit-breaker', label: 'Circuit Breaker', prefix: 'CB' },
      { id: 'fuse', label: 'Fuse', prefix: 'FU' },
      { id: 'transformer', label: 'Transformer', prefix: 'T' },
      { id: 'disconnect', label: 'Disconnect', prefix: 'QS' },
    ],
  },
  {
    name: 'Control',
    categories: [
      { id: 'contactor', label: 'Contactor', prefix: 'K' },
      { id: 'button', label: 'Button', prefix: 'S' },
      { id: 'overload', label: 'Overload', prefix: 'F' },
      { id: 'relay-coil', label: 'Relay Coil', prefix: 'CR' },
      { id: 'relay-contact-no', label: 'Contact NO', prefix: 'CR' },
      { id: 'relay-contact-nc', label: 'Contact NC', prefix: 'CR' },
      { id: 'timer-relay', label: 'Timer Relay', prefix: 'TR' },
    ],
  },
  {
    name: 'Terminal',
    categories: [
      // Single terminal = one octagon. For multi-level terminals (dual/triple),
      // place multiple single terminals and link them via terminalId.
      { id: 'single-terminal', label: 'Terminal', prefix: 'X' },
      { id: 'fuse-terminal', label: 'Fuse Terminal', prefix: 'X' },
      { id: 'ground-terminal', label: 'Ground Terminal', prefix: 'X' },
      { id: 'disconnect-terminal', label: 'Disconnect Terminal', prefix: 'X' },
    ],
  },
  {
    name: 'Field',
    categories: [
      { id: 'motor', label: 'Motor', prefix: 'M' },
      { id: 'level-switch', label: 'Level Switch', prefix: 'LSL' },
      { id: 'pressure-xmtr', label: 'Pressure Xmtr', prefix: 'PT' },
      { id: 'flow-meter', label: 'Flow Meter', prefix: 'FT' },
      { id: 'valve', label: 'Valve', prefix: 'XV' },
      { id: 'solenoid', label: 'Solenoid', prefix: 'YV' },
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

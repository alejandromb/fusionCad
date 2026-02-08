/**
 * Symbol Loader
 *
 * Loads symbol definitions from JSON files and registers them in the library.
 * This allows symbols to be stored in the database (for custom symbols) or
 * loaded from bundled JSON files (for built-in symbols).
 */

import type { SymbolDefinition, SymbolPin, PinType, PinDirection, SymbolPath, SymbolText } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * JSON schema for symbol definitions (more lenient than internal types)
 */
interface JsonSymbolPin {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: string;
  pinType?: string;
}

interface JsonSymbolText {
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  fontWeight?: string;
}

interface JsonSymbolDefinition {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  svgPath: string;
  pins: JsonSymbolPin[];
  texts?: JsonSymbolText[];
  tagPrefix?: string;
  source?: string;
  iecReference?: string;
}

interface JsonSymbolFile {
  version: string;
  source?: string;
  symbols: JsonSymbolDefinition[];
}

/**
 * Convert JSON pin to internal SymbolPin format
 */
function convertPin(jsonPin: JsonSymbolPin): SymbolPin {
  return {
    id: jsonPin.id,
    name: jsonPin.name,
    position: { x: jsonPin.x, y: jsonPin.y },
    direction: (jsonPin.direction || 'top') as PinDirection,
    pinType: (jsonPin.pinType || 'passive') as PinType,
  };
}

/**
 * Convert JSON symbol to internal SymbolDefinition format
 */
function convertSymbol(jsonSymbol: JsonSymbolDefinition, source?: string): SymbolDefinition {
  const paths: SymbolPath[] = [];

  // Convert single svgPath string to paths array
  if (jsonSymbol.svgPath) {
    paths.push({
      d: jsonSymbol.svgPath,
      stroke: true,
      strokeWidth: 2,
    });
  }

  const texts: SymbolText[] = (jsonSymbol.texts || []).map(t => ({
    content: t.content,
    x: t.x,
    y: t.y,
    fontSize: t.fontSize || 12,
    fontWeight: (t.fontWeight || 'normal') as 'normal' | 'bold',
  }));

  return {
    id: jsonSymbol.id,
    type: 'symbol-definition',
    name: jsonSymbol.name,
    category: jsonSymbol.category,
    geometry: {
      width: jsonSymbol.width,
      height: jsonSymbol.height,
    },
    pins: jsonSymbol.pins.map(convertPin),
    paths,
    texts: texts.length > 0 ? texts : undefined,
    tagPrefix: jsonSymbol.tagPrefix,
    source: jsonSymbol.source || source,
    iecReference: jsonSymbol.iecReference,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

/**
 * Load symbols from a JSON object and register them
 */
export function loadSymbolsFromJson(json: JsonSymbolFile): SymbolDefinition[] {
  const symbols: SymbolDefinition[] = [];

  for (const jsonSymbol of json.symbols) {
    const symbol = convertSymbol(jsonSymbol, json.source);
    registerSymbol(symbol);
    symbols.push(symbol);
  }

  return symbols;
}

/**
 * Load a single symbol from JSON data
 */
export function loadSingleSymbol(jsonSymbol: JsonSymbolDefinition, source?: string): SymbolDefinition {
  const symbol = convertSymbol(jsonSymbol, source);
  registerSymbol(symbol);
  return symbol;
}

// Note: Built-in symbols are loaded in iec-symbols.ts via static import

/**
 * Get symbol categories from loaded symbols
 */
export function getLoadedCategories(symbols: SymbolDefinition[]): string[] {
  const categories = new Set<string>();
  for (const symbol of symbols) {
    categories.add(symbol.category);
  }
  return Array.from(categories).sort();
}

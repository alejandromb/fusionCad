/**
 * Parametric Symbol Generators
 *
 * Generate schematic symbols programmatically from parameters.
 * Used for families where pin count varies (PLC I/O modules, etc.)
 * so we don't need a hand-drawn symbol for every channel count.
 *
 * Generated symbols match the visual style of the hand-drawn builtins:
 * - Same 60px width, pin spacing, body inset, text placement
 * - Consistent pin naming (DI0, DI1, ..., AI0+, AI0-, ...)
 * - Proper pin directions (inputs left, outputs right)
 */

import type { SymbolDefinition, SymbolPin, SymbolPrimitive, PinType, PinDirection } from '../types.js';

// ---------------------------------------------------------------------------
// Constants matching the existing hand-drawn PLC symbol style
// ---------------------------------------------------------------------------

const WIDTH = 60;
const BODY_INSET = 10;       // body rect starts at x=10
const BODY_WIDTH = 40;       // body rect width = 60 - 2*10
const FIRST_PIN_Y = 15;      // y of first pin (COM/V+)
const DIGITAL_SPACING = 13;  // px between digital pins
const ANALOG_SPACING = 10;   // px between analog +/- pins

// ---------------------------------------------------------------------------
// PLC Digital I/O Generator (DI-N, DO-N)
// ---------------------------------------------------------------------------

export type PLCDigitalType = 'DI' | 'DO';

/**
 * Generate a PLC digital I/O module symbol.
 *
 * Layout rules (matching hand-drawn builtins):
 * - DI: inputs on LEFT, COM on left at y=15
 * - DO: outputs on RIGHT, COM on right at y=15
 * - Channels split evenly: first half on primary side, second half on secondary
 * - Pin IDs: COM, DI0..DI(N-1) or DO0..DO(N-1)
 */
export function generatePLCDigitalSymbol(type: PLCDigitalType, channels: number): SymbolDefinition {
  const isInput = type === 'DI';
  const primarySide: 'left' | 'right' = isInput ? 'left' : 'right';
  const secondarySide: 'left' | 'right' = isInput ? 'right' : 'left';
  const pinType: PinType = isInput ? 'input' : 'output';

  // Split channels: first half + COM on primary, second half on secondary
  const halfChannels = Math.ceil(channels / 2);
  const primaryCount = halfChannels + 1; // +1 for COM
  const secondaryCount = channels - halfChannels;

  const maxPerSide = Math.max(primaryCount, secondaryCount);
  const bodyHeight = FIRST_PIN_Y + (maxPerSide - 1) * DIGITAL_SPACING + FIRST_PIN_Y;
  const height = bodyHeight + 10; // 5px padding top and bottom

  const pins: SymbolPin[] = [];
  const primitives: SymbolPrimitive[] = [];

  const primaryX = isInput ? 0 : WIDTH;
  const secondaryX = isInput ? WIDTH : 0;
  const primaryDirection: PinDirection = primarySide;
  const secondaryDirection: PinDirection = secondarySide;

  // COM pin on primary side
  pins.push({
    id: 'COM', name: 'COM',
    position: { x: primaryX, y: FIRST_PIN_Y },
    direction: primaryDirection, pinType: 'power',
  });

  // First half of channels on primary side (after COM)
  for (let i = 0; i < halfChannels; i++) {
    const y = FIRST_PIN_Y + (i + 1) * DIGITAL_SPACING;
    pins.push({
      id: `${type}${i}`, name: `${type}${i}`,
      position: { x: primaryX, y },
      direction: primaryDirection, pinType,
    });
  }

  // Second half of channels on secondary side
  for (let i = 0; i < secondaryCount; i++) {
    const y = FIRST_PIN_Y + i * DIGITAL_SPACING;
    pins.push({
      id: `${type}${halfChannels + i}`, name: `${type}${halfChannels + i}`,
      position: { x: secondaryX, y },
      direction: secondaryDirection, pinType,
    });
  }

  // Body rectangle
  primitives.push({ type: 'rect', x: BODY_INSET, y: 5, width: BODY_WIDTH, height: bodyHeight - 2 });

  // Center labels
  const centerX = WIDTH / 2;
  const centerY = bodyHeight / 2;
  primitives.push({ type: 'text', x: centerX, y: centerY - 8, content: type, fontSize: 14, fontWeight: 'bold', textAnchor: 'middle' });
  primitives.push({ type: 'text', x: centerX, y: centerY + 8, content: `${channels}-Ch`, fontSize: 9, fontWeight: 'normal', textAnchor: 'middle' });

  // Pin stub lines
  for (const pin of pins) {
    const px = pin.position.x;
    const py = pin.position.y;
    if (px === 0) {
      primitives.push({ type: 'line', x1: 0, y1: py, x2: BODY_INSET, y2: py });
    } else {
      primitives.push({ type: 'line', x1: WIDTH - BODY_INSET, y1: py, x2: WIDTH, y2: py });
    }
  }

  return {
    id: `generated-plc-${type.toLowerCase()}-${channels}`,
    type: 'symbol-definition',
    name: `PLC ${type} ${channels}-Ch`,
    category: 'PLC',
    geometry: { width: WIDTH, height },
    pins,
    primitives,
    tagPrefix: 'PLC',
    source: 'generated',
    standard: 'common',
    createdAt: 0,
    modifiedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// PLC Analog I/O Generator (AI-N, AO-N)
// ---------------------------------------------------------------------------

export type PLCAnalogType = 'AI' | 'AO';

/**
 * Generate a PLC analog I/O module symbol.
 *
 * Layout rules:
 * - AI: inputs on LEFT, V+ on left at y=15
 * - AO: outputs on RIGHT, V+ on right at y=15
 * - Each channel has +/- differential pair
 * - Channels split: first half on primary, second half on secondary
 * - Pin IDs: V+, AI0+, AI0-, AI1+, AI1-, ... or AO0+, AO0-, ...
 */
export function generatePLCAnalogSymbol(type: PLCAnalogType, channels: number): SymbolDefinition {
  const isInput = type === 'AI';
  const primarySide: 'left' | 'right' = isInput ? 'left' : 'right';
  const secondarySide: 'left' | 'right' = isInput ? 'right' : 'left';
  const pinType: PinType = isInput ? 'input' : 'output';

  const halfChannels = Math.ceil(channels / 2);
  const secondaryChannels = channels - halfChannels;

  // Primary side: V+ pin + halfChannels * 2 signal pins (+/-)
  const primaryPinCount = 1 + halfChannels * 2;
  // Secondary side: secondaryChannels * 2 signal pins (+/-)
  const secondaryPinCount = secondaryChannels * 2;

  const maxPerSide = Math.max(primaryPinCount, secondaryPinCount);
  const bodyHeight = FIRST_PIN_Y + (maxPerSide - 1) * ANALOG_SPACING + FIRST_PIN_Y;
  const height = bodyHeight + 10;

  const pins: SymbolPin[] = [];
  const primitives: SymbolPrimitive[] = [];

  const primaryX = isInput ? 0 : WIDTH;
  const secondaryX = isInput ? WIDTH : 0;
  const primaryDirection: PinDirection = primarySide;
  const secondaryDirection: PinDirection = secondarySide;

  // V+ power pin on primary side
  pins.push({
    id: 'V+', name: 'V+',
    position: { x: primaryX, y: FIRST_PIN_Y },
    direction: primaryDirection, pinType: 'power',
  });

  // First half of channels on primary side (after V+)
  let yOffset = FIRST_PIN_Y + ANALOG_SPACING;
  for (let i = 0; i < halfChannels; i++) {
    pins.push({
      id: `${type}${i}+`, name: `${type}${i}+`,
      position: { x: primaryX, y: yOffset },
      direction: primaryDirection, pinType,
    });
    yOffset += ANALOG_SPACING;
    pins.push({
      id: `${type}${i}-`, name: `${type}${i}-`,
      position: { x: primaryX, y: yOffset },
      direction: primaryDirection, pinType,
    });
    yOffset += ANALOG_SPACING;
  }

  // Second half of channels on secondary side
  yOffset = FIRST_PIN_Y;
  for (let i = halfChannels; i < channels; i++) {
    pins.push({
      id: `${type}${i}+`, name: `${type}${i}+`,
      position: { x: secondaryX, y: yOffset },
      direction: secondaryDirection, pinType,
    });
    yOffset += ANALOG_SPACING;
    pins.push({
      id: `${type}${i}-`, name: `${type}${i}-`,
      position: { x: secondaryX, y: yOffset },
      direction: secondaryDirection, pinType,
    });
    yOffset += ANALOG_SPACING;
  }

  // Body rectangle
  primitives.push({ type: 'rect', x: BODY_INSET, y: 5, width: BODY_WIDTH, height: bodyHeight - 2 });

  // Center labels
  const centerX = WIDTH / 2;
  const centerY = bodyHeight / 2;
  primitives.push({ type: 'text', x: centerX, y: centerY - 8, content: type, fontSize: 14, fontWeight: 'bold', textAnchor: 'middle' });
  primitives.push({ type: 'text', x: centerX, y: centerY + 8, content: `${channels}-Ch`, fontSize: 9, fontWeight: 'normal', textAnchor: 'middle' });

  // Pin stub lines
  for (const pin of pins) {
    const px = pin.position.x;
    const py = pin.position.y;
    if (px === 0) {
      primitives.push({ type: 'line', x1: 0, y1: py, x2: BODY_INSET, y2: py });
    } else {
      primitives.push({ type: 'line', x1: WIDTH - BODY_INSET, y1: py, x2: WIDTH, y2: py });
    }
  }

  return {
    id: `generated-plc-${type.toLowerCase()}-${channels}`,
    type: 'symbol-definition',
    name: `PLC ${type} ${channels}-Ch`,
    category: 'PLC',
    geometry: { width: WIDTH, height },
    pins,
    primitives,
    tagPrefix: 'PLC',
    source: 'generated',
    standard: 'common',
    createdAt: 0,
    modifiedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Category parser — extract type + channels from category strings
// ---------------------------------------------------------------------------

interface ParsedPLCCategory {
  type: 'DI' | 'DO' | 'AI' | 'AO';
  channels: number;
}

/**
 * Parse a PLC category string like 'plc-di-16' into type and channel count.
 * Returns null if the string doesn't match the pattern.
 */
export function parsePLCCategory(category: string): ParsedPLCCategory | null {
  const match = category.match(/^plc-(di|do|ai|ao)-(\d+)$/i);
  if (!match) return null;
  return {
    type: match[1].toUpperCase() as ParsedPLCCategory['type'],
    channels: parseInt(match[2], 10),
  };
}

/**
 * Try to generate a symbol for a PLC module category.
 * Returns null if the category isn't a recognized PLC pattern.
 */
export function tryGeneratePLCSymbol(category: string): SymbolDefinition | null {
  const parsed = parsePLCCategory(category);
  if (!parsed) return null;

  if (parsed.type === 'DI' || parsed.type === 'DO') {
    return generatePLCDigitalSymbol(parsed.type, parsed.channels);
  }
  return generatePLCAnalogSymbol(parsed.type, parsed.channels);
}

// ---------------------------------------------------------------------------
// Smart generic fallback — better than a blank 40x40 box
// ---------------------------------------------------------------------------

/**
 * Generate a labeled generic symbol from a category string.
 * Creates a rectangle with the category name, a "?" badge, and 2 generic pins.
 * Used as last-resort fallback — better than a blank box.
 */
export function generateSmartFallback(category: string): SymbolDefinition {
  // Clean up the category for display (e.g., 'plc-cpu' → 'PLC CPU')
  const label = category
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .substring(0, 12); // truncate long labels

  const width = 50;
  const height = 50;

  const pins: SymbolPin[] = [
    { id: '1', name: '1', position: { x: 0, y: 15 }, direction: 'left', pinType: 'passive' },
    { id: '2', name: '2', position: { x: 0, y: 35 }, direction: 'left', pinType: 'passive' },
    { id: '3', name: '3', position: { x: width, y: 15 }, direction: 'right', pinType: 'passive' },
    { id: '4', name: '4', position: { x: width, y: 35 }, direction: 'right', pinType: 'passive' },
  ];

  const primitives: SymbolPrimitive[] = [
    // Body with dashed outline to signal "placeholder"
    { type: 'rect', x: 5, y: 2, width: width - 10, height: height - 4, strokeDash: [4, 3] },
    // Category label
    { type: 'text', x: width / 2, y: 18, content: label, fontSize: 8, fontWeight: 'normal', textAnchor: 'middle' },
    // "?" indicator
    { type: 'text', x: width / 2, y: 36, content: '?', fontSize: 16, fontWeight: 'bold', textAnchor: 'middle' },
    // Pin stubs
    { type: 'line', x1: 0, y1: 15, x2: 5, y2: 15 },
    { type: 'line', x1: 0, y1: 35, x2: 5, y2: 35 },
    { type: 'line', x1: width - 5, y1: 15, x2: width, y2: 15 },
    { type: 'line', x1: width - 5, y1: 35, x2: width, y2: 35 },
  ];

  return {
    id: `fallback-${category}`,
    type: 'symbol-definition',
    name: `Unknown: ${category}`,
    category: 'generic',
    geometry: { width, height },
    pins,
    primitives,
    tagPrefix: 'D',
    source: 'generated-fallback',
    standard: 'common',
    createdAt: 0,
    modifiedAt: 0,
  };
}

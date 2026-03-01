/**
 * Parametric Symbol Generators
 *
 * Generate schematic symbols programmatically from parameters.
 * Used for families where pin count varies (PLC I/O modules, etc.)
 * so we don't need a hand-drawn symbol for every channel count.
 *
 * Industrial convention (IEC/NFPA):
 * - Input modules: ALL pins on LEFT side
 * - Output modules: ALL pins on RIGHT side
 * - Tall symbols with generous spacing for wiring clarity
 * - COM/GND pins interleaved after every 8 channels
 * - Terminal numbers + channel labels inside the body
 */

import type { SymbolDefinition, SymbolPin, SymbolPrimitive, PinType, PinDirection } from '../types.js';

// ---------------------------------------------------------------------------
// Constants for industrial-convention PLC symbols
// ---------------------------------------------------------------------------

const WIDTH = 100;
const BODY_INSET = 15;           // body rect starts at x=15
const BODY_WIDTH = WIDTH - 2 * BODY_INSET; // 70px
const HEADER_HEIGHT = 50;        // space for module type text at top
const FOOTER_HEIGHT = 20;        // bottom padding
const DIGITAL_PIN_SPACING = 30;  // px between digital pins (generous for wiring)
const ANALOG_PIN_SPACING = 20;   // px between analog pins

// ---------------------------------------------------------------------------
// PLC Digital I/O Generator (DI-N, DO-N)
// ---------------------------------------------------------------------------

export type PLCDigitalType = 'DI' | 'DO';

/**
 * Generate a PLC digital I/O module symbol.
 *
 * Industrial convention:
 * - DI: ALL pins on LEFT side
 * - DO: ALL pins on RIGHT side
 * - COM pin after every 8 channels (COM for <=8ch, COM0/COM1/... for >8ch)
 * - Terminal numbers + channel labels inside body
 */
export function generatePLCDigitalSymbol(type: PLCDigitalType, channels: number): SymbolDefinition {
  const isInput = type === 'DI';
  const pinSide: 'left' | 'right' = isInput ? 'left' : 'right';
  const pinType: PinType = isInput ? 'input' : 'output';
  const pinDirection: PinDirection = pinSide;
  const pinX = isInput ? 0 : WIDTH;

  // Build pin list with COM pins interleaved after every 8 channels
  const pins: SymbolPin[] = [];
  const comCount = Math.ceil(channels / 8); // one COM per 8-channel group
  let pinIndex = 0; // sequential position counter

  for (let group = 0; group < comCount; group++) {
    const startCh = group * 8;
    const endCh = Math.min(startCh + 8, channels);

    // Channel pins for this group
    for (let ch = startCh; ch < endCh; ch++) {
      const y = HEADER_HEIGHT + pinIndex * DIGITAL_PIN_SPACING;
      pins.push({
        id: `${type}${ch}`,
        name: `${type}${ch}`,
        position: { x: pinX, y },
        direction: pinDirection,
        pinType,
      });
      pinIndex++;
    }

    // COM pin after this group
    const comId = comCount === 1 ? 'COM' : `COM${group}`;
    const comName = comId;
    const y = HEADER_HEIGHT + pinIndex * DIGITAL_PIN_SPACING;
    pins.push({
      id: comId,
      name: comName,
      position: { x: pinX, y },
      direction: pinDirection,
      pinType: 'power',
    });
    pinIndex++;
  }

  const totalPins = pins.length; // channels + comCount
  const lastPinY = HEADER_HEIGHT + (totalPins - 1) * DIGITAL_PIN_SPACING;
  const height = lastPinY + FOOTER_HEIGHT;

  const primitives: SymbolPrimitive[] = [];

  // Body rectangle
  primitives.push({
    type: 'rect',
    x: BODY_INSET, y: 5,
    width: BODY_WIDTH, height: height - 10,
  });

  // Header labels (module type + channel count)
  const centerX = WIDTH / 2;
  primitives.push({
    type: 'text', x: centerX, y: 20,
    content: type, fontSize: 14, fontWeight: 'bold', textAnchor: 'middle',
  });
  primitives.push({
    type: 'text', x: centerX, y: 36,
    content: `${channels}-Ch`, fontSize: 10, fontWeight: 'normal', textAnchor: 'middle',
  });

  // Pin stubs + terminal number + channel label inside body
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const py = pin.position.y;
    const termNum = i + 1;

    // Pin stub line
    if (isInput) {
      primitives.push({ type: 'line', x1: 0, y1: py, x2: BODY_INSET, y2: py });
    } else {
      primitives.push({ type: 'line', x1: WIDTH - BODY_INSET, y1: py, x2: WIDTH, y2: py });
    }

    // Terminal number (near the pin side, inside body)
    const termX = isInput ? BODY_INSET + 4 : WIDTH - BODY_INSET - 4;
    const termAnchor = isInput ? 'start' : 'end';
    primitives.push({
      type: 'text', x: termX, y: py,
      content: `${termNum}`, fontSize: 8, fontWeight: 'normal', textAnchor: termAnchor,
    });

    // Channel label (center-ish, inside body)
    const labelX = isInput ? WIDTH - BODY_INSET - 4 : BODY_INSET + 4;
    const labelAnchor = isInput ? 'end' : 'start';
    primitives.push({
      type: 'text', x: labelX, y: py,
      content: pin.name, fontSize: 8, fontWeight: 'normal', textAnchor: labelAnchor,
    });
  }

  return {
    id: `iec-plc-${type.toLowerCase()}-${channels}`,
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
 * Industrial convention:
 * - AI: ALL pins on LEFT side
 * - AO: ALL pins on RIGHT side
 * - V+ power pin first, then CH0+/CH0-, CH1+/CH1-, etc.
 */
export function generatePLCAnalogSymbol(type: PLCAnalogType, channels: number): SymbolDefinition {
  const isInput = type === 'AI';
  const pinSide: 'left' | 'right' = isInput ? 'left' : 'right';
  const pinType: PinType = isInput ? 'input' : 'output';
  const pinDirection: PinDirection = pinSide;
  const pinX = isInput ? 0 : WIDTH;

  const pins: SymbolPin[] = [];
  let pinIndex = 0;

  // V+ power pin first
  pins.push({
    id: 'V+', name: 'V+',
    position: { x: pinX, y: HEADER_HEIGHT + pinIndex * ANALOG_PIN_SPACING },
    direction: pinDirection, pinType: 'power',
  });
  pinIndex++;

  // Channel pairs: CH0+, CH0-, CH1+, CH1-, ...
  for (let ch = 0; ch < channels; ch++) {
    pins.push({
      id: `${type}${ch}+`, name: `${type}${ch}+`,
      position: { x: pinX, y: HEADER_HEIGHT + pinIndex * ANALOG_PIN_SPACING },
      direction: pinDirection, pinType,
    });
    pinIndex++;
    pins.push({
      id: `${type}${ch}-`, name: `${type}${ch}-`,
      position: { x: pinX, y: HEADER_HEIGHT + pinIndex * ANALOG_PIN_SPACING },
      direction: pinDirection, pinType,
    });
    pinIndex++;
  }

  const totalPins = pins.length; // 1 (V+) + channels * 2
  const lastPinY = HEADER_HEIGHT + (totalPins - 1) * ANALOG_PIN_SPACING;
  const height = lastPinY + FOOTER_HEIGHT;

  const primitives: SymbolPrimitive[] = [];

  // Body rectangle
  primitives.push({
    type: 'rect',
    x: BODY_INSET, y: 5,
    width: BODY_WIDTH, height: height - 10,
  });

  // Header labels
  const centerX = WIDTH / 2;
  primitives.push({
    type: 'text', x: centerX, y: 20,
    content: type, fontSize: 14, fontWeight: 'bold', textAnchor: 'middle',
  });
  primitives.push({
    type: 'text', x: centerX, y: 36,
    content: `${channels}-Ch`, fontSize: 10, fontWeight: 'normal', textAnchor: 'middle',
  });

  // Pin stubs + terminal number + channel label inside body
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const py = pin.position.y;
    const termNum = i + 1;

    // Pin stub line
    if (isInput) {
      primitives.push({ type: 'line', x1: 0, y1: py, x2: BODY_INSET, y2: py });
    } else {
      primitives.push({ type: 'line', x1: WIDTH - BODY_INSET, y1: py, x2: WIDTH, y2: py });
    }

    // Terminal number (near the pin side, inside body)
    const termX = isInput ? BODY_INSET + 4 : WIDTH - BODY_INSET - 4;
    const termAnchor = isInput ? 'start' : 'end';
    primitives.push({
      type: 'text', x: termX, y: py,
      content: `${termNum}`, fontSize: 8, fontWeight: 'normal', textAnchor: termAnchor,
    });

    // Channel label (opposite side, inside body)
    const labelX = isInput ? WIDTH - BODY_INSET - 4 : BODY_INSET + 4;
    const labelAnchor = isInput ? 'end' : 'start';
    primitives.push({
      type: 'text', x: labelX, y: py,
      content: pin.name, fontSize: 8, fontWeight: 'normal', textAnchor: labelAnchor,
    });
  }

  return {
    id: `iec-plc-${type.toLowerCase()}-${channels}`,
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
 * Parse a PLC category string like 'plc-di-16' or 'iec-plc-di-16' into type and channel count.
 * Returns null if the string doesn't match the pattern.
 */
export function parsePLCCategory(category: string): ParsedPLCCategory | null {
  const match = category.match(/^(?:iec-)?plc-(di|do|ai|ao)-(\d+)$/i);
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

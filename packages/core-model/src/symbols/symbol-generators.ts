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
const DIGITAL_PIN_SPACING = 60;  // px between digital pins (matches relay coil height for alignment)
const ANALOG_PIN_SPACING = 40;   // px between analog pins

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
// Micro800 / Compact PLC CPU Generator
// ---------------------------------------------------------------------------

interface Micro800Config {
  model: string;        // e.g., 'Micro850', 'Micro870'
  catalogNumber?: string; // e.g., '2080-LC50-48QWB'
  diCount: number;
  doCount: number;
  aiCount?: number;     // embedded analog inputs
  aoCount?: number;     // embedded analog outputs
  hasCommunication?: boolean; // Ethernet/USB
}

const MICRO800_MODELS: Record<string, Micro800Config> = {
  'micro820': { model: 'Micro820', catalogNumber: '2080-LC20-20QWB', diCount: 12, doCount: 8, aiCount: 4, hasCommunication: true },
  'micro830': { model: 'Micro830', catalogNumber: '2080-LC30-48QWB', diCount: 24, doCount: 16, hasCommunication: true },
  'micro850': { model: 'Micro850', catalogNumber: '2080-LC50-48QWB', diCount: 24, doCount: 16, aiCount: 2, hasCommunication: true },
  'micro870': { model: 'Micro870', catalogNumber: '2080-LC70-24QWB', diCount: 12, doCount: 12, aiCount: 4, aoCount: 2, hasCommunication: true },
};

/**
 * Generate a Micro800 PLC CPU symbol with embedded I/O.
 * Left side: DI pins + AI pins (inputs)
 * Right side: DO pins + AO pins (outputs)
 * Top: Power (V+, V-) + Comm ports
 */
export function generateMicro800Symbol(modelKey: string): SymbolDefinition | null {
  const config = MICRO800_MODELS[modelKey.toLowerCase()];
  if (!config) return null;

  const PIN_SPACING = 25;
  const BODY_X = 20;
  const BODY_R = 130;   // body right edge
  const TOTAL_W = 150;
  const HEADER_H = 60;

  // Calculate left side pin count (DI + AI + COM pins)
  const diComCount = Math.ceil(config.diCount / 8);
  const leftPinCount = config.diCount + diComCount + (config.aiCount || 0);

  // Calculate right side pin count (DO + AO + COM pins)
  const doComCount = Math.ceil(config.doCount / 8);
  const rightPinCount = config.doCount + doComCount + (config.aoCount || 0);

  const maxPins = Math.max(leftPinCount, rightPinCount);
  const bodyBottom = HEADER_H + maxPins * PIN_SPACING + 20;
  const totalHeight = bodyBottom + 10;

  const pins: SymbolPin[] = [];
  const primitives: SymbolPrimitive[] = [];

  // Body rectangle
  primitives.push({ type: 'rect', x: BODY_X, y: 5, width: BODY_R - BODY_X, height: bodyBottom - 5 });

  // Header text
  const centerX = TOTAL_W / 2;
  primitives.push({ type: 'text', x: centerX, y: 18, content: config.model, fontSize: 12, fontWeight: 'bold', textAnchor: 'middle' });
  if (config.catalogNumber) {
    primitives.push({ type: 'text', x: centerX, y: 32, content: config.catalogNumber, fontSize: 8, textAnchor: 'middle' });
  }
  // Separator line under header
  primitives.push({ type: 'line', x1: BODY_X, y1: 40, x2: BODY_R, y2: 40 });

  // Section labels
  primitives.push({ type: 'text', x: BODY_X + 5, y: 53, content: 'INPUTS', fontSize: 7, fontWeight: 'bold', textAnchor: 'start' });
  primitives.push({ type: 'text', x: BODY_R - 5, y: 53, content: 'OUTPUTS', fontSize: 7, fontWeight: 'bold', textAnchor: 'end' });

  // --- Left side: DI pins with COM groups ---
  let leftY = HEADER_H;
  let diGroup = 0;
  for (let i = 0; i < config.diCount; i++) {
    if (i > 0 && i % 8 === 0) {
      // COM pin between groups
      const comId = diComCount === 1 ? 'DC_COM' : `DC_COM${diGroup}`;
      pins.push({ id: comId, name: comId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'power' });
      primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
      primitives.push({ type: 'text', x: BODY_X + 3, y: leftY, content: comId, fontSize: 7, textAnchor: 'start' });
      leftY += PIN_SPACING;
      diGroup++;
    }
    const pinId = `DI${i}`;
    pins.push({ id: pinId, name: pinId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'input' });
    primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
    primitives.push({ type: 'text', x: BODY_X + 3, y: leftY, content: pinId, fontSize: 7, textAnchor: 'start' });
    leftY += PIN_SPACING;
  }
  // Final DI COM
  const lastDiCom = diComCount === 1 ? 'DC_COM' : `DC_COM${diGroup}`;
  if (!pins.find(p => p.id === lastDiCom)) {
    pins.push({ id: lastDiCom, name: lastDiCom, position: { x: 0, y: leftY }, direction: 'left', pinType: 'power' });
    primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
    primitives.push({ type: 'text', x: BODY_X + 3, y: leftY, content: lastDiCom, fontSize: 7, textAnchor: 'start' });
    leftY += PIN_SPACING;
  }

  // Embedded AI pins
  if (config.aiCount) {
    primitives.push({ type: 'line', x1: BODY_X + 5, y1: leftY - 8, x2: centerX - 10, y2: leftY - 8, strokeDash: [2, 2] });
    for (let i = 0; i < config.aiCount; i++) {
      const pinId = `AI${i}`;
      pins.push({ id: pinId, name: pinId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'input' });
      primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
      primitives.push({ type: 'text', x: BODY_X + 3, y: leftY, content: pinId, fontSize: 7, textAnchor: 'start' });
      leftY += PIN_SPACING;
    }
  }

  // --- Right side: DO pins with COM groups ---
  let rightY = HEADER_H;
  let doGroup = 0;
  for (let i = 0; i < config.doCount; i++) {
    if (i > 0 && i % 8 === 0) {
      const comId = doComCount === 1 ? 'DO_COM' : `DO_COM${doGroup}`;
      pins.push({ id: comId, name: comId, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'power' });
      primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
      primitives.push({ type: 'text', x: BODY_R - 3, y: rightY, content: comId, fontSize: 7, textAnchor: 'end' });
      rightY += PIN_SPACING;
      doGroup++;
    }
    const pinId = `DO${i}`;
    pins.push({ id: pinId, name: pinId, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'output' });
    primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
    primitives.push({ type: 'text', x: BODY_R - 3, y: rightY, content: pinId, fontSize: 7, textAnchor: 'end' });
    rightY += PIN_SPACING;
  }
  // Final DO COM
  const lastDoCom = doComCount === 1 ? 'DO_COM' : `DO_COM${doGroup}`;
  if (!pins.find(p => p.id === lastDoCom)) {
    pins.push({ id: lastDoCom, name: lastDoCom, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'power' });
    primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
    primitives.push({ type: 'text', x: BODY_R - 3, y: rightY, content: lastDoCom, fontSize: 7, textAnchor: 'end' });
    rightY += PIN_SPACING;
  }

  // Embedded AO pins
  if (config.aoCount) {
    primitives.push({ type: 'line', x1: centerX + 10, y1: rightY - 8, x2: BODY_R - 5, y2: rightY - 8, strokeDash: [2, 2] });
    for (let i = 0; i < config.aoCount; i++) {
      const pinId = `AO${i}`;
      pins.push({ id: pinId, name: pinId, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'output' });
      primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
      primitives.push({ type: 'text', x: BODY_R - 3, y: rightY, content: pinId, fontSize: 7, textAnchor: 'end' });
      rightY += PIN_SPACING;
    }
  }

  return {
    id: `ab-${modelKey.toLowerCase()}-cpu`,
    type: 'symbol-definition',
    name: `AB ${config.model} CPU`,
    category: 'PLC',
    geometry: { width: TOTAL_W, height: totalHeight },
    pins,
    primitives,
    tagPrefix: 'PLC',
    source: 'generated',
    standard: 'common',
    createdAt: 0,
    modifiedAt: 0,
  };
}

/**
 * Try to generate a Micro800 symbol from a category string.
 * Matches patterns like 'micro850', 'ab-micro870-cpu', 'micro820'
 */
export function tryGenerateMicro800Symbol(category: string): SymbolDefinition | null {
  const normalized = category.toLowerCase().replace(/^ab-/, '').replace(/-cpu$/, '');
  if (MICRO800_MODELS[normalized]) {
    return generateMicro800Symbol(normalized);
  }
  return null;
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

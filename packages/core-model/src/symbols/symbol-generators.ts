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
// Constants for industrial-convention PLC symbols (all values in mm)
// ---------------------------------------------------------------------------

const WIDTH = 37.5;              // 150px / 4
const BODY_INSET = 5.5;          // body rect starts at x=5.5mm
const BODY_WIDTH = WIDTH - 2 * BODY_INSET; // ~26.5mm
const HEADER_HEIGHT = 20;        // space for module type text at top (mm)
const FOOTER_HEIGHT = 7.5;       // bottom padding (mm)
const DIGITAL_PIN_SPACING = 15;  // mm between digital pins
const ANALOG_PIN_SPACING = 11.25; // mm between analog pins

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
    x: BODY_INSET, y: 1.25,
    width: BODY_WIDTH, height: height - 2.5,
  });

  // Header labels (module type + channel count)
  const centerX = WIDTH / 2;
  primitives.push({
    type: 'text', x: centerX, y: 5,
    content: type, fontSize: 3.5, fontWeight: 'bold', textAnchor: 'middle',
  });
  primitives.push({
    type: 'text', x: centerX, y: 9,
    content: `${channels}-Ch`, fontSize: 2.5, fontWeight: 'normal', textAnchor: 'middle',
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
    const termX = isInput ? BODY_INSET + 1 : WIDTH - BODY_INSET - 1;
    const termAnchor = isInput ? 'start' : 'end';
    primitives.push({
      type: 'text', x: termX, y: py,
      content: `${termNum}`, fontSize: 2, fontWeight: 'normal', textAnchor: termAnchor,
    });

    // Channel label (center-ish, inside body)
    const labelX = isInput ? WIDTH - BODY_INSET - 1 : BODY_INSET + 1;
    const labelAnchor = isInput ? 'end' : 'start';
    primitives.push({
      type: 'text', x: labelX, y: py,
      content: pin.name, fontSize: 2, fontWeight: 'normal', textAnchor: labelAnchor,
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
    x: BODY_INSET, y: 1.25,
    width: BODY_WIDTH, height: height - 2.5,
  });

  // Header labels
  const centerX = WIDTH / 2;
  primitives.push({
    type: 'text', x: centerX, y: 5,
    content: type, fontSize: 3.5, fontWeight: 'bold', textAnchor: 'middle',
  });
  primitives.push({
    type: 'text', x: centerX, y: 9,
    content: `${channels}-Ch`, fontSize: 2.5, fontWeight: 'normal', textAnchor: 'middle',
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
    const termX = isInput ? BODY_INSET + 1 : WIDTH - BODY_INSET - 1;
    const termAnchor = isInput ? 'start' : 'end';
    primitives.push({
      type: 'text', x: termX, y: py,
      content: `${termNum}`, fontSize: 2, fontWeight: 'normal', textAnchor: termAnchor,
    });

    // Channel label (opposite side, inside body)
    const labelX = isInput ? WIDTH - BODY_INSET - 1 : BODY_INSET + 1;
    const labelAnchor = isInput ? 'end' : 'start';
    primitives.push({
      type: 'text', x: labelX, y: py,
      content: pin.name, fontSize: 2, fontWeight: 'normal', textAnchor: labelAnchor,
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

  // Micro800 — all dimensions in mm
  const PIN_SPACING = 9.5;
  const BODY_X = 7.5;
  const BODY_R = 48.75;   // body right edge
  const TOTAL_W = 56.25;
  const HEADER_H = 22.5;

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
  primitives.push({ type: 'rect', x: BODY_X, y: 1.25, width: BODY_R - BODY_X, height: bodyBottom - 1.25 });

  // Header text
  const centerX = TOTAL_W / 2;
  primitives.push({ type: 'text', x: centerX, y: 4.5, content: config.model, fontSize: 3, fontWeight: 'bold', textAnchor: 'middle' });
  if (config.catalogNumber) {
    primitives.push({ type: 'text', x: centerX, y: 8, content: config.catalogNumber, fontSize: 2, textAnchor: 'middle' });
  }
  // Separator line under header
  primitives.push({ type: 'line', x1: BODY_X, y1: 10, x2: BODY_R, y2: 10 });

  // Section labels
  primitives.push({ type: 'text', x: BODY_X + 1.25, y: 13.25, content: 'INPUTS', fontSize: 1.75, fontWeight: 'bold', textAnchor: 'start' });
  primitives.push({ type: 'text', x: BODY_R - 1.25, y: 13.25, content: 'OUTPUTS', fontSize: 1.75, fontWeight: 'bold', textAnchor: 'end' });

  // --- Left side: DI pins with COM groups ---
  let leftY = HEADER_H;
  let diGroup = 0;
  for (let i = 0; i < config.diCount; i++) {
    if (i > 0 && i % 8 === 0) {
      // COM pin between groups
      const comId = diComCount === 1 ? 'DC_COM' : `DC_COM${diGroup}`;
      pins.push({ id: comId, name: comId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'power' });
      primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
      primitives.push({ type: 'text', x: BODY_X + 0.75, y: leftY, content: comId, fontSize: 1.75, textAnchor: 'start' });
      leftY += PIN_SPACING;
      diGroup++;
    }
    const pinId = `DI${i}`;
    pins.push({ id: pinId, name: pinId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'input' });
    primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
    primitives.push({ type: 'text', x: BODY_X + 0.75, y: leftY, content: pinId, fontSize: 1.75, textAnchor: 'start' });
    leftY += PIN_SPACING;
  }
  // Final DI COM
  const lastDiCom = diComCount === 1 ? 'DC_COM' : `DC_COM${diGroup}`;
  if (!pins.find(p => p.id === lastDiCom)) {
    pins.push({ id: lastDiCom, name: lastDiCom, position: { x: 0, y: leftY }, direction: 'left', pinType: 'power' });
    primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
    primitives.push({ type: 'text', x: BODY_X + 0.75, y: leftY, content: lastDiCom, fontSize: 1.75, textAnchor: 'start' });
    leftY += PIN_SPACING;
  }

  // Embedded AI pins
  if (config.aiCount) {
    primitives.push({ type: 'line', x1: BODY_X + 1.25, y1: leftY - 2, x2: centerX - 2.5, y2: leftY - 2, strokeDash: [0.5, 0.5] });
    for (let i = 0; i < config.aiCount; i++) {
      const pinId = `AI${i}`;
      pins.push({ id: pinId, name: pinId, position: { x: 0, y: leftY }, direction: 'left', pinType: 'input' });
      primitives.push({ type: 'line', x1: 0, y1: leftY, x2: BODY_X, y2: leftY });
      primitives.push({ type: 'text', x: BODY_X + 0.75, y: leftY, content: pinId, fontSize: 1.75, textAnchor: 'start' });
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
      primitives.push({ type: 'text', x: BODY_R - 0.75, y: rightY, content: comId, fontSize: 1.75, textAnchor: 'end' });
      rightY += PIN_SPACING;
      doGroup++;
    }
    const pinId = `DO${i}`;
    pins.push({ id: pinId, name: pinId, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'output' });
    primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
    primitives.push({ type: 'text', x: BODY_R - 0.75, y: rightY, content: pinId, fontSize: 1.75, textAnchor: 'end' });
    rightY += PIN_SPACING;
  }
  // Final DO COM
  const lastDoCom = doComCount === 1 ? 'DO_COM' : `DO_COM${doGroup}`;
  if (!pins.find(p => p.id === lastDoCom)) {
    pins.push({ id: lastDoCom, name: lastDoCom, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'power' });
    primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
    primitives.push({ type: 'text', x: BODY_R - 0.75, y: rightY, content: lastDoCom, fontSize: 1.75, textAnchor: 'end' });
    rightY += PIN_SPACING;
  }

  // Embedded AO pins
  if (config.aoCount) {
    primitives.push({ type: 'line', x1: centerX + 2.5, y1: rightY - 2, x2: BODY_R - 1.25, y2: rightY - 2, strokeDash: [0.5, 0.5] });
    for (let i = 0; i < config.aoCount; i++) {
      const pinId = `AO${i}`;
      pins.push({ id: pinId, name: pinId, position: { x: TOTAL_W, y: rightY }, direction: 'right', pinType: 'output' });
      primitives.push({ type: 'line', x1: BODY_R, y1: rightY, x2: TOTAL_W, y2: rightY });
      primitives.push({ type: 'text', x: BODY_R - 0.75, y: rightY, content: pinId, fontSize: 1.75, textAnchor: 'end' });
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

  const width = 12.5;  // 50px / 4
  const height = 12.5;

  const pins: SymbolPin[] = [
    { id: '1', name: '1', position: { x: 0, y: 3.75 }, direction: 'left', pinType: 'passive' },
    { id: '2', name: '2', position: { x: 0, y: 8.75 }, direction: 'left', pinType: 'passive' },
    { id: '3', name: '3', position: { x: width, y: 3.75 }, direction: 'right', pinType: 'passive' },
    { id: '4', name: '4', position: { x: width, y: 8.75 }, direction: 'right', pinType: 'passive' },
  ];

  const primitives: SymbolPrimitive[] = [
    // Body with dashed outline to signal "placeholder"
    { type: 'rect', x: 1.25, y: 0.5, width: width - 2.5, height: height - 1, strokeDash: [1, 0.75] },
    // Category label
    { type: 'text', x: width / 2, y: 4.5, content: label, fontSize: 2, fontWeight: 'normal', textAnchor: 'middle' },
    // "?" indicator
    { type: 'text', x: width / 2, y: 9, content: '?', fontSize: 4, fontWeight: 'bold', textAnchor: 'middle' },
    // Pin stubs
    { type: 'line', x1: 0, y1: 3.75, x2: 1.25, y2: 3.75 },
    { type: 'line', x1: 0, y1: 8.75, x2: 1.25, y2: 8.75 },
    { type: 'line', x1: width - 1.25, y1: 3.75, x2: width, y2: 3.75 },
    { type: 'line', x1: width - 1.25, y1: 8.75, x2: width, y2: 8.75 },
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

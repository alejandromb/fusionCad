/**
 * PLC Module Symbol Definitions
 *
 * Defines standard PLC hardware modules: digital I/O, analog I/O, CPU, and power supply.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all PLC symbol definitions.
 * Call this once at application startup.
 */
export function registerPLCSymbols(): void {
  registerSymbol(plcDI16Symbol);
  registerSymbol(plcDO16Symbol);
  registerSymbol(plcAI8Symbol);
  registerSymbol(plcAO4Symbol);
  registerSymbol(plcCPUSymbol);
  registerSymbol(plcPowerSupplySymbol);
}

const plcDI16Symbol: SymbolDefinition = {
  id: 'builtin-plc-di-16',
  type: 'symbol-definition',
  name: 'PLC DI-16',
  category: 'plc-di-16',
  pins: [
    // Left side: 16 digital inputs (DI:0 through DI:15)
    { id: 'DI:0', name: 'DI:0', pinType: 'input', position: { x: 0, y: 12.5 }, direction: 'left' },
    { id: 'DI:1', name: 'DI:1', pinType: 'input', position: { x: 0, y: 25 }, direction: 'left' },
    { id: 'DI:2', name: 'DI:2', pinType: 'input', position: { x: 0, y: 37.5 }, direction: 'left' },
    { id: 'DI:3', name: 'DI:3', pinType: 'input', position: { x: 0, y: 50 }, direction: 'left' },
    { id: 'DI:4', name: 'DI:4', pinType: 'input', position: { x: 0, y: 62.5 }, direction: 'left' },
    { id: 'DI:5', name: 'DI:5', pinType: 'input', position: { x: 0, y: 75 }, direction: 'left' },
    { id: 'DI:6', name: 'DI:6', pinType: 'input', position: { x: 0, y: 87.5 }, direction: 'left' },
    { id: 'DI:7', name: 'DI:7', pinType: 'input', position: { x: 0, y: 100 }, direction: 'left' },
    { id: 'DI:8', name: 'DI:8', pinType: 'input', position: { x: 0, y: 112.5 }, direction: 'left' },
    { id: 'DI:9', name: 'DI:9', pinType: 'input', position: { x: 0, y: 125 }, direction: 'left' },
    { id: 'DI:10', name: 'DI:10', pinType: 'input', position: { x: 0, y: 137.5 }, direction: 'left' },
    { id: 'DI:11', name: 'DI:11', pinType: 'input', position: { x: 0, y: 150 }, direction: 'left' },
    { id: 'DI:12', name: 'DI:12', pinType: 'input', position: { x: 0, y: 162.5 }, direction: 'left' },
    { id: 'DI:13', name: 'DI:13', pinType: 'input', position: { x: 0, y: 175 }, direction: 'left' },
    { id: 'DI:14', name: 'DI:14', pinType: 'input', position: { x: 0, y: 187.5 }, direction: 'left' },
    { id: 'DI:15', name: 'DI:15', pinType: 'input', position: { x: 0, y: 200 }, direction: 'left' },
    // Right side: common pin at center
    { id: 'COM', name: 'COM', pinType: 'passive', position: { x: 80, y: 100 }, direction: 'right' },
  ],
  geometry: { width: 80, height: 200 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 80,0 L 80,200 L 0,200 Z', stroke: true },
    // Channel tick marks on left side (16 ticks)
    { d: 'M 0,12.5 L 10,12.5 M 0,25 L 10,25 M 0,37.5 L 10,37.5 M 0,50 L 10,50 M 0,62.5 L 10,62.5 M 0,75 L 10,75 M 0,87.5 L 10,87.5 M 0,100 L 10,100 M 0,112.5 L 10,112.5 M 0,125 L 10,125 M 0,137.5 L 10,137.5 M 0,150 L 10,150 M 0,162.5 L 10,162.5 M 0,175 L 10,175 M 0,187.5 L 10,187.5 M 0,200 L 10,200', stroke: true },
    // Common connection line on right
    { d: 'M 70,100 L 80,100', stroke: true },
  ],
  texts: [{ content: 'DI-16', x: 40, y: 10, fontSize: 10, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

const plcDO16Symbol: SymbolDefinition = {
  id: 'builtin-plc-do-16',
  type: 'symbol-definition',
  name: 'PLC DO-16',
  category: 'plc-do-16',
  pins: [
    // Left side: common pin at center
    { id: 'COM', name: 'COM', pinType: 'passive', position: { x: 0, y: 100 }, direction: 'left' },
    // Right side: 16 digital outputs (DO:0 through DO:15)
    { id: 'DO:0', name: 'DO:0', pinType: 'output', position: { x: 80, y: 12.5 }, direction: 'right' },
    { id: 'DO:1', name: 'DO:1', pinType: 'output', position: { x: 80, y: 25 }, direction: 'right' },
    { id: 'DO:2', name: 'DO:2', pinType: 'output', position: { x: 80, y: 37.5 }, direction: 'right' },
    { id: 'DO:3', name: 'DO:3', pinType: 'output', position: { x: 80, y: 50 }, direction: 'right' },
    { id: 'DO:4', name: 'DO:4', pinType: 'output', position: { x: 80, y: 62.5 }, direction: 'right' },
    { id: 'DO:5', name: 'DO:5', pinType: 'output', position: { x: 80, y: 75 }, direction: 'right' },
    { id: 'DO:6', name: 'DO:6', pinType: 'output', position: { x: 80, y: 87.5 }, direction: 'right' },
    { id: 'DO:7', name: 'DO:7', pinType: 'output', position: { x: 80, y: 100 }, direction: 'right' },
    { id: 'DO:8', name: 'DO:8', pinType: 'output', position: { x: 80, y: 112.5 }, direction: 'right' },
    { id: 'DO:9', name: 'DO:9', pinType: 'output', position: { x: 80, y: 125 }, direction: 'right' },
    { id: 'DO:10', name: 'DO:10', pinType: 'output', position: { x: 80, y: 137.5 }, direction: 'right' },
    { id: 'DO:11', name: 'DO:11', pinType: 'output', position: { x: 80, y: 150 }, direction: 'right' },
    { id: 'DO:12', name: 'DO:12', pinType: 'output', position: { x: 80, y: 162.5 }, direction: 'right' },
    { id: 'DO:13', name: 'DO:13', pinType: 'output', position: { x: 80, y: 175 }, direction: 'right' },
    { id: 'DO:14', name: 'DO:14', pinType: 'output', position: { x: 80, y: 187.5 }, direction: 'right' },
    { id: 'DO:15', name: 'DO:15', pinType: 'output', position: { x: 80, y: 200 }, direction: 'right' },
  ],
  geometry: { width: 80, height: 200 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 80,0 L 80,200 L 0,200 Z', stroke: true },
    // Common connection line on left
    { d: 'M 0,100 L 10,100', stroke: true },
    // Channel tick marks on right side (16 ticks)
    { d: 'M 70,12.5 L 80,12.5 M 70,25 L 80,25 M 70,37.5 L 80,37.5 M 70,50 L 80,50 M 70,62.5 L 80,62.5 M 70,75 L 80,75 M 70,87.5 L 80,87.5 M 70,100 L 80,100 M 70,112.5 L 80,112.5 M 70,125 L 80,125 M 70,137.5 L 80,137.5 M 70,150 L 80,150 M 70,162.5 L 80,162.5 M 70,175 L 80,175 M 70,187.5 L 80,187.5 M 70,200 L 80,200', stroke: true },
  ],
  texts: [{ content: 'DO-16', x: 40, y: 10, fontSize: 10, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

const plcAI8Symbol: SymbolDefinition = {
  id: 'builtin-plc-ai-8',
  type: 'symbol-definition',
  name: 'PLC AI-8',
  category: 'plc-ai-8',
  pins: [
    // Left side: 8 analog inputs (AI:0 through AI:7)
    { id: 'AI:0', name: 'AI:0', pinType: 'input', position: { x: 0, y: 15 }, direction: 'left' },
    { id: 'AI:1', name: 'AI:1', pinType: 'input', position: { x: 0, y: 30 }, direction: 'left' },
    { id: 'AI:2', name: 'AI:2', pinType: 'input', position: { x: 0, y: 45 }, direction: 'left' },
    { id: 'AI:3', name: 'AI:3', pinType: 'input', position: { x: 0, y: 60 }, direction: 'left' },
    { id: 'AI:4', name: 'AI:4', pinType: 'input', position: { x: 0, y: 75 }, direction: 'left' },
    { id: 'AI:5', name: 'AI:5', pinType: 'input', position: { x: 0, y: 90 }, direction: 'left' },
    { id: 'AI:6', name: 'AI:6', pinType: 'input', position: { x: 0, y: 105 }, direction: 'left' },
    { id: 'AI:7', name: 'AI:7', pinType: 'input', position: { x: 0, y: 120 }, direction: 'left' },
    // Right side: common pin at center
    { id: 'COM', name: 'COM', pinType: 'passive', position: { x: 80, y: 60 }, direction: 'right' },
  ],
  geometry: { width: 80, height: 120 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 80,0 L 80,120 L 0,120 Z', stroke: true },
    // Channel tick marks on left side (8 ticks)
    { d: 'M 0,15 L 10,15 M 0,30 L 10,30 M 0,45 L 10,45 M 0,60 L 10,60 M 0,75 L 10,75 M 0,90 L 10,90 M 0,105 L 10,105 M 0,120 L 10,120', stroke: true },
    // Common connection line on right
    { d: 'M 70,60 L 80,60', stroke: true },
  ],
  texts: [{ content: 'AI-8', x: 40, y: 10, fontSize: 10, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

const plcAO4Symbol: SymbolDefinition = {
  id: 'builtin-plc-ao-4',
  type: 'symbol-definition',
  name: 'PLC AO-4',
  category: 'plc-ao-4',
  pins: [
    // Left side: common pin at center
    { id: 'COM', name: 'COM', pinType: 'passive', position: { x: 0, y: 40 }, direction: 'left' },
    // Right side: 4 analog outputs (AO:0 through AO:3)
    { id: 'AO:0', name: 'AO:0', pinType: 'output', position: { x: 80, y: 20 }, direction: 'right' },
    { id: 'AO:1', name: 'AO:1', pinType: 'output', position: { x: 80, y: 40 }, direction: 'right' },
    { id: 'AO:2', name: 'AO:2', pinType: 'output', position: { x: 80, y: 60 }, direction: 'right' },
    { id: 'AO:3', name: 'AO:3', pinType: 'output', position: { x: 80, y: 80 }, direction: 'right' },
  ],
  geometry: { width: 80, height: 80 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 80,0 L 80,80 L 0,80 Z', stroke: true },
    // Common connection line on left
    { d: 'M 0,40 L 10,40', stroke: true },
    // Channel tick marks on right side (4 ticks)
    { d: 'M 70,20 L 80,20 M 70,40 L 80,40 M 70,60 L 80,60 M 70,80 L 80,80', stroke: true },
  ],
  texts: [{ content: 'AO-4', x: 40, y: 10, fontSize: 10, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

const plcCPUSymbol: SymbolDefinition = {
  id: 'builtin-plc-cpu',
  type: 'symbol-definition',
  name: 'PLC CPU',
  category: 'plc-cpu',
  pins: [
    // Left side: communication port
    { id: 'COMM', name: 'COMM', pinType: 'passive', position: { x: 0, y: 50 }, direction: 'left' },
    // Right side: second communication port
    { id: 'COMM2', name: 'COMM2', pinType: 'passive', position: { x: 80, y: 50 }, direction: 'right' },
  ],
  geometry: { width: 80, height: 100 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 80,0 L 80,100 L 0,100 Z', stroke: true },
    // Communication port indicators
    { d: 'M 0,50 L 10,50', stroke: true },
    { d: 'M 70,50 L 80,50', stroke: true },
  ],
  texts: [{ content: 'CPU', x: 40, y: 50, fontSize: 14, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

const plcPowerSupplySymbol: SymbolDefinition = {
  id: 'builtin-plc-ps',
  type: 'symbol-definition',
  name: 'PLC Power Supply',
  category: 'plc-ps',
  pins: [
    // Left side: AC input
    { id: 'L', name: 'L', pinType: 'power', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'N', name: 'N', pinType: 'power', position: { x: 0, y: 60 }, direction: 'left' },
    // Right side: DC output
    { id: '+24V', name: '+24V', pinType: 'power', position: { x: 60, y: 20 }, direction: 'right' },
    { id: '0V', name: '0V', pinType: 'ground', position: { x: 60, y: 60 }, direction: 'right' },
  ],
  geometry: { width: 60, height: 80 },
  paths: [
    // Module rectangle
    { d: 'M 0,0 L 60,0 L 60,80 L 0,80 Z', stroke: true },
    // AC wave symbol on left (sine wave)
    { d: 'M 5,40 Q 10,30 15,40 Q 20,50 25,40', stroke: true },
    // DC symbols on right
    { d: 'M 35,20 L 45,20', stroke: true }, // + line
    { d: 'M 35,60 L 45,60', stroke: true }, // - line (ground)
  ],
  texts: [{ content: 'PS', x: 30, y: 10, fontSize: 10, fontWeight: 'bold' }],
  createdAt: 0,
  modifiedAt: 0,
};

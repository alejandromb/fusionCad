/**
 * Built-in IEC 60617 Symbol Definitions
 *
 * These define the metadata (dimensions, pins) for standard electrical symbols.
 * Drawing functions are registered separately in the renderer.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all built-in IEC symbol definitions.
 * Call this once at application startup.
 */
export function registerBuiltinSymbols(): void {
  registerSymbol(contactorSymbol);
  registerSymbol(buttonSymbol);
  registerSymbol(overloadSymbol);
  registerSymbol(motorSymbol);
  registerSymbol(terminalSymbol);
  registerSymbol(powerSupplySymbol);
}

const contactorSymbol: SymbolDefinition = {
  id: 'builtin-contactor',
  type: 'symbol-definition',
  name: 'Contactor',
  category: 'contactor',
  pins: [
    { id: 'A1', name: 'A1', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'A2', name: 'A2', pinType: 'passive', position: { x: 0, y: 60 }, direction: 'left' },
    { id: '1', name: '1', pinType: 'passive', position: { x: 60, y: 10 }, direction: 'right' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 60, y: 30 }, direction: 'right' },
    { id: '3', name: '3', pinType: 'passive', position: { x: 60, y: 40 }, direction: 'right' },
    { id: '4', name: '4', pinType: 'passive', position: { x: 60, y: 50 }, direction: 'right' },
    { id: '5', name: '5', pinType: 'passive', position: { x: 60, y: 60 }, direction: 'right' },
    { id: '6', name: '6', pinType: 'passive', position: { x: 60, y: 70 }, direction: 'right' },
    { id: '13', name: '13', pinType: 'passive', position: { x: 30, y: 0 }, direction: 'top' },
    { id: '14', name: '14', pinType: 'passive', position: { x: 30, y: 80 }, direction: 'bottom' },
  ],
  geometry: { width: 60, height: 80 },
  createdAt: 0,
  modifiedAt: 0,
};

const buttonSymbol: SymbolDefinition = {
  id: 'builtin-button',
  type: 'symbol-definition',
  name: 'Pushbutton',
  category: 'button',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  createdAt: 0,
  modifiedAt: 0,
};

const overloadSymbol: SymbolDefinition = {
  id: 'builtin-overload',
  type: 'symbol-definition',
  name: 'Overload Relay',
  category: 'overload',
  pins: [
    { id: '95', name: '95', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: '96', name: '96', pinType: 'passive', position: { x: 0, y: 40 }, direction: 'left' },
  ],
  geometry: { width: 50, height: 60 },
  createdAt: 0,
  modifiedAt: 0,
};

const motorSymbol: SymbolDefinition = {
  id: 'builtin-motor',
  type: 'symbol-definition',
  name: 'Motor',
  category: 'motor',
  pins: [
    { id: 'U', name: 'U', pinType: 'power', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'V', name: 'V', pinType: 'power', position: { x: 30, y: 0 }, direction: 'top' },
    { id: 'W', name: 'W', pinType: 'power', position: { x: 50, y: 0 }, direction: 'top' },
  ],
  geometry: { width: 60, height: 60 },
  createdAt: 0,
  modifiedAt: 0,
};

const terminalSymbol: SymbolDefinition = {
  id: 'builtin-terminal',
  type: 'symbol-definition',
  name: 'Terminal Strip',
  category: 'terminal',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 30, y: 0 }, direction: 'top' },
    { id: '3', name: '3', pinType: 'passive', position: { x: 50, y: 0 }, direction: 'top' },
    { id: '4', name: '4', pinType: 'passive', position: { x: 70, y: 0 }, direction: 'top' },
    { id: '5', name: '5', pinType: 'passive', position: { x: 90, y: 0 }, direction: 'top' },
  ],
  geometry: { width: 100, height: 100 },
  createdAt: 0,
  modifiedAt: 0,
};

const powerSupplySymbol: SymbolDefinition = {
  id: 'builtin-power-supply',
  type: 'symbol-definition',
  name: 'Power Supply',
  category: 'power-supply',
  pins: [
    { id: '+', name: '+', pinType: 'power', position: { x: 50, y: 20 }, direction: 'right' },
    { id: '-', name: '-', pinType: 'ground', position: { x: 50, y: 40 }, direction: 'right' },
  ],
  geometry: { width: 50, height: 60 },
  createdAt: 0,
  modifiedAt: 0,
};

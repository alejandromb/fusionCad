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
  paths: [
    // Coil rectangle (left side)
    { d: 'M 5,15 L 25,15 L 25,65 L 5,65 Z', stroke: true },
    // Contact line (right side)
    { d: 'M 45,10 L 45,70', stroke: true },
    // Contact bars
    { d: 'M 37,13 L 53,13 M 37,23 L 53,23 M 37,33 L 53,33 M 37,43 L 53,43 M 37,53 L 53,53 M 37,63 L 53,63', stroke: true },
    // Aux contact box (top)
    { d: 'M 22,2 L 38,2 L 38,10 L 22,10 Z', stroke: true },
  ],
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
  paths: [
    // Circle around center (radius 15)
    { d: 'M 20,5 A 15,15 0 1,1 19.99,5 Z', stroke: true },
    // Contact line (horizontal)
    { d: 'M 5,20 L 35,20', stroke: true },
    // Actuator (angled line above)
    { d: 'M 12,10 L 28,15', stroke: true },
  ],
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
  paths: [
    // Bounding rectangle
    { d: 'M 5,5 L 45,5 L 45,55 L 5,55 Z', stroke: true },
    // Thermal element (zigzag)
    { d: 'M 15,10 L 35,10 L 15,20 L 35,20 L 15,30 L 35,30 L 15,40 L 35,40 L 15,50 L 35,50', stroke: true },
  ],
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
  // SVG paths: circle centered at (30,30) with radius 25
  paths: [
    { d: 'M 30,5 A 25,25 0 1,1 29.99,5 Z', stroke: true, fill: false, strokeWidth: 2 },
  ],
  texts: [{ content: 'M', x: 30, y: 30, fontSize: 20, fontWeight: 'bold' }],
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
  paths: [
    // Base rectangle
    { d: 'M 0,0 L 100,0 L 100,100 L 0,100 Z', stroke: true },
    // Terminal vertical bars (5 terminals, evenly spaced)
    { d: 'M 10,0 L 10,15 M 30,0 L 30,15 M 50,0 L 50,15 M 70,0 L 70,15 M 90,0 L 90,15', stroke: true },
    // Terminal screws (small circles at y=10)
    { d: 'M 10,7 A 3,3 0 1,1 9.99,7 Z', stroke: true },
    { d: 'M 30,7 A 3,3 0 1,1 29.99,7 Z', stroke: true },
    { d: 'M 50,7 A 3,3 0 1,1 49.99,7 Z', stroke: true },
    { d: 'M 70,7 A 3,3 0 1,1 69.99,7 Z', stroke: true },
    { d: 'M 90,7 A 3,3 0 1,1 89.99,7 Z', stroke: true },
  ],
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
  paths: [
    // Rectangle
    { d: 'M 0,0 L 50,0 L 50,60 L 0,60 Z', stroke: true },
    // AC wave on left (sine wave using quadratic beziers)
    { d: 'M 10,30 Q 15,20 20,30 Q 25,40 30,30', stroke: true },
  ],
  texts: [
    { content: '+', x: 40, y: 20, fontSize: 16, fontWeight: 'bold' },
    { content: '-', x: 40, y: 40, fontSize: 16, fontWeight: 'bold' },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

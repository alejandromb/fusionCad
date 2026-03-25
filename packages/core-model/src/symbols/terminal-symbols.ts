/**
 * Terminal Block Symbol Definitions — Hexagon-based IEC standard terminals
 *
 * All terminals use a symmetric regular hexagon shape that looks
 * identical when rotated. Multi-level terminals (dual, triple) are
 * built by placing multiple single-terminal devices linked by terminalId.
 *
 * Hexagon (30w × 28h, centered at 15,14):
 *   Top vertex, upper-right, lower-right, bottom vertex, lower-left, upper-left
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all terminal block symbol definitions.
 *
 * NOTE: Multi-level terminals use the single-terminal symbol per level.
 * Each level is a separate Device linked by terminalId for BOM grouping.
 */
export function registerTerminalSymbols(): void {
  registerSymbol(singleTerminalSymbol);
  registerSymbol(fuseTerminalSymbol);
  registerSymbol(groundTerminalSymbol);
  registerSymbol(disconnectTerminalSymbol);
}

// Regular hexagon vertices for a 20w × 34h bounding box
// Hexagon body from y=5 to y=29 (height=24), side=12, half-width = 12×cos(30°) = 10.4
const hexPoints = [
  { x: 10, y: 5 },
  { x: 20.4, y: 11 },
  { x: 20.4, y: 23 },
  { x: 10, y: 29 },
  { x: -0.4, y: 23 },
  { x: -0.4, y: 11 },
];

const hexPath = `M ${hexPoints.map(p => `${p.x},${p.y}`).join(' L ')} Z`;

const singleTerminalSymbol: SymbolDefinition = {
  id: 'builtin-single-terminal',
  type: 'symbol-definition',
  name: 'Single Terminal',
  category: 'single-terminal',
  pins: [
    { id: 't', name: 'top', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b', name: 'bottom', pinType: 'passive', position: { x: 10, y: 34 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 34 },
  paths: [
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: hexPath, stroke: true, strokeWidth: 2 },
    { d: 'M 3,17 L 17,17', stroke: true, strokeWidth: 1 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const fuseTerminalSymbol: SymbolDefinition = {
  id: 'builtin-fuse-terminal',
  type: 'symbol-definition',
  name: 'Fuse Terminal',
  category: 'fuse-terminal',
  pins: [
    { id: 't', name: 'top', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b', name: 'bottom', pinType: 'passive', position: { x: 10, y: 34 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 34 },
  paths: [
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: hexPath, stroke: true, strokeWidth: 2 },
    // Fuse element (small rectangle inside)
    { d: 'M 6,14 L 14,14 L 14,20 L 6,20 Z', stroke: true, strokeWidth: 1.5 },
    { d: 'M 6,17 L 14,17', stroke: true, strokeWidth: 1 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const groundTerminalSymbol: SymbolDefinition = {
  id: 'builtin-ground-terminal',
  type: 'symbol-definition',
  name: 'Ground Terminal',
  category: 'ground-terminal',
  pins: [
    { id: 't', name: 'top', pinType: 'pe', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b', name: 'bottom', pinType: 'pe', position: { x: 10, y: 34 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 34 },
  paths: [
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: hexPath, stroke: true, strokeWidth: 2 },
    // PE ground symbol (three decreasing lines)
    { d: 'M 4,14 L 16,14', stroke: true, strokeWidth: 2 },
    { d: 'M 6,18 L 14,18', stroke: true, strokeWidth: 1.5 },
    { d: 'M 8,22 L 12,22', stroke: true, strokeWidth: 1 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const disconnectTerminalSymbol: SymbolDefinition = {
  id: 'builtin-disconnect-terminal',
  type: 'symbol-definition',
  name: 'Disconnect Terminal',
  category: 'disconnect-terminal',
  pins: [
    { id: 't', name: 'top', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b', name: 'bottom', pinType: 'passive', position: { x: 10, y: 34 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 34 },
  paths: [
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: hexPath, stroke: true, strokeWidth: 2 },
    // Knife switch element
    { d: 'M 10,12 L 10,15', stroke: true, strokeWidth: 2 },
    { d: 'M 10,15 L 14,22', stroke: true, strokeWidth: 2 },
    { d: 'M 10,24 L 10,26', stroke: true, strokeWidth: 2 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

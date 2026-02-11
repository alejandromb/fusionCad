/**
 * Terminal Block Symbol Definitions — Octagon-based IEC standard terminals
 *
 * Real-world terminal anatomy:
 * - Single-level: 1 octagon (20×24px), 2 pins (top/bottom)
 * - Dual-level: 2 octagons stacked (20×48px), 4 pins
 * - Triple-level: 3 octagons stacked (20×72px), 6 pins
 * - Fuse terminal: Octagon with fuse element inside
 * - Ground terminal: Octagon with PE ground symbol
 * - Disconnect terminal: Octagon with knife switch element
 *
 * Octagon path (20px wide, 24px tall):
 *   M 5,0 L 15,0 L 20,5 L 20,19 L 15,24 L 5,24 L 0,19 L 0,5 Z
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all terminal block symbol definitions.
 * Call this once at application startup.
 *
 * NOTE: Dual and triple terminal PARTS exist, but they use the single-terminal SYMBOL.
 * Each level of a multi-level terminal is a separate Device instance that can be
 * positioned independently. They share a terminalId to link them for BOM grouping.
 */
export function registerTerminalSymbols(): void {
  registerSymbol(singleTerminalSymbol);
  // Dual/triple terminals use single-terminal symbol - each level is a separate device
  // registerSymbol(dualTerminalSymbol);  // DEPRECATED: use single-terminal per level
  // registerSymbol(tripleTerminalSymbol); // DEPRECATED: use single-terminal per level
  registerSymbol(fuseTerminalSymbol);
  registerSymbol(groundTerminalSymbol);
  registerSymbol(disconnectTerminalSymbol);
}

// Base octagon path helper (20w × 24h, placed at yOffset)
function octagonPath(yOffset: number): string {
  const y = yOffset;
  return `M 5,${y} L 15,${y} L 20,${y + 5} L 20,${y + 19} L 15,${y + 24} L 5,${y + 24} L 0,${y + 19} L 0,${y + 5} Z`;
}

// Internal connection bridge within octagon (horizontal line at center)
function bridgePath(yOffset: number): string {
  const cy = yOffset + 12;
  return `M 3,${cy} L 17,${cy}`;
}

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
    // Connection line from top pin to octagon
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    // Octagon body
    { d: octagonPath(5), stroke: true, strokeWidth: 2 },
    // Internal bridge (connection through terminal)
    { d: bridgePath(5), stroke: true, strokeWidth: 1 },
    // Connection line from octagon to bottom pin
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const dualTerminalSymbol: SymbolDefinition = {
  id: 'builtin-dual-terminal',
  type: 'symbol-definition',
  name: 'Dual Terminal',
  category: 'dual-terminal',
  pins: [
    { id: 't1', name: 'L1-top', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b1', name: 'L1-bot', pinType: 'passive', position: { x: 10, y: 34 }, direction: 'bottom' },
    { id: 't2', name: 'L2-top', pinType: 'passive', position: { x: 10, y: 38 }, direction: 'top' },
    { id: 'b2', name: 'L2-bot', pinType: 'passive', position: { x: 10, y: 72 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 72 },
  paths: [
    // Level 1: top
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: octagonPath(5), stroke: true, strokeWidth: 2 },
    { d: bridgePath(5), stroke: true, strokeWidth: 1 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
    // Separator between levels
    { d: 'M 0,36 L 20,36', stroke: true, strokeWidth: 1 },
    // Level 2: bottom
    { d: 'M 10,38 L 10,43', stroke: true, strokeWidth: 2 },
    { d: octagonPath(43), stroke: true, strokeWidth: 2 },
    { d: bridgePath(43), stroke: true, strokeWidth: 1 },
    { d: 'M 10,67 L 10,72', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const tripleTerminalSymbol: SymbolDefinition = {
  id: 'builtin-triple-terminal',
  type: 'symbol-definition',
  name: 'Triple Terminal',
  category: 'triple-terminal',
  pins: [
    { id: 't1', name: 'L1-top', pinType: 'passive', position: { x: 10, y: 0 }, direction: 'top' },
    { id: 'b1', name: 'L1-bot', pinType: 'passive', position: { x: 10, y: 34 }, direction: 'bottom' },
    { id: 't2', name: 'L2-top', pinType: 'passive', position: { x: 10, y: 38 }, direction: 'top' },
    { id: 'b2', name: 'L2-bot', pinType: 'passive', position: { x: 10, y: 72 }, direction: 'bottom' },
    { id: 't3', name: 'L3-top', pinType: 'passive', position: { x: 10, y: 76 }, direction: 'top' },
    { id: 'b3', name: 'L3-bot', pinType: 'passive', position: { x: 10, y: 110 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 110 },
  paths: [
    // Level 1
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    { d: octagonPath(5), stroke: true, strokeWidth: 2 },
    { d: bridgePath(5), stroke: true, strokeWidth: 1 },
    { d: 'M 10,29 L 10,34', stroke: true, strokeWidth: 2 },
    // Separator
    { d: 'M 0,36 L 20,36', stroke: true, strokeWidth: 1 },
    // Level 2
    { d: 'M 10,38 L 10,43', stroke: true, strokeWidth: 2 },
    { d: octagonPath(43), stroke: true, strokeWidth: 2 },
    { d: bridgePath(43), stroke: true, strokeWidth: 1 },
    { d: 'M 10,67 L 10,72', stroke: true, strokeWidth: 2 },
    // Separator
    { d: 'M 0,74 L 20,74', stroke: true, strokeWidth: 1 },
    // Level 3
    { d: 'M 10,76 L 10,81', stroke: true, strokeWidth: 2 },
    { d: octagonPath(81), stroke: true, strokeWidth: 2 },
    { d: bridgePath(81), stroke: true, strokeWidth: 1 },
    { d: 'M 10,105 L 10,110', stroke: true, strokeWidth: 2 },
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
    { id: 'b', name: 'bottom', pinType: 'passive', position: { x: 10, y: 40 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 40 },
  paths: [
    // Connection line from top pin
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    // Octagon body (taller to fit fuse)
    { d: 'M 5,5 L 15,5 L 20,10 L 20,30 L 15,35 L 5,35 L 0,30 L 0,10 Z', stroke: true, strokeWidth: 2 },
    // Fuse element (S-curve inside octagon)
    { d: 'M 10,10 Q 6,15 10,20 Q 14,25 10,30', stroke: true, strokeWidth: 1.5 },
    // Connection line to bottom pin
    { d: 'M 10,35 L 10,40', stroke: true, strokeWidth: 2 },
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
    { id: 'b', name: 'bottom', pinType: 'pe', position: { x: 10, y: 40 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 40 },
  paths: [
    // Connection line from top pin
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    // Octagon body
    { d: 'M 5,5 L 15,5 L 20,10 L 20,30 L 15,35 L 5,35 L 0,30 L 0,10 Z', stroke: true, strokeWidth: 2 },
    // PE ground symbol inside octagon (three decreasing horizontal lines)
    { d: 'M 4,16 L 16,16', stroke: true, strokeWidth: 2 },
    { d: 'M 6,21 L 14,21', stroke: true, strokeWidth: 1.5 },
    { d: 'M 8,26 L 12,26', stroke: true, strokeWidth: 1 },
    // Connection line to bottom pin
    { d: 'M 10,35 L 10,40', stroke: true, strokeWidth: 2 },
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
    { id: 'b', name: 'bottom', pinType: 'passive', position: { x: 10, y: 40 }, direction: 'bottom' },
  ],
  geometry: { width: 20, height: 40 },
  paths: [
    // Connection line from top pin
    { d: 'M 10,0 L 10,5', stroke: true, strokeWidth: 2 },
    // Octagon body
    { d: 'M 5,5 L 15,5 L 20,10 L 20,30 L 15,35 L 5,35 L 0,30 L 0,10 Z', stroke: true, strokeWidth: 2 },
    // Knife switch element inside (angled line indicating disconnectable)
    { d: 'M 10,12 L 10,17', stroke: true, strokeWidth: 2 },
    { d: 'M 10,17 L 15,25', stroke: true, strokeWidth: 2 },
    { d: 'M 10,28 L 10,30', stroke: true, strokeWidth: 2 },
    // Small gap indicator dots
    { d: 'M 9,27 A 1,1 0 1,1 8.99,27 Z', stroke: true, strokeWidth: 1 },
    // Connection line to bottom pin
    { d: 'M 10,35 L 10,40', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

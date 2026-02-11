/**
 * Field Device Symbol Definitions
 *
 * Level switches, pressure/flow transmitters, valves, and solenoids.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all field device symbol definitions.
 * Call this once at application startup.
 */
export function registerFieldDeviceSymbols(): void {
  registerSymbol(levelSwitchSymbol);
  registerSymbol(pressureTransmitterSymbol);
  registerSymbol(flowMeterSymbol);
  registerSymbol(valveSymbol);
  registerSymbol(solenoidSymbol);
}

const levelSwitchSymbol: SymbolDefinition = {
  id: 'builtin-level-switch',
  type: 'symbol-definition',
  name: 'Level Switch',
  category: 'level-switch',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Instrument bubble circle (ISA standard)
    { d: 'M 20,0 A 20,20 0 1,1 19.99,0 Z', stroke: true, strokeWidth: 2 },
    // Horizontal divider line through center (ISA instrument designation)
    { d: 'M 2,20 L 38,20', stroke: true, strokeWidth: 1 },
  ],
  texts: [
    { content: 'L', x: 20, y: 14, fontSize: 12, fontWeight: 'bold' },
    { content: 'S', x: 20, y: 32, fontSize: 10, fontWeight: 'normal' },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const pressureTransmitterSymbol: SymbolDefinition = {
  id: 'builtin-pressure-xmtr',
  type: 'symbol-definition',
  name: 'Pressure Transmitter',
  category: 'pressure-xmtr',
  pins: [
    { id: '+', name: '+', pinType: 'input', position: { x: 0, y: 12 }, direction: 'left' },
    { id: '-', name: '-', pinType: 'input', position: { x: 0, y: 28 }, direction: 'left' },
    { id: 'out', name: 'out', pinType: 'output', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Instrument bubble circle (ISA standard)
    { d: 'M 20,0 A 20,20 0 1,1 19.99,0 Z', stroke: true, strokeWidth: 2 },
    // Horizontal divider line through center (ISA instrument designation)
    { d: 'M 2,20 L 38,20', stroke: true, strokeWidth: 1 },
  ],
  texts: [
    { content: 'P', x: 20, y: 14, fontSize: 12, fontWeight: 'bold' },
    { content: 'T', x: 20, y: 32, fontSize: 10, fontWeight: 'normal' },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const flowMeterSymbol: SymbolDefinition = {
  id: 'builtin-flow-meter',
  type: 'symbol-definition',
  name: 'Flow Meter',
  category: 'flow-meter',
  pins: [
    { id: '+', name: '+', pinType: 'passive', position: { x: 0, y: 12 }, direction: 'left' },
    { id: '-', name: '-', pinType: 'passive', position: { x: 0, y: 28 }, direction: 'left' },
    { id: 'out', name: 'out', pinType: 'output', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Instrument bubble circle (ISA standard)
    { d: 'M 20,0 A 20,20 0 1,1 19.99,0 Z', stroke: true, strokeWidth: 2 },
    // Horizontal divider line through center (ISA instrument designation)
    { d: 'M 2,20 L 38,20', stroke: true, strokeWidth: 1 },
  ],
  texts: [
    { content: 'F', x: 20, y: 14, fontSize: 12, fontWeight: 'bold' },
    { content: 'T', x: 20, y: 32, fontSize: 10, fontWeight: 'normal' },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const valveSymbol: SymbolDefinition = {
  id: 'builtin-valve',
  type: 'symbol-definition',
  name: 'Valve',
  category: 'valve',
  pins: [
    { id: 'cmd', name: 'cmd', pinType: 'input', position: { x: 20, y: 0 }, direction: 'top' },
    { id: 'pipe1', name: 'pipe1', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: 'pipe2', name: 'pipe2', pinType: 'passive', position: { x: 40, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Left triangle (bowtie left half)
    { d: 'M 0,10 L 20,20 L 0,30 Z', stroke: true, fill: false, strokeWidth: 2 },
    // Right triangle (bowtie right half)
    { d: 'M 40,10 L 20,20 L 40,30 Z', stroke: true, fill: false, strokeWidth: 2 },
    // Control stem from actuator to valve body
    { d: 'M 20,0 L 20,10', stroke: true, strokeWidth: 1.5 },
    // Horizontal bar at top of valve body (stem seat)
    { d: 'M 16,10 L 24,10', stroke: true, strokeWidth: 1.5 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const solenoidSymbol: SymbolDefinition = {
  id: 'builtin-solenoid',
  type: 'symbol-definition',
  name: 'Solenoid',
  category: 'solenoid',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 0, y: 15 }, direction: 'left' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 40, y: 15 }, direction: 'right' },
  ],
  geometry: { width: 40, height: 30 },
  paths: [
    // Solenoid body rectangle
    { d: 'M 5,5 L 35,5 L 35,25 L 5,25 Z', stroke: true, strokeWidth: 2 },
    // Coil windings (semicircular arcs representing inductor/solenoid coil)
    { d: 'M 10,15 A 3,5 0 0,1 16,15 A 3,5 0 0,1 22,15 A 3,5 0 0,1 28,15 A 3,5 0 0,1 34,15', stroke: true, strokeWidth: 1.5 },
    // Plunger indicator (arrow showing actuation direction)
    { d: 'M 20,8 L 20,22', stroke: true, strokeWidth: 1 },
    { d: 'M 18,20 L 20,22 L 22,20', stroke: true, strokeWidth: 1 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

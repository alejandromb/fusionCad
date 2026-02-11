/**
 * Relay Symbol Definitions
 *
 * Relay coils, contacts (NO/NC), and timer relays.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all relay symbol definitions.
 * Call this once at application startup.
 */
export function registerRelaySymbols(): void {
  registerSymbol(relayCoilSymbol);
  registerSymbol(relayContactNOSymbol);
  registerSymbol(relayContactNCSymbol);
  registerSymbol(timerRelaySymbol);
}

/**
 * Relay Coil (IEC 60617)
 *
 * IEC standard relay coil: clean rectangle with parentheses ( ) inside
 * representing an electromagnetic coil. Terminals A1 (top) and A2 (bottom).
 */
const relayCoilSymbol: SymbolDefinition = {
  id: 'builtin-relay-coil',
  type: 'symbol-definition',
  name: 'Relay Coil',
  category: 'relay-coil',
  pins: [
    { id: 'A1', name: 'A1', pinType: 'passive', position: { x: 20, y: 0 }, direction: 'top' },
    { id: 'A2', name: 'A2', pinType: 'passive', position: { x: 20, y: 40 }, direction: 'bottom' },
  ],
  geometry: { width: 40, height: 40 },
  paths: [
    // Coil body rectangle (IEC standard - clean, proportional)
    { d: 'M 5,6 L 35,6 L 35,34 L 5,34 Z', stroke: true, strokeWidth: 2 },
    // Left parenthesis arc (IEC electromagnetic coil indicator)
    { d: 'M 13,11 C 8,16 8,24 13,29', stroke: true, strokeWidth: 1.5 },
    // Right parenthesis arc
    { d: 'M 27,11 C 32,16 32,24 27,29', stroke: true, strokeWidth: 1.5 },
    // Top connection line
    { d: 'M 20,0 L 20,6', stroke: true, strokeWidth: 2 },
    // Bottom connection line
    { d: 'M 20,34 L 20,40', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

/**
 * Relay Contact NO (IEC 60617)
 *
 * IEC standard normally-open contact: two stationary contacts (vertical bars)
 * with movable bridge shown in open position (angled away from right contact).
 * The bridge is hinged from the left contact.
 */
const relayContactNOSymbol: SymbolDefinition = {
  id: 'builtin-relay-contact-no',
  type: 'symbol-definition',
  name: 'Relay Contact NO',
  category: 'relay-contact-no',
  pins: [
    { id: '3', name: '3', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: '4', name: '4', pinType: 'passive', position: { x: 50, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 50, height: 35 },
  paths: [
    // Left lead-in wire
    { d: 'M 0,20 L 15,20', stroke: true, strokeWidth: 2 },
    // Left stationary contact (vertical bar)
    { d: 'M 15,12 L 15,28', stroke: true, strokeWidth: 2 },
    // Right lead-in wire
    { d: 'M 35,20 L 50,20', stroke: true, strokeWidth: 2 },
    // Right stationary contact (vertical bar)
    { d: 'M 35,12 L 35,28', stroke: true, strokeWidth: 2 },
    // Movable bridge (NO = open, hinged from left, angled upward)
    { d: 'M 15,12 L 33,5', stroke: true, strokeWidth: 2 },
    // Hinge point indicator (small filled circle at left contact top)
    { d: 'M 17,12 A 2,2 0 1,1 16.99,12 Z', stroke: true, fill: true, strokeWidth: 1 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

/**
 * Relay Contact NC (IEC 60617)
 *
 * IEC standard normally-closed contact: two stationary contacts (vertical bars)
 * with movable bridge in closed position (touching both contacts).
 * Includes NC indicator bar crossing the bridge.
 */
const relayContactNCSymbol: SymbolDefinition = {
  id: 'builtin-relay-contact-nc',
  type: 'symbol-definition',
  name: 'Relay Contact NC',
  category: 'relay-contact-nc',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 0, y: 20 }, direction: 'left' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 50, y: 20 }, direction: 'right' },
  ],
  geometry: { width: 50, height: 35 },
  paths: [
    // Left lead-in wire
    { d: 'M 0,20 L 15,20', stroke: true, strokeWidth: 2 },
    // Left stationary contact (vertical bar)
    { d: 'M 15,12 L 15,28', stroke: true, strokeWidth: 2 },
    // Right lead-in wire
    { d: 'M 35,20 L 50,20', stroke: true, strokeWidth: 2 },
    // Right stationary contact (vertical bar)
    { d: 'M 35,12 L 35,28', stroke: true, strokeWidth: 2 },
    // Movable bridge (NC = closed, horizontal touching both contacts)
    { d: 'M 15,12 L 35,12', stroke: true, strokeWidth: 2 },
    // NC indicator: vertical bar crossing the bridge
    { d: 'M 25,4 L 25,12', stroke: true, strokeWidth: 1.5 },
    // NC indicator: horizontal bar at top (T-shape)
    { d: 'M 21,4 L 29,4', stroke: true, strokeWidth: 1.5 },
    // Hinge point indicator (small filled circle at left contact top)
    { d: 'M 17,12 A 2,2 0 1,1 16.99,12 Z', stroke: true, fill: true, strokeWidth: 1 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

/**
 * Timer Relay (IEC 60617)
 *
 * IEC standard timer relay: rectangular body with clock symbol inside.
 * Coil terminals A1/A2, contact terminals 15/16/18 (typical timer relay).
 */
const timerRelaySymbol: SymbolDefinition = {
  id: 'builtin-timer-relay',
  type: 'symbol-definition',
  name: 'Timer Relay',
  category: 'timer-relay',
  pins: [
    { id: 'A1', name: 'A1', pinType: 'passive', position: { x: 25, y: 0 }, direction: 'top' },
    { id: 'A2', name: 'A2', pinType: 'passive', position: { x: 25, y: 50 }, direction: 'bottom' },
  ],
  geometry: { width: 50, height: 50 },
  paths: [
    // Main body rectangle (coil body like relay)
    { d: 'M 5,6 L 45,6 L 45,44 L 5,44 Z', stroke: true, strokeWidth: 2 },
    // Left parenthesis arc (coil indicator)
    { d: 'M 12,12 C 7,18 7,32 12,38', stroke: true, strokeWidth: 1.5 },
    // Right parenthesis arc
    { d: 'M 38,12 C 43,18 43,32 38,38', stroke: true, strokeWidth: 1.5 },
    // Clock face circle (centered, timer indicator)
    { d: 'M 25,25 A 8,8 0 1,1 24.99,25 Z', stroke: true, strokeWidth: 1 },
    // Clock hour hand
    { d: 'M 25,25 L 25,19', stroke: true, strokeWidth: 1 },
    // Clock minute hand
    { d: 'M 25,25 L 29,22', stroke: true, strokeWidth: 1 },
    // Center dot
    { d: 'M 26,25 A 1,1 0 1,1 25.99,25 Z', stroke: true, fill: true, strokeWidth: 0.5 },
    // Top connection line
    { d: 'M 25,0 L 25,6', stroke: true, strokeWidth: 2 },
    // Bottom connection line
    { d: 'M 25,44 L 25,50', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

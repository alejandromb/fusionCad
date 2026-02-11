/**
 * Power Distribution Symbol Definitions
 *
 * Circuit breakers, fuses, transformers, and disconnects for electrical distribution.
 */

import type { SymbolDefinition } from '../types.js';
import { registerSymbol } from '../symbol-library.js';

/**
 * Register all power distribution symbol definitions.
 * Call this once at application startup.
 */
export function registerPowerSymbols(): void {
  registerSymbol(circuitBreakerSymbol);
  registerSymbol(fuseSymbol);
  registerSymbol(transformerSymbol);
  registerSymbol(disconnectSymbol);
}

/**
 * Circuit Breaker (IEC 60617)
 *
 * IEC standard circuit breaker: hinged contact arm shown in open position,
 * with trip mechanism box containing X (thermal/magnetic trip indicator).
 * Clean vertical layout with proper contact points.
 */
const circuitBreakerSymbol: SymbolDefinition = {
  id: 'builtin-circuit-breaker',
  type: 'symbol-definition',
  name: 'Circuit Breaker',
  category: 'circuit-breaker',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 25, y: 0 }, direction: 'top' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 25, y: 70 }, direction: 'bottom' },
  ],
  geometry: { width: 50, height: 70 },
  paths: [
    // Top connection line to hinge point
    { d: 'M 25,0 L 25,15', stroke: true, strokeWidth: 2 },
    // Hinge point (pivot of the contact arm)
    { d: 'M 27,15 A 2,2 0 1,1 26.99,15 Z', stroke: true, fill: true, strokeWidth: 1 },
    // Contact arm (open position, angled away)
    { d: 'M 25,15 L 35,38', stroke: true, strokeWidth: 2 },
    // Contact arm end (arrowhead showing movement direction)
    { d: 'M 35,38 L 32,36 M 35,38 L 36,35', stroke: true, strokeWidth: 1.5 },
    // Bottom stationary contact point
    { d: 'M 27,45 A 2,2 0 1,1 26.99,45 Z', stroke: true, fill: true, strokeWidth: 1 },
    // Bottom connection line
    { d: 'M 25,45 L 25,70', stroke: true, strokeWidth: 2 },
    // Trip mechanism box (IEC standard thermal/magnetic trip)
    { d: 'M 8,25 L 42,25 L 42,42 L 8,42 Z', stroke: true, strokeWidth: 1.5 },
    // X inside trip mechanism box (thermal/magnetic indicator)
    { d: 'M 12,28 L 38,39 M 38,28 L 12,39', stroke: true, strokeWidth: 1 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const fuseSymbol: SymbolDefinition = {
  id: 'builtin-fuse',
  type: 'symbol-definition',
  name: 'Fuse',
  category: 'fuse',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 15, y: 0 }, direction: 'top' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 15, y: 50 }, direction: 'bottom' },
  ],
  geometry: { width: 30, height: 50 },
  paths: [
    // Top connection line
    { d: 'M 15,0 L 15,10', stroke: true, strokeWidth: 2 },
    // Fuse body (rectangle per IEC)
    { d: 'M 5,10 L 25,10 L 25,40 L 5,40 Z', stroke: true, strokeWidth: 2 },
    // Fusible element line through center (straight thin line = IEC fuse element)
    { d: 'M 15,10 L 15,40', stroke: true, strokeWidth: 1 },
    // Bottom connection line
    { d: 'M 15,40 L 15,50', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const transformerSymbol: SymbolDefinition = {
  id: 'builtin-transformer',
  type: 'symbol-definition',
  name: 'Transformer',
  category: 'transformer',
  pins: [
    { id: 'H1', name: 'H1', pinType: 'passive', position: { x: 0, y: 15 }, direction: 'left' },
    { id: 'H2', name: 'H2', pinType: 'passive', position: { x: 0, y: 45 }, direction: 'left' },
    { id: 'X1', name: 'X1', pinType: 'passive', position: { x: 60, y: 15 }, direction: 'right' },
    { id: 'X2', name: 'X2', pinType: 'passive', position: { x: 60, y: 45 }, direction: 'right' },
  ],
  geometry: { width: 60, height: 60 },
  paths: [
    // Primary winding (left side) - 4 semicircular arcs (bumps facing right)
    { d: 'M 15,12 A 5,4 0 0,1 15,20 A 5,4 0 0,1 15,28 A 5,4 0 0,1 15,36 A 5,4 0 0,1 15,44', stroke: true, strokeWidth: 2 },
    // Secondary winding (right side) - 4 semicircular arcs (bumps facing left)
    { d: 'M 45,12 A 5,4 0 0,0 45,20 A 5,4 0 0,0 45,28 A 5,4 0 0,0 45,36 A 5,4 0 0,0 45,44', stroke: true, strokeWidth: 2 },
    // Core lines (two vertical parallel lines between coils)
    { d: 'M 27,8 L 27,52 M 33,8 L 33,52', stroke: true, strokeWidth: 1.5 },
    // Connection leads - primary side
    { d: 'M 0,15 L 15,15 M 0,45 L 15,45', stroke: true, strokeWidth: 1.5 },
    // Connection leads - secondary side
    { d: 'M 45,15 L 60,15 M 45,45 L 60,45', stroke: true, strokeWidth: 1.5 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

const disconnectSymbol: SymbolDefinition = {
  id: 'builtin-disconnect',
  type: 'symbol-definition',
  name: 'Disconnect',
  category: 'disconnect',
  pins: [
    { id: '1', name: '1', pinType: 'passive', position: { x: 20, y: 0 }, direction: 'top' },
    { id: '2', name: '2', pinType: 'passive', position: { x: 20, y: 50 }, direction: 'bottom' },
  ],
  geometry: { width: 40, height: 50 },
  paths: [
    // Top connection line (from pin to hinge point)
    { d: 'M 20,0 L 20,15', stroke: true, strokeWidth: 2 },
    // Top contact / hinge point (filled dot)
    { d: 'M 22,15 A 2,2 0 1,1 21.99,15 Z', stroke: true, fill: true },
    // Hinged contact arm (angled open, single-pole switch per IEC)
    { d: 'M 20,15 L 30,32', stroke: true, strokeWidth: 2 },
    // Bottom stationary contact point (filled dot)
    { d: 'M 22,35 A 2,2 0 1,1 21.99,35 Z', stroke: true, fill: true },
    // Bottom connection line
    { d: 'M 20,35 L 20,50', stroke: true, strokeWidth: 2 },
  ],
  createdAt: 0,
  modifiedAt: 0,
};

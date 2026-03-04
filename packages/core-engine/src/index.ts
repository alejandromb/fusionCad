/**
 * @fusion-cad/core-engine
 *
 * Core engine - graph, commands, invariants, routing
 */

export const ENGINE_VERSION = '0.1.0';

// Wire routing
export * from './routing/index.js';

// Wire numbering
export * from './wire-numbering.js';

// Cross-references
export * from './cross-references.js';

// Electrical Rules Check
export * from './erc.js';
export * from './device-classifier.js';
export * from './circuit-graph.js';

// Ladder diagram layout
export * from './ladder-layout.js';

// Symbol validation
export * from './symbol-validator.js';

// Terminal block calculation
export * from './terminal-calculator.js';

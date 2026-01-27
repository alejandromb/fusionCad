/**
 * JSON Persistence Adapter
 *
 * Simple JSON-based project storage for Phase 1
 */

import type { GoldenCircuit } from './golden-circuit.js';
import { readFileSync, writeFileSync } from 'node:fs';

export interface ProjectJSON {
  version: string;
  project: any;
  sheet: any;
  parts: any[];
  devices: any[];
  nets: any[];
  terminals: any[];
  connections: any[];
}

/**
 * Save circuit to JSON file
 */
export function saveCircuitToJSON(circuit: GoldenCircuit, filePath: string): void {
  const json: ProjectJSON = {
    version: '0.1.0',
    project: circuit.project,
    sheet: circuit.sheet,
    parts: circuit.parts,
    devices: circuit.devices,
    nets: circuit.nets,
    terminals: circuit.terminals,
    connections: circuit.connections,
  };

  writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
}

/**
 * Load circuit from JSON file
 */
export function loadCircuitFromJSON(filePath: string): GoldenCircuit {
  const json = JSON.parse(readFileSync(filePath, 'utf-8')) as ProjectJSON;

  return {
    project: json.project,
    sheet: json.sheet,
    parts: json.parts,
    devices: json.devices,
    nets: json.nets,
    terminals: json.terminals,
    connections: json.connections,
  };
}

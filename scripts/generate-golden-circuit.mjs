/**
 * Script to generate golden circuit JSON file
 *
 * Run: node scripts/generate-golden-circuit.js
 */

import { createGoldenCircuitMotorStarter } from '../packages/project-io/dist/index.js';
import { saveCircuitToJSON } from '../packages/project-io/dist/json-adapter.js';
import { resolve } from 'node:path';

const circuit = createGoldenCircuitMotorStarter();
const outputPath = resolve('test-data/golden-circuit-motor-starter.json');

saveCircuitToJSON(circuit, outputPath);

console.log(`✓ Golden circuit saved to: ${outputPath}`);
console.log(`  Devices: ${circuit.devices.length}`);
console.log(`  Parts: ${circuit.parts.length}`);
console.log(`  Nets: ${circuit.nets.length}`);
console.log(`  Connections: ${circuit.connections.length}`);

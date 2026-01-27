#!/usr/bin/env node

/**
 * fusionCad CLI
 *
 * Commands:
 * - fcad validate <project>
 * - fcad export:bom <project>
 * - fcad export:wires <project>
 * - fcad export:terminals <project>
 */

import { program } from 'commander';
import { writeFileSync } from 'node:fs';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import { generateBom, bomToCSV, generateWireList, wireListToCSV } from '@fusion-cad/reports';
import { validateCircuit } from '@fusion-cad/rules';

const VERSION = '0.1.0';

program
  .name('fcad')
  .description('fusionCad CLI - validation and export tools')
  .version(VERSION);

program
  .command('validate')
  .argument('[project]', 'Project file to validate (defaults to golden circuit)')
  .description('Run validation rules on a project')
  .action((project: string | undefined) => {
    console.log('[fcad] Running validation...');

    // For Phase 1, we always use the golden circuit
    const circuit = createGoldenCircuitMotorStarter();
    const report = validateCircuit(circuit.devices, circuit.nets, circuit.connections);

    console.log(`[fcad] ✓ Validation complete`);
    console.log(`[fcad]   Errors: ${report.errorCount}`);
    console.log(`[fcad]   Warnings: ${report.warningCount}`);
    console.log(`[fcad]   Info: ${report.infoCount}`);

    if (report.results.length === 0) {
      console.log('[fcad]   Circuit is valid!');
    } else {
      console.log('');
      for (const result of report.results) {
        const icon = result.severity === 'error' ? '❌' : result.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        console.log(`[fcad] ${icon} [${result.ruleCode}] ${result.message}`);
        if (result.suggestedFix) {
          console.log(`[fcad]      → ${result.suggestedFix}`);
        }
      }
    }

    process.exit(report.passed ? 0 : 1);
  });

program
  .command('export:bom')
  .argument('[project]', 'Project file (defaults to golden circuit)')
  .option('-o, --output <file>', 'Output file', 'bom.csv')
  .description('Export Bill of Materials')
  .action((project: string | undefined, options: { output: string }) => {
    console.log('[fcad] Generating BOM...');

    // For Phase 1, we always use the golden circuit
    const circuit = createGoldenCircuitMotorStarter();
    const bom = generateBom(circuit.parts, circuit.devices);
    const csv = bomToCSV(bom);

    writeFileSync(options.output, csv, 'utf-8');
    console.log(`[fcad] ✓ BOM exported to: ${options.output}`);
    console.log(`[fcad]   Total items: ${bom.totalItems}`);
    console.log(`[fcad]   Unique parts: ${bom.rows.length}`);
  });

program
  .command('export:wires')
  .argument('[project]', 'Project file (defaults to golden circuit)')
  .option('-o, --output <file>', 'Output file', 'wirelist.csv')
  .description('Export wire list')
  .action((project: string | undefined, options: { output: string }) => {
    console.log('[fcad] Generating wire list...');

    // For Phase 1, we always use the golden circuit
    const circuit = createGoldenCircuitMotorStarter();
    const wireList = generateWireList(circuit.connections, circuit.nets);
    const csv = wireListToCSV(wireList);

    writeFileSync(options.output, csv, 'utf-8');
    console.log(`[fcad] ✓ Wire list exported to: ${options.output}`);
    console.log(`[fcad]   Total wires: ${wireList.totalWires}`);
  });

program
  .command('export:terminals')
  .argument('<project>', 'Project file')
  .description('Export terminal plan')
  .action((project: string) => {
    console.log(`[fcad] Exporting terminal plan from: ${project}`);
    console.log('[fcad] Not implemented yet - Phase 1');
  });

program.parse();

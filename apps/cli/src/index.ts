#!/usr/bin/env node

/**
 * fusionCad CLI
 *
 * Commands:
 * - vcad validate <project>
 * - vcad export:bom <project>
 * - vcad export:wires <project>
 * - vcad export:terminals <project>
 */

import { program } from 'commander';

const VERSION = '0.1.0';

program
  .name('vcad')
  .description('fusionCad CLI - validation and export tools')
  .version(VERSION);

program
  .command('validate')
  .argument('<project>', 'Project file to validate')
  .description('Run validation rules on a project')
  .action((project: string) => {
    console.log(`[vcad] Validating project: ${project}`);
    console.log('[vcad] Not implemented yet - Phase 1');
  });

program
  .command('export:bom')
  .argument('<project>', 'Project file')
  .description('Export Bill of Materials')
  .action((project: string) => {
    console.log(`[vcad] Exporting BOM from: ${project}`);
    console.log('[vcad] Not implemented yet - Phase 1');
  });

program
  .command('export:wires')
  .argument('<project>', 'Project file')
  .description('Export wire list')
  .action((project: string) => {
    console.log(`[vcad] Exporting wire list from: ${project}`);
    console.log('[vcad] Not implemented yet - Phase 1');
  });

program
  .command('export:terminals')
  .argument('<project>', 'Project file')
  .description('Export terminal plan')
  .action((project: string) => {
    console.log(`[vcad] Exporting terminal plan from: ${project}`);
    console.log('[vcad] Not implemented yet - Phase 1');
  });

program.parse();

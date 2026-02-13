/**
 * Migration: Sheet-level diagramType → DiagramBlock architecture.
 *
 * For each sheet with `diagramType === 'ladder'`, creates a LadderBlock
 * at position (0, 0) with the sheet's ladderConfig. Reassigns rungs
 * from `sheetId` → `blockId`.
 *
 * Idempotent: no-op if the circuit already has blocks.
 */

import { generateId } from '../id.js';
import type { LadderBlock, LadderConfig, Rung, Sheet, AnyDiagramBlock } from '../types.js';

/** Default ladder config (matches core-engine DEFAULT_LADDER_CONFIG) */
const DEFAULT_LADDER_CONFIG: LadderConfig = {
  railL1X: 100,
  railL2X: 900,
  firstRungY: 100,
  rungSpacing: 120,
  railLabelL1: 'L1',
  railLabelL2: 'L2',
};

/**
 * Minimal circuit shape for migration — only the fields we read/write.
 * This avoids importing CircuitData from the web app or MCP server.
 */
export interface MigratableCircuit {
  sheets?: Sheet[];
  rungs?: Rung[];
  blocks?: AnyDiagramBlock[];
}

/**
 * Migrate sheet-level ladder config to block architecture.
 * Returns a new object with `blocks` and updated `rungs` (blockId set).
 * Idempotent — returns input unchanged if blocks already exist.
 */
export function migrateToBlocks<T extends MigratableCircuit>(circuit: T): T {
  // Already migrated — blocks exist
  if (circuit.blocks && circuit.blocks.length > 0) {
    return circuit;
  }

  const sheets = circuit.sheets || [];
  const ladderSheets = sheets.filter(s => s.diagramType === 'ladder');

  // Nothing to migrate
  if (ladderSheets.length === 0) {
    return circuit;
  }

  const now = Date.now();
  const newBlocks: AnyDiagramBlock[] = [];
  const sheetToBlockId = new Map<string, string>();

  for (const sheet of ladderSheets) {
    const blockId = generateId();
    const block: LadderBlock = {
      id: blockId,
      type: 'block',
      blockType: 'ladder',
      sheetId: sheet.id,
      name: `${sheet.name} Ladder`,
      position: { x: 0, y: 0 },
      ladderConfig: sheet.ladderConfig ?? { ...DEFAULT_LADDER_CONFIG },
      createdAt: now,
      modifiedAt: now,
    };
    newBlocks.push(block);
    sheetToBlockId.set(sheet.id, blockId);
  }

  // Reassign rungs: set blockId for rungs on ladder sheets
  const updatedRungs = (circuit.rungs || []).map(rung => {
    const blockId = sheetToBlockId.get(rung.sheetId);
    if (blockId && !rung.blockId) {
      return { ...rung, blockId };
    }
    return rung;
  });

  return {
    ...circuit,
    blocks: newBlocks,
    rungs: updatedRungs,
  };
}

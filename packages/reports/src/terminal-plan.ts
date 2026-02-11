/**
 * Terminal Plan Report Generator
 *
 * Generates a terminal block schedule showing all terminal strips,
 * their individual terminals, wire connections, and cross-references.
 *
 * Updated for the new Terminal model where each terminal is an individual
 * part belonging to a strip (stripTag), with 1-3 levels per terminal.
 */

import type { Terminal, TerminalLevel, Part } from '@fusion-cad/core-model';

export interface TerminalPlanRow {
  stripTag: string;
  terminalIndex: number;
  terminalLabel: string;
  terminalType: string;
  level: number;
  wireNumberIn: string;
  wireNumberOut: string;
  crossRefDevice: string;
  crossRefSheet: string;
  partNumber: string;
  manufacturer: string;
}

export interface TerminalPlanReport {
  rows: TerminalPlanRow[];
  totalTerminals: number;
  totalStrips: number;
  totalLevels: number;
  partSummary: Array<{
    partNumber: string;
    manufacturer: string;
    description: string;
    quantity: number;
  }>;
  generatedAt: number;
}

/**
 * Generate terminal plan from terminals and parts.
 */
export function generateTerminalPlan(
  terminals: Terminal[],
  parts?: Part[]
): TerminalPlanReport {
  const partMap = new Map<string, Part>();
  if (parts) {
    for (const part of parts) {
      partMap.set(part.id, part);
    }
  }

  const rows: TerminalPlanRow[] = [];
  const stripTags = new Set<string>();
  let totalLevels = 0;

  // Sort terminals by strip tag then index
  const sorted = [...terminals].sort((a, b) => {
    if (a.stripTag !== b.stripTag) return a.stripTag.localeCompare(b.stripTag);
    return a.index - b.index;
  });

  // Part quantity counter for summary
  const partCounts = new Map<string, { part: Part; count: number }>();

  for (const terminal of sorted) {
    stripTags.add(terminal.stripTag);

    const part = terminal.partId ? partMap.get(terminal.partId) : null;
    const terminalLabel = terminal.label || `${terminal.stripTag}:${terminal.index}`;

    // Track part quantities
    if (part) {
      const key = part.partNumber;
      const existing = partCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        partCounts.set(key, { part, count: 1 });
      }
    }

    // Generate one row per level
    for (const level of terminal.levels) {
      totalLevels++;
      rows.push({
        stripTag: terminal.stripTag,
        terminalIndex: terminal.index,
        terminalLabel,
        terminalType: terminal.terminalType,
        level: level.levelIndex + 1,
        wireNumberIn: level.wireNumberIn || '',
        wireNumberOut: level.wireNumberOut || '',
        crossRefDevice: level.crossReference?.deviceTag || '',
        crossRefSheet: level.crossReference?.sheetId || '',
        partNumber: part?.partNumber || '',
        manufacturer: part?.manufacturer || '',
      });
    }
  }

  // Build part summary
  const partSummary = Array.from(partCounts.values()).map(({ part, count }) => ({
    partNumber: part.partNumber,
    manufacturer: part.manufacturer,
    description: part.description,
    quantity: count,
  }));

  return {
    rows,
    totalTerminals: sorted.length,
    totalStrips: stripTags.size,
    totalLevels,
    partSummary,
    generatedAt: Date.now(),
  };
}

/**
 * Convert terminal plan to CSV format
 */
export function terminalPlanToCSV(plan: TerminalPlanReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Strip,Index,Label,Type,Level,Wire In,Wire Out,Cross-Ref Device,Part Number,Manufacturer');

  // Rows
  for (const row of plan.rows) {
    lines.push(
      `"${row.stripTag}","${row.terminalIndex}","${row.terminalLabel}","${row.terminalType}","${row.level}","${row.wireNumberIn}","${row.wireNumberOut}","${row.crossRefDevice}","${row.partNumber}","${row.manufacturer}"`
    );
  }

  // Summary
  lines.push('');
  lines.push(`Total Terminals,${plan.totalTerminals}`);
  lines.push(`Total Strips,${plan.totalStrips}`);
  lines.push(`Total Levels,${plan.totalLevels}`);

  // Part summary (BOM for terminals)
  if (plan.partSummary.length > 0) {
    lines.push('');
    lines.push('--- Terminal BOM ---');
    lines.push('Part Number,Manufacturer,Description,Quantity');
    for (const item of plan.partSummary) {
      lines.push(
        `"${item.partNumber}","${item.manufacturer}","${item.description}","${item.quantity}"`
      );
    }
  }

  lines.push('');
  lines.push(`Generated,${new Date(plan.generatedAt).toISOString()}`);

  return lines.join('\n');
}

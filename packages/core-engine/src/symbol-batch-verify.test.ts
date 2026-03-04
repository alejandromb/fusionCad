import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinSymbols, getAllSymbols } from '@fusion-cad/core-model';
import { validateAllSymbols } from './symbol-validator.js';

describe('Builtin Symbol Batch Validation', () => {
  beforeAll(() => {
    registerBuiltinSymbols();
  });

  it('loads all builtin symbols', () => {
    const symbols = getAllSymbols();
    expect(symbols.length).toBeGreaterThan(50);
  });

  it('all builtin symbols pass with no errors', () => {
    const symbols = getAllSymbols();
    const reports = validateAllSymbols(symbols);
    const withErrors = reports.filter(r => r.errorCount > 0);

    if (withErrors.length > 0) {
      const summary = withErrors.map(r =>
        `${r.symbolId}: ${r.issues.filter(i => i.severity === 'error').map(i => i.message).join('; ')}`
      ).join('\n');
      expect(withErrors, `Symbols with errors:\n${summary}`).toEqual([]);
    }

    expect(withErrors).toEqual([]);
  });

  it('reports summary statistics', () => {
    const symbols = getAllSymbols();
    const reports = validateAllSymbols(symbols);

    const totalErrors = reports.reduce((sum, r) => sum + r.errorCount, 0);
    const totalWarnings = reports.reduce((sum, r) => sum + r.warningCount, 0);
    const totalInfo = reports.reduce((sum, r) => sum + r.infoCount, 0);
    const withIssues = reports.filter(r => r.issues.length > 0);

    // Log summary for visibility
    console.log(`Validated ${symbols.length} symbols:`);
    console.log(`  ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfo} info`);
    console.log(`  ${withIssues.length} symbols with issues`);

    // Errors must be zero; warnings and info are acceptable
    expect(totalErrors).toBe(0);
  });
});

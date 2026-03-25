import { describe, it, expect } from 'vitest';
import { generateCrossReferences, formatCrossRefText } from './cross-references.js';

describe('Cross-References', () => {
  const sheets = [
    { id: 'sheet-1', name: 'Power', number: 1 },
    { id: 'sheet-2', name: 'Control', number: 2 },
    { id: 'sheet-3', name: 'Loads', number: 3 },
  ];

  it('generates cross-refs for relay coil on sheet 1 and contacts on sheet 2', () => {
    const devices = [
      { tag: 'K1', sheetId: 'sheet-1', category: 'relay-coil' },
      { tag: 'K1', sheetId: 'sheet-2', category: 'relay-contact-no' },
    ];

    const refs = generateCrossReferences(devices, sheets);
    expect(refs).toHaveLength(2); // bidirectional
    expect(refs[0].referenceType).toBe('coil-contact');

    const fromSheet1 = refs.filter(r => r.sourceSheetId === 'sheet-1');
    expect(fromSheet1).toHaveLength(1);
    expect(fromSheet1[0].targetSheetNumber).toBe(2);

    const fromSheet2 = refs.filter(r => r.sourceSheetId === 'sheet-2');
    expect(fromSheet2).toHaveLength(1);
    expect(fromSheet2[0].targetSheetNumber).toBe(1);
  });

  it('generates no cross-refs for single-sheet device', () => {
    const devices = [
      { tag: 'K1', sheetId: 'sheet-1', category: 'relay-coil' },
    ];

    const refs = generateCrossReferences(devices, sheets);
    expect(refs).toHaveLength(0);
  });

  it('generates cross-refs for device on 3 sheets', () => {
    const devices = [
      { tag: 'K1', sheetId: 'sheet-1', category: 'relay-coil' },
      { tag: 'K1', sheetId: 'sheet-2', category: 'relay-contact-no' },
      { tag: 'K1', sheetId: 'sheet-3', category: 'relay-contact-nc' },
    ];

    const refs = generateCrossReferences(devices, sheets);
    // 3 sheets × 2 targets each = 6 entries
    expect(refs).toHaveLength(6);
  });

  it('classifies terminal cross-refs correctly', () => {
    const devices = [
      { tag: 'X1', sheetId: 'sheet-1', category: 'single-terminal' },
      { tag: 'X1', sheetId: 'sheet-2', category: 'single-terminal' },
    ];

    const refs = generateCrossReferences(devices, sheets);
    expect(refs[0].referenceType).toBe('terminal-terminal');
  });

  it('formats cross-ref text as /sheetNumber', () => {
    const devices = [
      { tag: 'K1', sheetId: 'sheet-1', category: 'relay-coil' },
      { tag: 'K1', sheetId: 'sheet-2', category: 'relay-contact-no' },
      { tag: 'K1', sheetId: 'sheet-3', category: 'relay-contact-nc' },
    ];

    const refs = generateCrossReferences(devices, sheets);
    const text = formatCrossRefText('K1', 'sheet-1', refs);
    expect(text).toBe('/2, /3');
  });

  it('returns empty string for device with no cross-refs', () => {
    const text = formatCrossRefText('K1', 'sheet-1', []);
    expect(text).toBe('');
  });
});

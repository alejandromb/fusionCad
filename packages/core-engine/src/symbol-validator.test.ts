import { describe, it, expect } from 'vitest';
import type { SymbolDefinition, SymbolPrimitive } from '@fusion-cad/core-model';
import { validateSymbol, computePrimitiveBounds } from './symbol-validator.js';

function makeSymbol(overrides?: Partial<SymbolDefinition>): SymbolDefinition {
  return {
    id: 'test-symbol',
    type: 'symbol-definition',
    name: 'Test Symbol',
    category: 'Test',
    geometry: { width: 40, height: 60 },
    pins: [
      { id: 'A1', name: 'A1', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
      { id: 'A2', name: 'A2', position: { x: 20, y: 60 }, direction: 'bottom', pinType: 'passive' },
    ],
    primitives: [
      { type: 'line', x1: 20, y1: 0, x2: 20, y2: 60 },
    ],
    createdAt: 0,
    modifiedAt: 0,
    ...overrides,
  } as SymbolDefinition;
}

// --- no-geometry ---

describe('no-geometry', () => {
  it('flags symbol with no primitives and no paths', () => {
    const sym = makeSymbol({ primitives: [], paths: [] });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-geometry')).toBe(true);
    expect(report.valid).toBe(false);
  });

  it('flags symbol with undefined primitives and undefined paths', () => {
    const sym = makeSymbol({ primitives: undefined, paths: undefined });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-geometry')).toBe(true);
  });

  it('flags symbol with empty SVG path strings', () => {
    const sym = makeSymbol({ primitives: [], paths: [{ d: '  ', stroke: true }] });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-geometry')).toBe(true);
  });

  it('passes symbol with valid primitives', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-geometry')).toBe(false);
  });

  it('passes symbol with valid SVG path (no primitives)', () => {
    const sym = makeSymbol({ primitives: [], paths: [{ d: 'M 0 0 L 40 60' }] });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-geometry')).toBe(false);
  });
});

// --- duplicate-pin-id ---

describe('duplicate-pin-id', () => {
  it('flags duplicate pin IDs', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
        { id: 'A1', name: 'A1-dup', position: { x: 20, y: 60 }, direction: 'bottom', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    const issue = report.issues.find(i => i.rule === 'duplicate-pin-id');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(issue!.pinId).toBe('A1');
  });

  it('passes with unique pin IDs', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'duplicate-pin-id')).toBe(false);
  });
});

// --- empty-pin-id ---

describe('empty-pin-id', () => {
  it('flags pin with empty string ID', () => {
    const sym = makeSymbol({
      pins: [
        { id: '', name: 'A1', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'empty-pin-id')).toBe(true);
  });

  it('flags pin with whitespace-only ID', () => {
    const sym = makeSymbol({
      pins: [
        { id: '  ', name: 'A1', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'empty-pin-id')).toBe(true);
  });

  it('passes with valid pin ID', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'empty-pin-id')).toBe(false);
  });
});

// --- empty-pin-name ---

describe('empty-pin-name', () => {
  it('flags pin with empty name', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: '', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    const issue = report.issues.find(i => i.rule === 'empty-pin-name');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('error');
    expect(issue!.pinId).toBe('A1');
  });

  it('passes with valid pin name', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'empty-pin-name')).toBe(false);
  });
});

// --- pin-outside-bounds ---

describe('pin-outside-bounds', () => {
  it('flags pin far outside bounds', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 100, y: 50 }, direction: 'right', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    const issue = report.issues.find(i => i.rule === 'pin-outside-bounds');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('allows pin on boundary edge', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 40, y: 0 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-outside-bounds')).toBe(false);
  });

  it('allows pin within tolerance', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: -3, y: 30 }, direction: 'left', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-outside-bounds')).toBe(false);
  });

  it('flags pin with negative Y beyond tolerance', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 20, y: -10 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-outside-bounds')).toBe(true);
  });
});

// --- pin-direction-mismatch ---

describe('pin-direction-mismatch', () => {
  it('flags top pin at bottom of symbol', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 20, y: 55 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-direction-mismatch')).toBe(true);
  });

  it('flags bottom pin at top of symbol', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 20, y: 5 }, direction: 'bottom', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-direction-mismatch')).toBe(true);
  });

  it('flags left pin on right side', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 35, y: 30 }, direction: 'left', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-direction-mismatch')).toBe(true);
  });

  it('flags right pin on left side', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 5, y: 30 }, direction: 'right', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-direction-mismatch')).toBe(true);
  });

  it('passes pin with correct direction', () => {
    const sym = makeSymbol({
      pins: [
        { id: 'A1', name: 'A1', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
        { id: 'A2', name: 'A2', position: { x: 20, y: 60 }, direction: 'bottom', pinType: 'passive' },
        { id: 'A3', name: 'A3', position: { x: 0, y: 30 }, direction: 'left', pinType: 'passive' },
        { id: 'A4', name: 'A4', position: { x: 40, y: 30 }, direction: 'right', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'pin-direction-mismatch')).toBe(false);
  });
});

// --- geometry-overflow ---

describe('geometry-overflow', () => {
  it('flags primitives extending far outside bounds', () => {
    const sym = makeSymbol({
      geometry: { width: 40, height: 60 },
      primitives: [
        { type: 'line', x1: 0, y1: 0, x2: 200, y2: 0 },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'geometry-overflow')).toBe(true);
  });

  it('allows small overflow within tolerance', () => {
    const sym = makeSymbol({
      geometry: { width: 40, height: 60 },
      primitives: [
        { type: 'line', x1: -5, y1: 0, x2: 45, y2: 60 },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'geometry-overflow')).toBe(false);
  });
});

// --- bounds-mismatch ---

describe('bounds-mismatch', () => {
  it('flags large mismatch between declared and actual width', () => {
    const sym = makeSymbol({
      geometry: { width: 100, height: 60 },
      primitives: [
        { type: 'line', x1: 0, y1: 0, x2: 40, y2: 60 },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'bounds-mismatch')).toBe(true);
  });

  it('passes when declared and actual are close', () => {
    const sym = makeSymbol({
      geometry: { width: 40, height: 60 },
      primitives: [
        { type: 'rect', x: 0, y: 0, width: 38, height: 58 },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'bounds-mismatch')).toBe(false);
  });
});

// --- no-pins ---

describe('no-pins', () => {
  it('reports info for symbol with zero pins', () => {
    const sym = makeSymbol({ pins: [] });
    const report = validateSymbol(sym);
    const issue = report.issues.find(i => i.rule === 'no-pins');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('does not report for symbol with pins', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'no-pins')).toBe(false);
  });
});

// --- large-symbol ---

describe('large-symbol', () => {
  it('reports info for symbol exceeding 200px width', () => {
    const sym = makeSymbol({ geometry: { width: 300, height: 60 } });
    const report = validateSymbol(sym);
    const issue = report.issues.find(i => i.rule === 'large-symbol');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('info');
  });

  it('does not report for normal-sized symbol', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.issues.some(i => i.rule === 'large-symbol')).toBe(false);
  });
});

// --- computePrimitiveBounds ---

describe('computePrimitiveBounds', () => {
  it('returns null for empty primitives', () => {
    expect(computePrimitiveBounds([])).toBeNull();
  });

  it('computes line bounds', () => {
    const bounds = computePrimitiveBounds([
      { type: 'line', x1: 10, y1: 20, x2: 30, y2: 40 },
    ]);
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
  });

  it('computes rect bounds', () => {
    const bounds = computePrimitiveBounds([
      { type: 'rect', x: 5, y: 10, width: 20, height: 30 },
    ]);
    expect(bounds).toEqual({ minX: 5, minY: 10, maxX: 25, maxY: 40 });
  });

  it('computes circle bounds', () => {
    const bounds = computePrimitiveBounds([
      { type: 'circle', cx: 20, cy: 30, r: 10 },
    ]);
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
  });

  it('computes ellipse bounds', () => {
    const bounds = computePrimitiveBounds([
      { type: 'ellipse', cx: 20, cy: 30, rx: 15, ry: 10 },
    ]);
    expect(bounds).toEqual({ minX: 5, minY: 20, maxX: 35, maxY: 40 });
  });

  it('computes polyline bounds', () => {
    const bounds = computePrimitiveBounds([
      { type: 'polyline', points: [{ x: 0, y: 5 }, { x: 10, y: 15 }, { x: 20, y: 0 }] },
    ]);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 15 });
  });

  it('computes arc bounds (conservative)', () => {
    const bounds = computePrimitiveBounds([
      { type: 'arc', cx: 20, cy: 20, r: 10, startAngle: 0, endAngle: Math.PI },
    ]);
    expect(bounds).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 30 });
  });

  it('skips text primitives', () => {
    const bounds = computePrimitiveBounds([
      { type: 'text', x: 100, y: 100, content: 'Test' },
    ]);
    expect(bounds).toBeNull();
  });

  it('combines multiple primitives', () => {
    const bounds = computePrimitiveBounds([
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
      { type: 'circle', cx: 50, cy: 50, r: 5 },
    ]);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 55, maxY: 55 });
  });
});

// --- Report structure ---

describe('report structure', () => {
  it('returns valid report for well-formed symbol', () => {
    const sym = makeSymbol();
    const report = validateSymbol(sym);
    expect(report.symbolId).toBe('test-symbol');
    expect(report.symbolName).toBe('Test Symbol');
    expect(report.errorCount).toBe(0);
    expect(report.valid).toBe(true);
  });

  it('counts errors correctly', () => {
    const sym = makeSymbol({
      primitives: [],
      paths: [],
      pins: [
        { id: '', name: '', position: { x: 20, y: 0 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });

  it('generates sequential issue IDs', () => {
    const sym = makeSymbol({
      primitives: [],
      paths: [],
      pins: [
        { id: 'A1', name: 'A1', position: { x: 200, y: 200 }, direction: 'top', pinType: 'passive' },
      ],
    });
    const report = validateSymbol(sym);
    const ids = report.issues.map(i => i.id);
    expect(ids[0]).toBe('SV-001');
    if (ids.length > 1) expect(ids[1]).toBe('SV-002');
  });
});

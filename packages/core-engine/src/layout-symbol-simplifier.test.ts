import { describe, it, expect } from 'vitest';
import { simplifyLayoutPrimitives } from './layout-symbol-simplifier.js';
import type { SymbolPrimitive } from '@fusion-cad/core-model';

describe('layout symbol simplifier', () => {
  it('keeps major components and drops isolated tiny clusters', () => {
    const primitives: SymbolPrimitive[] = [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 50 },
      { type: 'line', x1: 0, y1: 0, x2: 20, y2: 0 },
      { type: 'line', x1: 20, y1: 0, x2: 20, y2: 50 },
      { type: 'line', x1: 0, y1: 50, x2: 20, y2: 50 },

      { type: 'line', x1: 60, y1: 0, x2: 60, y2: 50 },
      { type: 'line', x1: 60, y1: 0, x2: 90, y2: 0 },
      { type: 'line', x1: 90, y1: 0, x2: 90, y2: 50 },
      { type: 'line', x1: 60, y1: 50, x2: 90, y2: 50 },

      { type: 'line', x1: 30, y1: 10, x2: 31, y2: 10 },
      { type: 'line', x1: 31, y1: 10, x2: 31, y2: 11 },
      { type: 'line', x1: 31, y1: 11, x2: 30, y2: 11 },
      { type: 'line', x1: 30, y1: 11, x2: 30, y2: 10 },
    ];

    const result = simplifyLayoutPrimitives(primitives, { preserveLabels: true, keepComponentCount: 2 });

    expect(result.length).toBe(8);
    expect(result.every((primitive) => {
      if (primitive.type !== 'line') return true;
      return primitive.x1 < 25 || primitive.x1 > 55 || primitive.x2 < 25 || primitive.x2 > 55;
    })).toBe(true);
  });

  it('preserves text labels when requested', () => {
    const primitives: SymbolPrimitive[] = [
      { type: 'line', x1: 0, y1: 0, x2: 50, y2: 0 },
      { type: 'line', x1: 50, y1: 0, x2: 50, y2: 30 },
      { type: 'line', x1: 50, y1: 30, x2: 0, y2: 30 },
      { type: 'line', x1: 0, y1: 30, x2: 0, y2: 0 },
      { type: 'text', x: 10, y: 15, content: '24 VDC', fontSize: 3 },
    ];

    const result = simplifyLayoutPrimitives(primitives, { preserveLabels: true });
    expect(result.some((primitive) => primitive.type === 'text' && primitive.content === '24 VDC')).toBe(true);
  });
});

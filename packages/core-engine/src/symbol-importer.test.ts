import { describe, it, expect } from 'vitest';
import { importSvg, importDxf, finalizeImportedSymbol } from './symbol-importer.js';

describe('SVG Symbol Importer', () => {
  it('imports a simple SVG with line, rect, and circle', () => {
    const svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="5" width="80" height="50" fill="none" stroke="black" />
        <line x1="0" y1="20" x2="10" y2="20" stroke="black" />
        <line x1="90" y1="20" x2="100" y2="20" stroke="black" />
        <line x1="0" y1="40" x2="10" y2="40" stroke="black" />
        <line x1="90" y1="40" x2="100" y2="40" stroke="black" />
        <circle cx="50" cy="30" r="8" fill="none" stroke="black" />
        <text x="45" y="35" font-size="10">K</text>
      </svg>
    `;

    const result = importSvg(svg, 40);

    expect(result.primitives.length).toBeGreaterThan(0);
    expect(result.bounds.width).toBeCloseTo(40, 0);
    expect(result.bounds.height).toBeGreaterThan(0);

    // Should detect 4 pin candidates (endpoints at boundary)
    expect(result.pinCandidates.length).toBe(4);

    // Left side pins
    const leftPins = result.pinCandidates.filter(p => p.suggestedDirection === 'left');
    expect(leftPins.length).toBe(2);

    // Right side pins
    const rightPins = result.pinCandidates.filter(p => p.suggestedDirection === 'right');
    expect(rightPins.length).toBe(2);
  });

  it('detects small circles as pin candidates', () => {
    const svg = `
      <svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="5" width="60" height="30" fill="none" stroke="black" />
        <circle cx="0" cy="20" r="2" fill="black" />
        <circle cx="80" cy="20" r="2" fill="black" />
      </svg>
    `;

    const result = importSvg(svg, 40);
    // Small circles at boundary should be detected as pins
    const smallCirclePins = result.pinCandidates.filter(p => p.source === 'small-circle');
    expect(smallCirclePins.length).toBe(2);
  });

  it('finalizes an imported symbol into a SymbolDefinition', () => {
    const svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="5" width="80" height="50" fill="none" stroke="black" />
        <line x1="0" y1="30" x2="10" y2="30" stroke="black" />
        <line x1="90" y1="30" x2="100" y2="30" stroke="black" />
      </svg>
    `;

    const imported = importSvg(svg, 40);
    const symbolDef = finalizeImportedSymbol(
      imported,
      'custom-relay',
      'Custom Relay',
      'relay',
      [
        { x: 0, y: 12, name: 'A1', direction: 'left', pinType: 'passive' },
        { x: 40, y: 12, name: 'A2', direction: 'right', pinType: 'passive' },
      ],
      'K'
    );

    expect(symbolDef.id).toBe('custom-relay');
    expect(symbolDef.name).toBe('Custom Relay');
    expect(symbolDef.pins).toHaveLength(2);
    expect(symbolDef.pins[0].id).toBe('A1');
    expect(symbolDef.pins[1].id).toBe('A2');
    expect(symbolDef.geometry.width).toBeCloseTo(40, 0);
    expect(symbolDef.tagPrefix).toBe('K');
    expect(symbolDef.source).toBe('imported');
  });
});

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

  it('scales and normalizes SVG path primitives into the imported bounds', () => {
    const svg = `
      <svg viewBox="10 20 80 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M 10 20 L 90 20 L 90 60 L 10 60 Z" fill="none" stroke="black" />
      </svg>
    `;

    const result = importSvg(svg, 40);
    const path = result.primitives.find(p => p.type === 'path');

    expect(path).toBeDefined();
    expect(result.bounds.width).toBeCloseTo(40, 3);
    expect(result.bounds.height).toBeCloseTo(20, 3);
    expect(path && path.type === 'path' ? path.d.startsWith('M0 0') : false).toBe(true);
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

describe('DXF Symbol Importer', () => {
  it('converts DXF inches to millimeters using INSUNITS', () => {
    const dxf = `0
SECTION
2
HEADER
9
$INSUNITS
70
1
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
30
0
11
1
21
0
31
0
0
ENDSEC
0
EOF`;

    const result = importDxf(dxf);
    expect(result.bounds.width).toBeCloseTo(25.4, 3);
  });

  it('applies INSERT translation rotation and scale to block geometry', () => {
    const dxf = `0
SECTION
2
BLOCKS
0
BLOCK
8
0
2
TEST
70
0
10
0
20
0
30
0
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
10
20
0
10
10
20
5
10
0
20
5
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
0
2
TEST
10
5
20
5
30
0
41
2
42
2
50
90
0
ENDSEC
0
EOF`;

    const result = importDxf(dxf);
    expect(result.bounds.width).toBeCloseTo(10, 3);
    expect(result.bounds.height).toBeCloseTo(20, 3);
    expect(result.primitives.some(p => p.type === 'polyline')).toBe(true);
  });
});

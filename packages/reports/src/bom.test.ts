import { describe, it, expect } from 'vitest';
import type { Part, Device } from '@fusion-cad/core-model';
import { generateBom } from './bom.js';

function makeDevice(tag: string, partId: string, opts: Partial<Device> = {}): Device {
  return {
    id: `dev-${tag}`,
    type: 'device',
    tag,
    function: 'Test',
    sheetId: 'sheet-1',
    partId,
    createdAt: 0,
    modifiedAt: 0,
    ...opts,
  };
}

function makePart(id: string, mfg: string, pn: string, category = 'relay'): Part {
  return {
    id,
    type: 'part',
    manufacturer: mfg,
    partNumber: pn,
    description: `${pn} description`,
    category,
    attributes: {},
    createdAt: 0,
    modifiedAt: 0,
  };
}

describe('generateBom — aggregation', () => {
  it('aggregates devices that share the same partNumber + manufacturer', () => {
    // Each device has its own Part entity but they share manufacturer + partNumber
    const parts: Part[] = [
      makePart('p1', 'Allen-Bradley', '700-HK36Z24-3-4'),
      makePart('p2', 'Allen-Bradley', '700-HK36Z24-3-4'),
      makePart('p3', 'Allen-Bradley', '700-HK36Z24-3-4'),
    ];
    const devices: Device[] = [
      makeDevice('K1', 'p1'),
      makeDevice('K2', 'p2'),
      makeDevice('K3', 'p3'),
    ];

    const bom = generateBom(parts, devices);
    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].quantity).toBe(3);
    expect(bom.rows[0].deviceTags).toEqual(['K1', 'K2', 'K3']);
  });

  it('linked devices (deviceGroupId) count as 1 BOM item', () => {
    // PLC1 and PLC2 are schematic + layout representations of the same physical PLC
    const parts: Part[] = [
      makePart('p1', 'Allen-Bradley', '2080-L50E-24QBB', 'plc'),
      makePart('p2', 'Allen-Bradley', '2080-L50E-24QBB', 'plc'),
    ];
    const devices: Device[] = [
      makeDevice('PLC1', 'p1', { deviceGroupId: 'group-plc' }),
      makeDevice('PLC2', 'p2', { deviceGroupId: 'group-plc' }),
    ];

    const bom = generateBom(parts, devices);
    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].quantity).toBe(1);
  });

  it('skips devices with TBD/Unassigned placeholder parts and reports them as warnings', () => {
    const parts: Part[] = [
      makePart('p1', 'Unassigned', 'TBD', 'relay'),
    ];
    const devices: Device[] = [
      makeDevice('K1', 'p1'),
    ];

    const bom = generateBom(parts, devices);
    expect(bom.rows).toHaveLength(0);
    expect(bom.warnings).toHaveLength(1);
    expect(bom.warnings[0].deviceTag).toBe('K1');
    expect(bom.warnings[0].reason).toBe('placeholder');
  });

  it('skips warnings for linked devices when any sibling has a real part', () => {
    // PLC1 has a real part, PLC2 (linked) has placeholder — common after part migration
    const parts: Part[] = [
      makePart('p1', 'Allen-Bradley', '2080-L50E-24QBB', 'plc'),
      makePart('p2', 'Unassigned', 'TBD', 'plc'),
    ];
    const devices: Device[] = [
      makeDevice('PLC1', 'p1', { deviceGroupId: 'group-plc' }),
      makeDevice('PLC2', 'p2', { deviceGroupId: 'group-plc' }),
    ];

    const bom = generateBom(parts, devices);
    expect(bom.warnings).toHaveLength(0);
    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].quantity).toBe(1);
  });
});

describe('generateBom — overrides', () => {
  it('applies quantityOverrides to auto-generated rows', () => {
    const parts: Part[] = [
      makePart('p1', 'Phoenix Contact', '3044636', 'terminal'),
    ];
    const devices: Device[] = [
      makeDevice('X1', 'p1'),
      makeDevice('X2', 'p1'),
    ];

    const bom = generateBom(parts, devices, [], {
      quantityOverrides: { 'Phoenix Contact::3044636': 50 },
    });

    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].quantity).toBe(50);
    expect(bom.rows[0].quantityOverridden).toBe(true);
  });

  it('hides rows specified in hiddenRows', () => {
    const parts: Part[] = [
      makePart('p1', 'Eaton', 'QCR1015', 'breaker'),
      makePart('p2', 'Allen-Bradley', '700-HK36Z24-3-4', 'relay'),
    ];
    const devices: Device[] = [
      makeDevice('CB1', 'p1'),
      makeDevice('K1', 'p2'),
    ];

    const bom = generateBom(parts, devices, [], {
      hiddenRows: ['Eaton::QCR1015'],
    });

    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].partNumber).toBe('700-HK36Z24-3-4');
  });

  it('appends manualRows to the BOM', () => {
    const parts: Part[] = [
      makePart('p1', 'Allen-Bradley', '700-HK36Z24-3-4', 'relay'),
    ];
    const devices: Device[] = [
      makeDevice('K1', 'p1'),
    ];

    const bom = generateBom(parts, devices, [], {
      manualRows: [
        {
          id: 'manual-1',
          partNumber: 'SPARE-RELAY',
          manufacturer: 'Allen-Bradley',
          description: 'Spare relay (kept on hand)',
          quantity: 2,
          notes: 'For maintenance inventory',
        },
      ],
    });

    expect(bom.rows).toHaveLength(2);
    const manual = bom.rows.find(r => r.source === 'manual');
    expect(manual).toBeDefined();
    expect(manual!.quantity).toBe(2);
    expect(manual!.notes).toBe('For maintenance inventory');
  });
});

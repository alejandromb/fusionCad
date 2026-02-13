import { describe, it, expect, beforeEach } from 'vitest';
import type { CircuitData } from './api-client.js';
import {
  snapToGrid,
  generateTag,
  migratePositions,
  getDefaultSheetId,
  placeDevice,
  deleteDevice,
  updateDevice,
  placeLinkedDevice,
  createWire,
  deleteWire,
  addSheet,
  setSheetType,
  assignPart,
  addAnnotation,
  addRung,
  autoLayoutLadder,
  createLadderRails,
} from './circuit-helpers.js';

function emptyCircuit(): CircuitData {
  return {
    devices: [],
    nets: [],
    parts: [],
    connections: [],
    positions: {},
    sheets: [],
    annotations: [],
    rungs: [],
    transforms: {},
  };
}

const DEFAULT_SHEET = 'sheet-1';

// ─── Utilities ───────────────────────────────────────────────────

describe('snapToGrid', () => {
  it('returns exact value when already on grid', () => {
    expect(snapToGrid(40)).toBe(40);
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(100)).toBe(100);
  });

  it('rounds to nearest 20px grid', () => {
    expect(snapToGrid(33)).toBe(40);
    expect(snapToGrid(29)).toBe(20);
    expect(snapToGrid(10)).toBe(20);
    expect(snapToGrid(9)).toBe(0);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-15)).toBe(-20);
    expect(snapToGrid(-5) === 0).toBe(true); // Math.round produces -0, which == 0
  });
});

describe('generateTag', () => {
  it('generates K1 for first contactor coil', () => {
    const tag = generateTag('iec-coil', []);
    expect(tag).toBe('K1');
  });

  it('auto-increments existing tags', () => {
    const devices = [
      { id: '1', type: 'device' as const, tag: 'K1', function: '', partId: '', sheetId: '', createdAt: 0, modifiedAt: 0 },
      { id: '2', type: 'device' as const, tag: 'K2', function: '', partId: '', sheetId: '', createdAt: 0, modifiedAt: 0 },
    ];
    expect(generateTag('iec-coil', devices)).toBe('K3');
  });

  it('handles gaps in numbering', () => {
    const devices = [
      { id: '1', type: 'device' as const, tag: 'K1', function: '', partId: '', sheetId: '', createdAt: 0, modifiedAt: 0 },
      { id: '2', type: 'device' as const, tag: 'K5', function: '', partId: '', sheetId: '', createdAt: 0, modifiedAt: 0 },
    ];
    expect(generateTag('iec-coil', devices)).toBe('K6');
  });

  it('uses correct prefix per symbol type', () => {
    expect(generateTag('iec-normally-open-contact', [])).toBe('CR1');
    expect(generateTag('junction', [])).toBe('J1');
    expect(generateTag('iec-motor-3ph', [])).toBe('M1');
  });
});

describe('migratePositions', () => {
  it('passes through ULID-keyed positions unchanged', () => {
    const positions = { '01ABCDEFGHJKMNPQRSTUVWXY01': { x: 100, y: 200 } };
    const result = migratePositions(positions, []);
    expect(result).toEqual(positions);
  });

  it('converts tag-keyed positions to ID-keyed', () => {
    const device = { id: '01ABCDEFGHJKMNPQRSTUVWXY01', type: 'device' as const, tag: 'K1', function: '', partId: '', sheetId: '', createdAt: 0, modifiedAt: 0 };
    const positions = { K1: { x: 100, y: 200 } };
    const result = migratePositions(positions, [device]);
    expect(result).toEqual({ '01ABCDEFGHJKMNPQRSTUVWXY01': { x: 100, y: 200 } });
  });

  it('skips tags with no matching device', () => {
    const positions = { UNKNOWN: { x: 50, y: 50 } };
    const result = migratePositions(positions, []);
    expect(result).toEqual({});
  });
});

describe('getDefaultSheetId', () => {
  it('returns first sheet ID when sheets exist', () => {
    const circuit = emptyCircuit();
    circuit.sheets = [{ id: 'my-sheet', type: 'sheet', name: 'Main', number: 1, size: 'A3', createdAt: 0, modifiedAt: 0 }];
    expect(getDefaultSheetId(circuit)).toBe('my-sheet');
  });

  it('returns "sheet-1" fallback when no sheets', () => {
    expect(getDefaultSheetId(emptyCircuit())).toBe('sheet-1');
  });
});

// ─── Device CRUD ─────────────────────────────────────────────────

describe('placeDevice', () => {
  let circuit: CircuitData;

  beforeEach(() => {
    circuit = emptyCircuit();
  });

  it('creates device + part + position', () => {
    const result = placeDevice(circuit, 'iec-coil', 100, 200, DEFAULT_SHEET);
    expect(result.tag).toBe('K1');
    expect(result.circuit.devices).toHaveLength(1);
    expect(result.circuit.parts).toHaveLength(1);
    expect(result.circuit.positions[result.deviceId]).toEqual({ x: 100, y: 200 });
  });

  it('uses manual tag when provided', () => {
    const result = placeDevice(circuit, 'iec-coil', 100, 200, DEFAULT_SHEET, 'MY_COIL');
    expect(result.tag).toBe('MY_COIL');
    expect(result.circuit.devices[0].tag).toBe('MY_COIL');
  });

  it('throws on duplicate tag', () => {
    const r1 = placeDevice(circuit, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    expect(() => placeDevice(r1.circuit, 'iec-coil', 200, 200, DEFAULT_SHEET, 'K1')).toThrow(/already exists/);
  });

  it('throws on invalid symbol ID', () => {
    expect(() => placeDevice(circuit, 'nonexistent-symbol', 100, 200, DEFAULT_SHEET)).toThrow(/Symbol not found/);
  });

  it('snaps position to 20px grid', () => {
    const result = placeDevice(circuit, 'iec-coil', 113, 207, DEFAULT_SHEET);
    expect(result.circuit.positions[result.deviceId]).toEqual({ x: 120, y: 200 });
  });

  it('auto-generates unique IDs', () => {
    const r1 = placeDevice(circuit, 'iec-coil', 100, 200, DEFAULT_SHEET);
    const r2 = placeDevice(r1.circuit, 'iec-coil', 200, 200, DEFAULT_SHEET);
    expect(r1.deviceId).not.toBe(r2.deviceId);
    expect(r1.circuit.parts[0].id).not.toBe(r2.circuit.parts[1].id);
  });

  it('sets correct sheetId on device', () => {
    const result = placeDevice(circuit, 'iec-coil', 100, 200, 'custom-sheet');
    expect(result.circuit.devices[0].sheetId).toBe('custom-sheet');
  });
});

describe('deleteDevice', () => {
  it('removes device, position, and orphaned part', () => {
    let cd = emptyCircuit();
    const r = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r.circuit;

    cd = deleteDevice(cd, 'K1');
    expect(cd.devices).toHaveLength(0);
    expect(cd.parts).toHaveLength(0);
    expect(Object.keys(cd.positions)).toHaveLength(0);
  });

  it('cascades connections on delete', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r1.circuit;
    const r2 = placeDevice(cd, 'iec-normally-open-contact', 200, 200, DEFAULT_SHEET, 'S1');
    cd = r2.circuit;

    cd = createWire(cd, 'S1', '2', 'K1', '1', r2.deviceId, r1.deviceId);
    expect(cd.connections).toHaveLength(1);
    expect(cd.nets).toHaveLength(1);

    cd = deleteDevice(cd, 'K1');
    expect(cd.connections).toHaveLength(0);
    expect(cd.nets).toHaveLength(0);
  });

  it('throws on nonexistent device', () => {
    expect(() => deleteDevice(emptyCircuit(), 'NOPE')).toThrow(/not found/);
  });
});

describe('updateDevice', () => {
  it('renames tag and cascades to connections', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r1.circuit;
    const r2 = placeDevice(cd, 'iec-normally-open-contact', 200, 200, DEFAULT_SHEET, 'S1');
    cd = r2.circuit;

    cd = createWire(cd, 'S1', '2', 'K1', '1', r2.deviceId, r1.deviceId);

    cd = updateDevice(cd, 'K1', { tag: 'K5' });
    expect(cd.devices.find(d => d.id === r1.deviceId)!.tag).toBe('K5');
    expect(cd.connections[0].toDevice).toBe('K5');
  });

  it('updates function description', () => {
    let cd = emptyCircuit();
    const r = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    cd = updateDevice(r.circuit, 'K1', { function: 'Pump motor contactor' });
    expect(cd.devices[0].function).toBe('Pump motor contactor');
  });

  it('throws on nonexistent device', () => {
    expect(() => updateDevice(emptyCircuit(), 'X1', { tag: 'X2' })).toThrow(/not found/);
  });
});

// ─── Linked Devices ──────────────────────────────────────────────

describe('placeLinkedDevice', () => {
  it('shares tag and creates deviceGroupId', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-contactor-3p', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r1.circuit;

    const linked = placeLinkedDevice(cd, 'K1', 'iec-coil', 300, 200, DEFAULT_SHEET);
    cd = linked.circuit;

    const k1devices = cd.devices.filter(d => d.tag === 'K1');
    expect(k1devices).toHaveLength(2);

    // Both should share the same deviceGroupId
    const groupIds = k1devices.map(d => d.deviceGroupId).filter(Boolean);
    expect(groupIds).toHaveLength(2);
    expect(groupIds[0]).toBe(groupIds[1]);
  });

  it('backfills deviceGroupId on existing devices', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-contactor-3p', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r1.circuit;

    // Before linking, original device has no deviceGroupId
    expect(cd.devices[0].deviceGroupId).toBeUndefined();

    const linked = placeLinkedDevice(cd, 'K1', 'iec-coil', 300, 200, DEFAULT_SHEET);
    cd = linked.circuit;

    // After linking, original device now has deviceGroupId
    expect(cd.devices.find(d => d.id === r1.deviceId)!.deviceGroupId).toBeTruthy();
  });

  it('throws if source device not found', () => {
    expect(() => placeLinkedDevice(emptyCircuit(), 'NOPE', 'iec-coil', 0, 0, DEFAULT_SHEET)).toThrow(/No device with tag/);
  });

  it('throws on invalid symbol ID', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    expect(() => placeLinkedDevice(r1.circuit, 'K1', 'bad-symbol', 0, 0, DEFAULT_SHEET)).toThrow(/Symbol not found/);
  });

  it('creates separate position entry by device ID', () => {
    let cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-contactor-3p', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r1.circuit;

    const linked = placeLinkedDevice(cd, 'K1', 'iec-coil', 300, 400, DEFAULT_SHEET);
    cd = linked.circuit;

    expect(cd.positions[r1.deviceId]).toEqual({ x: 100, y: 200 });
    expect(cd.positions[linked.deviceId]).toEqual({ x: 300, y: 400 });
  });
});

// ─── Wires ───────────────────────────────────────────────────────

describe('createWire', () => {
  let cd: CircuitData;
  let d1Id: string;
  let d2Id: string;

  beforeEach(() => {
    cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-normally-open-contact', 100, 200, DEFAULT_SHEET, 'S1');
    cd = r1.circuit;
    d1Id = r1.deviceId;
    const r2 = placeDevice(cd, 'iec-coil', 300, 200, DEFAULT_SHEET, 'K1');
    cd = r2.circuit;
    d2Id = r2.deviceId;
  });

  it('creates net + connection with device IDs', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(cd.nets).toHaveLength(1);
    expect(cd.connections).toHaveLength(1);
    expect(cd.connections[0].fromDeviceId).toBe(d1Id);
    expect(cd.connections[0].toDeviceId).toBe(d2Id);
    expect(cd.connections[0].fromPin).toBe('2');
    expect(cd.connections[0].toPin).toBe('1');
  });

  it('validates pin IDs against symbol definition', () => {
    expect(() => createWire(cd, 'S1', 'INVALID', 'K1', '1', d1Id, d2Id)).toThrow(/Invalid pin/);
  });

  it('throws on invalid device', () => {
    expect(() => createWire(cd, 'NOPE', '1', 'K1', '1')).toThrow(/not found/);
  });

  it('throws on duplicate connection', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(() => createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id)).toThrow(/already exists/);
  });

  it('detects duplicate even when reversed', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(() => createWire(cd, 'K1', '1', 'S1', '2', d2Id, d1Id)).toThrow(/already exists/);
  });

  it('resolves by tag when deviceId not provided', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1');
    expect(cd.connections).toHaveLength(1);
    expect(cd.connections[0].fromDeviceId).toBe(d1Id);
  });
});

describe('deleteWire', () => {
  let cd: CircuitData;
  let d1Id: string;
  let d2Id: string;

  beforeEach(() => {
    cd = emptyCircuit();
    const r1 = placeDevice(cd, 'iec-normally-open-contact', 100, 200, DEFAULT_SHEET, 'S1');
    cd = r1.circuit;
    d1Id = r1.deviceId;
    const r2 = placeDevice(cd, 'iec-coil', 300, 200, DEFAULT_SHEET, 'K1');
    cd = r2.circuit;
    d2Id = r2.deviceId;
  });

  it('removes connection + orphaned net', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(cd.connections).toHaveLength(1);
    expect(cd.nets).toHaveLength(1);

    cd = deleteWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(cd.connections).toHaveLength(0);
    expect(cd.nets).toHaveLength(0);
  });

  it('keeps net when still referenced by other connections', () => {
    cd = createWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    const netId = cd.nets[0].id;

    // Add a third device and connect it to same net manually
    const r3 = placeDevice(cd, 'iec-pilot-light', 500, 200, DEFAULT_SHEET, 'PL1');
    cd = r3.circuit;
    cd = {
      ...cd,
      connections: [
        ...cd.connections,
        { fromDevice: 'K1', fromDeviceId: d2Id, fromPin: '2', toDevice: 'PL1', toDeviceId: r3.deviceId, toPin: '1', netId },
      ],
    };

    // Delete only S1→K1; net should survive because K1→PL1 still uses it
    cd = deleteWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id);
    expect(cd.connections).toHaveLength(1);
    expect(cd.nets).toHaveLength(1);
    expect(cd.nets[0].id).toBe(netId);
  });

  it('throws when wire not found', () => {
    expect(() => deleteWire(cd, 'S1', '2', 'K1', '1', d1Id, d2Id)).toThrow(/Wire not found/);
  });
});

// ─── Sheets ──────────────────────────────────────────────────────

describe('addSheet', () => {
  it('creates sheet with auto-numbered name', () => {
    const result = addSheet(emptyCircuit(), 'Power');
    expect(result.circuit.sheets).toHaveLength(1);
    expect(result.circuit.sheets![0].name).toBe('Power');
    expect(result.sheetId).toBeTruthy();
  });

  it('defaults name to "Sheet N"', () => {
    let cd = emptyCircuit();
    const r1 = addSheet(cd);
    cd = r1.circuit;
    expect(cd.sheets![0].name).toBe('Sheet 1');

    const r2 = addSheet(cd);
    expect(r2.circuit.sheets![1].name).toBe('Sheet 2');
  });

  it('bootstraps default sheet-1 when devices exist on it', () => {
    let cd = emptyCircuit();
    cd.sheets = [];
    cd.devices = [{ id: '1', type: 'device', tag: 'K1', function: '', partId: '', sheetId: 'sheet-1', createdAt: 0, modifiedAt: 0 }];

    const result = addSheet(cd, 'New Sheet');
    // Should have 2 sheets: bootstrapped sheet-1 + new sheet
    expect(result.circuit.sheets).toHaveLength(2);
    expect(result.circuit.sheets![0].id).toBe('sheet-1');
  });
});

describe('setSheetType', () => {
  it('sets ladder type with config', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;

    cd = setSheetType(cd, sheet.sheetId, 'ladder', { voltage: '24VDC' });
    const s = cd.sheets!.find(s => s.id === sheet.sheetId)!;
    expect(s.diagramType).toBe('ladder');
    expect(s.ladderConfig).toBeDefined();
    expect(s.ladderConfig!.voltage).toBe('24VDC');
  });

  it('sets schematic type without ladder config', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Power');
    cd = sheet.circuit;

    cd = setSheetType(cd, sheet.sheetId, 'schematic');
    const s = cd.sheets!.find(s => s.id === sheet.sheetId)!;
    expect(s.diagramType).toBe('schematic');
    expect(s.ladderConfig).toBeUndefined();
  });

  it('throws on missing sheet', () => {
    expect(() => setSheetType(emptyCircuit(), 'nonexistent', 'ladder')).toThrow(/not found/);
  });

  it('bootstraps virtual sheet-1', () => {
    const cd = emptyCircuit();
    cd.sheets = undefined as any;

    const result = setSheetType(cd, 'sheet-1', 'ladder');
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets![0].diagramType).toBe('ladder');
  });
});

// ─── Parts & Annotations ────────────────────────────────────────

describe('assignPart', () => {
  it('assigns part and preserves symbol category', () => {
    let cd = emptyCircuit();
    const r = placeDevice(cd, 'iec-coil', 100, 200, DEFAULT_SHEET, 'K1');
    cd = r.circuit;

    cd = assignPart(cd, 'K1', 'Allen-Bradley', '100-C09D10', '9A Contactor', 'contactor');

    // Should have replaced the placeholder part
    expect(cd.parts).toHaveLength(1);
    expect(cd.parts[0].manufacturer).toBe('Allen-Bradley');
    expect(cd.parts[0].partNumber).toBe('100-C09D10');
    // Symbol category preserved for rendering
    expect(cd.parts[0].category).toBe('iec-coil');
  });

  it('throws on nonexistent device', () => {
    expect(() => assignPart(emptyCircuit(), 'X1', 'Mfg', 'PN', 'Desc', 'cat')).toThrow(/not found/);
  });
});

describe('addAnnotation', () => {
  it('creates annotation with snapped position', () => {
    const result = addAnnotation(emptyCircuit(), DEFAULT_SHEET, 113, 207, 'Test note');
    expect(result.circuit.annotations).toHaveLength(1);
    expect(result.circuit.annotations![0].position).toEqual({ x: 120, y: 200 });
    expect(result.circuit.annotations![0].content).toBe('Test note');
    expect(result.circuit.annotations![0].sheetId).toBe(DEFAULT_SHEET);
  });
});

// ─── Ladder ──────────────────────────────────────────────────────

describe('addRung', () => {
  it('resolves tags to device IDs', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;
    cd = setSheetType(cd, sheet.sheetId, 'ladder');

    const d1 = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheet.sheetId, 'S1');
    cd = d1.circuit;
    const d2 = placeDevice(cd, 'iec-coil', 0, 0, sheet.sheetId, 'K1');
    cd = d2.circuit;

    const result = addRung(cd, sheet.sheetId, 1, ['S1', 'K1'], 'Test rung');
    cd = result.circuit;

    expect(cd.rungs).toHaveLength(1);
    expect(cd.rungs![0].deviceIds).toEqual([d1.deviceId, d2.deviceId]);
    expect(cd.rungs![0].number).toBe(1);
    expect(cd.rungs![0].description).toBe('Test rung');
  });

  it('throws when device tag not found', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;

    expect(() => addRung(cd, sheet.sheetId, 1, ['MISSING'])).toThrow(/not found/);
  });
});

describe('autoLayoutLadder', () => {
  it('positions devices and sets rotation=-90', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;
    cd = setSheetType(cd, sheet.sheetId, 'ladder');

    const d1 = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheet.sheetId, 'S1');
    cd = d1.circuit;
    const d2 = placeDevice(cd, 'iec-coil', 0, 0, sheet.sheetId, 'K1');
    cd = d2.circuit;

    const rung = addRung(cd, sheet.sheetId, 1, ['S1', 'K1']);
    cd = rung.circuit;

    const result = autoLayoutLadder(cd, sheet.sheetId);
    cd = result.circuit;

    // Should have positioned devices
    expect(cd.positions[d1.deviceId]).toBeDefined();
    expect(cd.positions[d2.deviceId]).toBeDefined();

    // Should set rotation to -90 for horizontal current flow
    expect(cd.transforms![d1.deviceId]).toEqual({ rotation: -90 });
    expect(cd.transforms![d2.deviceId]).toEqual({ rotation: -90 });

    expect(result.layoutSummary.rungCount).toBe(1);
    expect(result.layoutSummary.deviceCount).toBe(2);
  });

  it('throws on non-ladder sheet', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Power');
    cd = sheet.circuit;
    cd = setSheetType(cd, sheet.sheetId, 'schematic');

    expect(() => autoLayoutLadder(cd, sheet.sheetId)).toThrow(/not a ladder/);
  });

  it('throws on missing sheet', () => {
    expect(() => autoLayoutLadder(emptyCircuit(), 'nonexistent')).toThrow(/not found/);
  });
});

describe('createLadderRails', () => {
  it('creates junction devices and rail wires for a simple ladder', () => {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;
    cd = setSheetType(cd, sheet.sheetId, 'ladder');

    const d1 = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheet.sheetId, 'S1');
    cd = d1.circuit;
    const d2 = placeDevice(cd, 'iec-coil', 0, 0, sheet.sheetId, 'K1');
    cd = d2.circuit;

    const rung = addRung(cd, sheet.sheetId, 1, ['S1', 'K1']);
    cd = rung.circuit;

    const layout = autoLayoutLadder(cd, sheet.sheetId);
    cd = layout.circuit;

    const beforeDeviceCount = cd.devices.length;
    cd = createLadderRails(cd, sheet.sheetId);

    // Should have added 2 junction devices (JL1 and JR1 for 1 rung)
    expect(cd.devices.length).toBe(beforeDeviceCount + 2);
    expect(cd.devices.some(d => d.tag === 'JL1')).toBe(true);
    expect(cd.devices.some(d => d.tag === 'JR1')).toBe(true);

    // Should have 2 horizontal wires (JL1→S1, K1→JR1)
    expect(cd.connections.length).toBe(2);
  });
});

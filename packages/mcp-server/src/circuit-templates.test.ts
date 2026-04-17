import { describe, it, expect } from 'vitest';
import type { CircuitData } from './api-client.js';
import { generateMotorStarter, generateMotorStarterPanel, addControlRung } from './circuit-templates.js';
import { addSheet, setSheetType, placeDevice } from './circuit-helpers.js';

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

// ─── generateMotorStarter ────────────────────────────────────────

describe('generateMotorStarter', () => {
  it('creates 2 sheets (Power + Control)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit } = result;
    expect(circuit.sheets).toHaveLength(2);
    expect(circuit.sheets![0].name).toBe('Power');
    expect(circuit.sheets![1].name).toBe('Control');
  });

  it('Power sheet has 11 devices (X1:1-3, CB1, K1, F1, X2:1-3, M1, PE1)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, powerSheetId } = result;
    const powerDevices = circuit.devices.filter(d => d.sheetId === powerSheetId);
    expect(powerDevices).toHaveLength(11);

    const tags = powerDevices.map(d => d.tag).sort();
    expect(tags).toEqual(['CB1', 'F1', 'K1', 'M1', 'PE1', 'X1:1', 'X1:2', 'X1:3', 'X2:1', 'X2:2', 'X2:3']);
  });

  it('Power sheet has 15 phase wires (3 phases x 5 hops through terminals)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, powerSheetId } = result;
    const powerDeviceIds = new Set(
      circuit.devices.filter(d => d.sheetId === powerSheetId).map(d => d.id),
    );

    // Count connections where both endpoints are power sheet devices
    const powerWires = circuit.connections.filter(
      c => powerDeviceIds.has(c.fromDeviceId!) && powerDeviceIds.has(c.toDeviceId!),
    );
    expect(powerWires).toHaveLength(15);
  });

  it('Control sheet has a ladder block', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlBlocks = (circuit.blocks || []).filter(
      b => b.sheetId === controlSheetId && b.blockType === 'ladder',
    );
    expect(controlBlocks).toHaveLength(1);
  });

  it('Control sheet has 3 rungs (rung 2 is branch of 1)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlRungs = circuit.rungs!.filter(r => r.sheetId === controlSheetId);
    expect(controlRungs).toHaveLength(3);

    const rung2 = controlRungs.find(r => r.number === 2);
    expect(rung2!.branchOf).toBe(1);
  });

  it('K1 shares deviceGroupId across power and control sheets', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit } = result;
    const k1devices = circuit.devices.filter(d => d.tag === 'K1');
    // K1 should appear on power sheet AND as linked devices on control
    expect(k1devices.length).toBeGreaterThanOrEqual(2);

    const groupIds = k1devices.map(d => d.deviceGroupId).filter(Boolean);
    expect(groupIds.length).toBeGreaterThanOrEqual(2);
    // All share the same groupId
    expect(new Set(groupIds).size).toBe(1);
  });

  it('F1 shares deviceGroupId across power and control sheets', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit } = result;
    const f1devices = circuit.devices.filter(d => d.tag === 'F1');
    expect(f1devices.length).toBeGreaterThanOrEqual(2);

    const groupIds = f1devices.map(d => d.deviceGroupId).filter(Boolean);
    expect(groupIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(groupIds).size).toBe(1);
  });

  it('120VAC variant uses L1/L2 rail labels', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const ladderBlock = (circuit.blocks || []).find(
      b => b.sheetId === controlSheetId && b.blockType === 'ladder',
    ) as any;
    expect(ladderBlock).toBeDefined();
    expect(ladderBlock.ladderConfig.railLabelL1).toBe('L1');
    expect(ladderBlock.ladderConfig.railLabelL2).toBe('L2');
  });

  it('24VDC variant uses +24V/0V rail labels', () => {
    const result = generateMotorStarter(emptyCircuit(), '24VDC', 'M1');
    const { circuit, controlSheetId } = result;
    const ladderBlock = (circuit.blocks || []).find(
      b => b.sheetId === controlSheetId && b.blockType === 'ladder',
    ) as any;
    expect(ladderBlock).toBeDefined();
    expect(ladderBlock.ladderConfig.railLabelL1).toBe('+24V');
    expect(ladderBlock.ladderConfig.railLabelL2).toBe('0V');
  });

  it('generates expected total device and connection counts', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit } = result;

    // 11 power (X1:1-3, CB1, K1, F1, X2:1-3, M1, PE1) + 10 control + 5 rail junctions = 26 devices
    expect(circuit.devices.length).toBe(26);
    // 15 power + 8 control rung + 8 rail = 31 connections
    expect(circuit.connections.length).toBe(31);
  });

  it('all control devices have positions and transforms set', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlDevices = circuit.devices.filter(d => d.sheetId === controlSheetId);

    for (const device of controlDevices) {
      expect(circuit.positions[device.id]).toBeDefined();
    }
  });

  it('power devices use pin-based alignment (no hardcoded Y values)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, powerSheetId } = result;
    const powerDevices = circuit.devices.filter(d => d.sheetId === powerSheetId);

    // CB1 should be below X1 terminals, K1 below CB1, etc.
    const getY = (tag: string) => {
      const dev = powerDevices.find(d => d.tag === tag)!;
      return circuit.positions[dev.id]?.y;
    };

    expect(getY('X1:1')).toBeLessThan(getY('CB1'));
    expect(getY('CB1')).toBeLessThan(getY('K1'));
    expect(getY('K1')).toBeLessThan(getY('F1'));
    expect(getY('F1')).toBeLessThan(getY('X2:1'));
    expect(getY('X2:1')).toBeLessThan(getY('M1'));
  });
});

// ─── addControlRung ──────────────────────────────────────────────

describe('addControlRung', () => {
  function setupLadderSheet(): { circuit: CircuitData; sheetId: string } {
    let cd = emptyCircuit();
    const sheet = addSheet(cd, 'Control');
    cd = sheet.circuit;
    cd = setSheetType(cd, sheet.sheetId, 'ladder');
    return { circuit: cd, sheetId: sheet.sheetId };
  }

  it('indicator rung: creates contact + pilot light + wires them', () => {
    const { circuit, sheetId } = setupLadderSheet();
    const result = addControlRung(circuit, sheetId, 'indicator', 1);
    const { circuit: cd, deviceTags } = result;

    expect(deviceTags).toHaveLength(2);

    // Should have 2 new devices (contact + pilot light)
    const sheetDevices = cd.devices.filter(d => d.sheetId === sheetId);
    expect(sheetDevices).toHaveLength(2);

    // Should have 1 wire connecting them
    expect(cd.connections).toHaveLength(1);

    // Should have 1 rung
    expect(cd.rungs).toHaveLength(1);
    expect(cd.rungs![0].description).toBe('Indicator');
  });

  it('timer-on-delay rung: creates contact + timer', () => {
    const { circuit, sheetId } = setupLadderSheet();
    const result = addControlRung(circuit, sheetId, 'timer-on-delay', 1);
    const { circuit: cd, deviceTags } = result;

    expect(deviceTags).toHaveLength(2);

    // Find the timer device
    const timerDevice = cd.devices.find(d => d.tag === deviceTags[1]);
    expect(timerDevice).toBeDefined();
    // Timer part should reference iec-on-delay-timer symbol
    const timerPart = cd.parts.find(p => p.id === timerDevice!.partId);
    expect(timerPart!.category).toBe('iec-on-delay-timer');

    expect(cd.rungs![0].description).toBe('On-delay timer');
  });

  it('timer-off-delay rung: creates contact + timer', () => {
    const { circuit, sheetId } = setupLadderSheet();
    const result = addControlRung(circuit, sheetId, 'timer-off-delay', 1);
    const { circuit: cd, deviceTags } = result;

    const timerDevice = cd.devices.find(d => d.tag === deviceTags[1]);
    const timerPart = cd.parts.find(p => p.id === timerDevice!.partId);
    expect(timerPart!.category).toBe('iec-off-delay-timer');
    expect(cd.rungs![0].description).toBe('Off-delay timer');
  });

  it('linked contact: uses placeLinkedDevice when contactTag provided', () => {
    let { circuit, sheetId } = setupLadderSheet();

    // First place a K1 device to link against
    const k1 = placeDevice(circuit, 'iec-coil', 0, 0, sheetId, 'K1');
    circuit = k1.circuit;

    const result = addControlRung(circuit, sheetId, 'indicator', 1, { contactTag: 'K1' });
    const { circuit: cd, deviceTags } = result;

    // First device tag should be K1 (linked)
    expect(deviceTags[0]).toBe('K1');

    // K1 should now have multiple representations
    const k1devices = cd.devices.filter(d => d.tag === 'K1');
    expect(k1devices.length).toBe(2);
  });

  it('custom tag and description applied correctly', () => {
    const { circuit, sheetId } = setupLadderSheet();
    const result = addControlRung(circuit, sheetId, 'indicator', 1, {
      tag: 'PL5',
      description: 'Fault indicator',
    });
    const { circuit: cd, deviceTags } = result;

    expect(deviceTags[1]).toBe('PL5');
    expect(cd.rungs![0].description).toBe('Fault indicator');
  });

  it('auto-layouts after adding rung', () => {
    const { circuit, sheetId } = setupLadderSheet();
    const result = addControlRung(circuit, sheetId, 'indicator', 1);
    const { circuit: cd } = result;

    // All devices should have positions set by auto-layout
    const sheetDevices = cd.devices.filter(d => d.sheetId === sheetId);
    for (const device of sheetDevices) {
      expect(cd.positions[device.id]).toBeDefined();
    }

    // All devices should have transforms (rotation = -90)
    for (const device of sheetDevices) {
      expect(cd.transforms![device.id]).toEqual({ rotation: -90 });
    }
  });
});

// ─── generateMotorStarterPanel (Hoffman BOM rows) ────────────────

describe('generateMotorStarterPanel with panelLayout', () => {
  function findDevice(cd: CircuitData, tag: string) {
    return cd.devices.find(d => d.tag === tag);
  }
  function findPart(cd: CircuitData, partId: string | undefined) {
    return partId ? cd.parts.find(p => p.id === partId) : undefined;
  }

  it('assigns the A201608LP enclosure + A20P16 subpanel for small motors (hp ≤ 10)', () => {
    const { circuit } = generateMotorStarterPanel(emptyCircuit(), {
      hp: '5', voltage: '480VAC', panelLayout: true,
    });
    const pnl = findDevice(circuit, 'PNL1');
    const sp = findDevice(circuit, 'SP1');
    expect(pnl, 'PNL1 should be placed').toBeDefined();
    expect(sp, 'SP1 should be placed').toBeDefined();

    const pnlPart = findPart(circuit, pnl!.partId);
    const spPart = findPart(circuit, sp!.partId);
    expect(pnlPart?.manufacturer).toBe('Hoffman');
    expect(pnlPart?.partNumber).toBe('A201608LP');
    expect(spPart?.manufacturer).toBe('Hoffman');
    expect(spPart?.partNumber).toBe('A20P16');
  });

  it('scales to A242008LP / A24P20 for medium motors (10 < hp ≤ 30)', () => {
    const { circuit } = generateMotorStarterPanel(emptyCircuit(), {
      hp: '20', voltage: '480VAC', panelLayout: true,
    });
    const pnlPart = findPart(circuit, findDevice(circuit, 'PNL1')!.partId);
    const spPart = findPart(circuit, findDevice(circuit, 'SP1')!.partId);
    expect(pnlPart?.partNumber).toBe('A242008LP');
    expect(spPart?.partNumber).toBe('A24P20');
  });

  it('scales to A302408LP / A30P24 for large motors (hp > 30)', () => {
    const { circuit } = generateMotorStarterPanel(emptyCircuit(), {
      hp: '50', voltage: '480VAC', panelLayout: true,
    });
    const pnlPart = findPart(circuit, findDevice(circuit, 'PNL1')!.partId);
    const spPart = findPart(circuit, findDevice(circuit, 'SP1')!.partId);
    expect(pnlPart?.partNumber).toBe('A302408LP');
    expect(spPart?.partNumber).toBe('A30P24');
  });

  it('preserves the layout symbol category on the assigned part (rendering key)', () => {
    // assignPart() explicitly keeps oldPart.category so the renderer still
    // knows which symbol to draw. Regression guard.
    const { circuit } = generateMotorStarterPanel(emptyCircuit(), {
      hp: '5', voltage: '480VAC', panelLayout: true,
    });
    const pnlPart = findPart(circuit, findDevice(circuit, 'PNL1')!.partId);
    const spPart = findPart(circuit, findDevice(circuit, 'SP1')!.partId);
    expect(pnlPart?.category).toBe('panel-enclosure-20x16');
    expect(spPart?.category).toBe('panel-subpanel-20x16');
  });
});

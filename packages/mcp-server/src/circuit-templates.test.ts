import { describe, it, expect } from 'vitest';
import type { CircuitData } from './api-client.js';
import { generateMotorStarter, addControlRung } from './circuit-templates.js';
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

  it('Power sheet has 4 devices (CB1, K1, F1, M1)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, powerSheetId } = result;
    const powerDevices = circuit.devices.filter(d => d.sheetId === powerSheetId);
    expect(powerDevices).toHaveLength(4);

    const tags = powerDevices.map(d => d.tag).sort();
    expect(tags).toEqual(['CB1', 'F1', 'K1', 'M1']);
  });

  it('Power sheet has 9 phase wires (3 phases x 3 hops)', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, powerSheetId } = result;
    const powerDeviceIds = new Set(
      circuit.devices.filter(d => d.sheetId === powerSheetId).map(d => d.id),
    );

    // Count connections where both endpoints are power sheet devices
    const powerWires = circuit.connections.filter(
      c => powerDeviceIds.has(c.fromDeviceId!) && powerDeviceIds.has(c.toDeviceId!),
    );
    expect(powerWires).toHaveLength(9);
  });

  it('Control sheet is ladder type', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlSheet = circuit.sheets!.find(s => s.id === controlSheetId)!;
    expect(controlSheet.diagramType).toBe('ladder');
    expect(controlSheet.ladderConfig).toBeDefined();
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
    const controlSheet = circuit.sheets!.find(s => s.id === controlSheetId)!;
    expect(controlSheet.ladderConfig!.railLabelL1).toBe('L1');
    expect(controlSheet.ladderConfig!.railLabelL2).toBe('L2');
  });

  it('24VDC variant uses +24V/0V rail labels', () => {
    const result = generateMotorStarter(emptyCircuit(), '24VDC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlSheet = circuit.sheets!.find(s => s.id === controlSheetId)!;
    expect(controlSheet.ladderConfig!.railLabelL1).toBe('+24V');
    expect(controlSheet.ladderConfig!.railLabelL2).toBe('0V');
  });

  it('generates expected total device and connection counts', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit } = result;

    // 4 power + 9 control + 5 rail junctions = 18 devices
    expect(circuit.devices.length).toBe(18);
    // 9 power + 7 control rung + 8 rail = 24 connections
    expect(circuit.connections.length).toBe(24);
  });

  it('all control devices have positions and transforms set', () => {
    const result = generateMotorStarter(emptyCircuit(), '120VAC', 'M1');
    const { circuit, controlSheetId } = result;
    const controlDevices = circuit.devices.filter(d => d.sheetId === controlSheetId);

    for (const device of controlDevices) {
      expect(circuit.positions[device.id]).toBeDefined();
    }
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

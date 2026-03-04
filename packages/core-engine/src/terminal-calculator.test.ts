import { describe, it, expect } from 'vitest';
import {
  classifyDeviceLocation,
  classifyLocationByKeyword,
  classifyLocationByTagPrefix,
  calculateTerminalBlocks,
  type TerminalCalcCircuitData,
  type TerminalCalcConnection,
} from './terminal-calculator.js';
import type { Device, Part, Net } from '@fusion-cad/core-model';

// ── Helpers ─────────────────────────────────────────────────────────

function makeDevice(tag: string, opts?: { symbolId?: string; partId?: string }): Device {
  return {
    id: `dev-${tag}`,
    type: 'device',
    tag,
    function: '',
    partId: opts?.partId,
    sheetId: 'sheet-1',
    symbolId: opts?.symbolId,
  } as any;
}

function makePart(id: string, category: string): Part {
  return {
    id,
    type: 'part',
    manufacturer: 'Test',
    partNumber: 'TEST-001',
    description: 'Test part',
    category,
    attributes: {},
  } as any;
}

function makeNet(id: string, name: string, netType: 'power' | 'signal' | 'ground' | 'pe' = 'signal'): Net {
  return { id, type: 'net', name, netType } as any;
}

function makeConnection(
  from: string, fromPin: string,
  to: string, toPin: string,
  netId: string,
  wireNumber?: string,
): TerminalCalcConnection {
  return {
    fromDevice: from, fromPin,
    toDevice: to, toPin,
    netId,
    wireNumber,
  };
}

// ── Location Classification by Keyword ──────────────────────────────

describe('classifyLocationByKeyword', () => {
  it('classifies PLC as panel', () => {
    expect(classifyLocationByKeyword('iec-plc-cpu')).toBe('panel');
  });

  it('classifies contactor as panel', () => {
    expect(classifyLocationByKeyword('iec-contactor-3p')).toBe('panel');
  });

  it('classifies breaker as panel', () => {
    expect(classifyLocationByKeyword('iec-circuit-breaker-3p')).toBe('panel');
  });

  it('classifies relay as panel', () => {
    expect(classifyLocationByKeyword('iec-relay-coil')).toBe('panel');
  });

  it('classifies transformer as panel', () => {
    expect(classifyLocationByKeyword('iec-transformer-3ph')).toBe('panel');
  });

  it('classifies power supply as panel', () => {
    expect(classifyLocationByKeyword('iec-power-supply-ac-dc')).toBe('panel');
  });

  it('classifies motor as field', () => {
    expect(classifyLocationByKeyword('iec-motor-3ph')).toBe('field');
  });

  it('classifies pushbutton as field', () => {
    expect(classifyLocationByKeyword('iec-pushbutton-no')).toBe('field');
  });

  it('classifies selector switch as field', () => {
    expect(classifyLocationByKeyword('iec-selector-switch')).toBe('field');
  });

  it('classifies e-stop as field', () => {
    expect(classifyLocationByKeyword('iec-emergency-stop')).toBe('field');
    expect(classifyLocationByKeyword('iec-e-stop')).toBe('field');
  });

  it('classifies pilot light as field', () => {
    expect(classifyLocationByKeyword('iec-pilot-light')).toBe('field');
  });

  it('classifies sensor as field', () => {
    expect(classifyLocationByKeyword('iec-proximity-sensor')).toBe('field');
  });

  it('classifies horn as field', () => {
    expect(classifyLocationByKeyword('iec-horn')).toBe('field');
  });

  it('returns unknown for unrecognized', () => {
    expect(classifyLocationByKeyword('some-random-thing')).toBe('unknown');
  });
});

// ── Location Classification by Tag Prefix ───────────────────────────

describe('classifyLocationByTagPrefix', () => {
  it('K1 → panel', () => expect(classifyLocationByTagPrefix('K1')).toBe('panel'));
  it('KM1 → panel', () => expect(classifyLocationByTagPrefix('KM1')).toBe('panel'));
  it('Q1 → panel', () => expect(classifyLocationByTagPrefix('Q1')).toBe('panel'));
  it('QF1 → panel', () => expect(classifyLocationByTagPrefix('QF1')).toBe('panel'));
  it('CB1 → panel', () => expect(classifyLocationByTagPrefix('CB1')).toBe('panel'));
  it('F1 → panel', () => expect(classifyLocationByTagPrefix('F1')).toBe('panel'));
  it('FU1 → panel', () => expect(classifyLocationByTagPrefix('FU1')).toBe('panel'));
  it('OL1 → panel', () => expect(classifyLocationByTagPrefix('OL1')).toBe('panel'));
  it('PS1 → panel', () => expect(classifyLocationByTagPrefix('PS1')).toBe('panel'));
  it('T1 → panel', () => expect(classifyLocationByTagPrefix('T1')).toBe('panel'));
  it('PLC1 → panel', () => expect(classifyLocationByTagPrefix('PLC1')).toBe('panel'));

  it('M1 → field', () => expect(classifyLocationByTagPrefix('M1')).toBe('field'));
  it('S1 → field', () => expect(classifyLocationByTagPrefix('S1')).toBe('field'));
  it('SS1 → field', () => expect(classifyLocationByTagPrefix('SS1')).toBe('field'));
  it('H1 → field', () => expect(classifyLocationByTagPrefix('H1')).toBe('field'));
  it('PL1 → field', () => expect(classifyLocationByTagPrefix('PL1')).toBe('field'));
  it('B1 → field', () => expect(classifyLocationByTagPrefix('B1')).toBe('field'));

  it('unknown prefix → unknown', () => expect(classifyLocationByTagPrefix('ZZ1')).toBe('unknown'));
});

// ── Classification Priority ─────────────────────────────────────────

describe('classifyDeviceLocation priority', () => {
  it('symbolId keyword beats tag prefix', () => {
    // Tag K1 → panel, but symbolId motor → field
    const device = makeDevice('K1', { symbolId: 'iec-motor-3ph' });
    expect(classifyDeviceLocation(device, [])).toBe('field');
  });

  it('part category used when no symbolId match', () => {
    const device = makeDevice('X1', { partId: 'p1' });
    const parts = [makePart('p1', 'contactor')];
    expect(classifyDeviceLocation(device, parts)).toBe('panel');
  });

  it('falls back to tag prefix', () => {
    const device = makeDevice('M1');
    expect(classifyDeviceLocation(device, [])).toBe('field');
  });

  it('junction devices return unknown', () => {
    const device = makeDevice('JL1', { symbolId: 'junction' });
    expect(classifyDeviceLocation(device, [])).toBe('unknown');
  });

  it('JL/JR tag prefix returns unknown', () => {
    const device = makeDevice('JR1');
    expect(classifyDeviceLocation(device, [])).toBe('unknown');
  });
});

// ── Boundary Detection ──────────────────────────────────────────────

describe('boundary detection', () => {
  it('panel↔field creates 1 terminal', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-coil' }),  // panel
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),    // field
      ],
      parts: [],
      connections: [makeConnection('K1', 'A1', 'S1', 'NO', 'net-1')],
      nets: [makeNet('net-1', 'CTRL', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections).toHaveLength(1);
    expect(result.terminals).toHaveLength(1);
  });

  it('panel↔panel creates 0 terminals', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-coil' }),
        makeDevice('OL1', { symbolId: 'iec-thermal-overload-relay' }),
      ],
      parts: [],
      connections: [makeConnection('K1', 'A1', 'OL1', 'T1', 'net-1')],
      nets: [makeNet('net-1', 'CTRL', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections).toHaveLength(0);
    expect(result.terminals).toHaveLength(0);
  });

  it('field↔field creates 0 terminals (same side)', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),
      ],
      parts: [],
      connections: [makeConnection('M1', 'U1', 'S1', 'NO', 'net-1')],
      nets: [makeNet('net-1', 'CTRL', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections).toHaveLength(0);
    expect(result.terminals).toHaveLength(0);
  });

  it('unknown device generates warning', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-coil' }),  // panel
        makeDevice('ZZ1'),                                       // unknown
      ],
      parts: [],
      connections: [makeConnection('K1', 'A1', 'ZZ1', 'pin-1', 'net-1')],
      nets: [makeNet('net-1', 'CTRL', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.warnings).toContainEqual(
      expect.stringContaining('Cannot classify device "ZZ1"')
    );
  });
});

// ── Wire Classification ─────────────────────────────────────────────

describe('wire classification', () => {
  it('PE net → ground terminal', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      parts: [],
      connections: [makeConnection('K1', 'PE', 'M1', 'PE', 'net-pe')],
      nets: [makeNet('net-pe', 'PE', 'pe')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections[0].wireClass).toBe('ground');
    expect(result.boundaryConnections[0].stripTag).toBe('XPE');
  });

  it('motor wire → power terminal', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      parts: [],
      connections: [makeConnection('K1', 'T1', 'M1', 'U1', 'net-1')],
      nets: [makeNet('net-1', 'Motor-U', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections[0].wireClass).toBe('power');
    expect(result.boundaryConnections[0].stripTag).toBe('X1');
  });

  it('PLC I/O → control terminal', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('PLC1', { symbolId: 'iec-plc-cpu' }),
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),
      ],
      parts: [],
      connections: [makeConnection('PLC1', 'DI0', 'S1', 'NO', 'net-1')],
      nets: [makeNet('net-1', 'DI-0', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections[0].wireClass).toBe('control');
    expect(result.boundaryConnections[0].stripTag).toBe('X2');
  });
});

// ── Strip Grouping ──────────────────────────────────────────────────

describe('strip grouping', () => {
  it('functional naming groups power→X1, control→X2, ground→XPE', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
        makeDevice('PLC1', { symbolId: 'iec-plc-cpu' }),
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),
      ],
      parts: [],
      connections: [
        makeConnection('K1', 'T1', 'M1', 'U1', 'net-motor'),
        makeConnection('PLC1', 'DI0', 'S1', 'NO', 'net-ctrl'),
        makeConnection('K1', 'PE', 'M1', 'PE', 'net-pe'),
      ],
      nets: [
        makeNet('net-motor', 'Motor-U', 'signal'),
        makeNet('net-ctrl', 'DI-0', 'signal'),
        makeNet('net-pe', 'PE', 'pe'),
      ],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.summary.byStrip).toEqual({ X1: 1, X2: 1, XPE: 1 });
  });

  it('sequential naming puts all on X1', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
        makeDevice('PLC1', { symbolId: 'iec-plc-cpu' }),
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),
      ],
      parts: [],
      connections: [
        makeConnection('K1', 'T1', 'M1', 'U1', 'net-motor'),
        makeConnection('PLC1', 'DI0', 'S1', 'NO', 'net-ctrl'),
      ],
      nets: [
        makeNet('net-motor', 'Motor-U', 'signal'),
        makeNet('net-ctrl', 'DI-0', 'signal'),
      ],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0, stripNaming: 'sequential' });
    expect(Object.keys(result.summary.byStrip)).toEqual(['X1']);
    expect(result.summary.byStrip['X1']).toBe(2);
  });
});

// ── Part Selection ──────────────────────────────────────────────────

describe('part selection', () => {
  it('assigns correct Phoenix Contact parts per type', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      parts: [],
      connections: [
        makeConnection('K1', 'T1', 'M1', 'U1', 'net-1'),
        makeConnection('K1', 'PE', 'M1', 'PE', 'net-pe'),
      ],
      nets: [
        makeNet('net-1', 'Motor-U', 'signal'),
        makeNet('net-pe', 'PE', 'pe'),
      ],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    // Should have power part (UT 4), ground part (UTTB 2.5-PE), and end cover
    const partNumbers = result.parts.map(p => p.partNumber);
    expect(partNumbers).toContain('3044102'); // UT 4
    expect(partNumbers).toContain('3213974'); // UTTB 2.5-PE
    expect(partNumbers).toContain('3070048'); // End cover
  });

  it('generates end covers for each strip', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      parts: [],
      connections: [makeConnection('K1', 'T1', 'M1', 'U1', 'net-1')],
      nets: [makeNet('net-1', 'Motor-U', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    const endCovers = result.parts.filter(p => p.partNumber === '3070048');
    expect(endCovers).toHaveLength(1); // 1 end cover part (shared)
  });
});

// ── Integration: Motor Starter Circuit ──────────────────────────────

describe('integration: motor starter', () => {
  function makeMotorStarterCircuit(): TerminalCalcCircuitData {
    return {
      devices: [
        // Panel devices
        makeDevice('CB1', { symbolId: 'iec-circuit-breaker-3p' }),
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('OL1', { symbolId: 'iec-thermal-overload-relay' }),
        // Field devices
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
        makeDevice('S1', { symbolId: 'iec-pushbutton-no' }),   // start
        makeDevice('S2', { symbolId: 'iec-pushbutton-no' }),   // stop (NC)
        makeDevice('PL1', { symbolId: 'iec-pilot-light' }),
      ],
      parts: [],
      connections: [
        // Power: OL→Motor (3 phases)
        makeConnection('OL1', 'T1', 'M1', 'U1', 'net-u', 'W101'),
        makeConnection('OL1', 'T2', 'M1', 'V1', 'net-v', 'W102'),
        makeConnection('OL1', 'T3', 'M1', 'W1', 'net-w', 'W103'),
        // Ground
        makeConnection('K1', 'PE', 'M1', 'PE', 'net-pe'),
        // Control: panel K1 coil ↔ field pushbuttons
        makeConnection('K1', 'A1', 'S1', 'NO', 'net-ctrl1', 'W201'),
        makeConnection('K1', 'A2', 'S2', 'NC', 'net-ctrl2', 'W202'),
        // Pilot light (field)
        makeConnection('K1', 'AUX-NO', 'PL1', 'pin-left', 'net-ctrl3', 'W203'),
      ],
      nets: [
        makeNet('net-u', 'Motor-U', 'signal'),
        makeNet('net-v', 'Motor-V', 'signal'),
        makeNet('net-w', 'Motor-W', 'signal'),
        makeNet('net-pe', 'PE', 'pe'),
        makeNet('net-ctrl1', 'CTRL-1', 'signal'),
        makeNet('net-ctrl2', 'CTRL-2', 'signal'),
        makeNet('net-ctrl3', 'CTRL-3', 'signal'),
      ],
    };
  }

  it('generates correct terminal count for motor starter', () => {
    const circuit = makeMotorStarterCircuit();
    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });

    // 3 power (motor phases) + 1 ground + 3 control (start, stop, pilot)
    expect(result.boundaryConnections).toHaveLength(7);
    expect(result.summary.totalTerminals).toBe(7);
    expect(result.summary.byType).toEqual({ power: 3, ground: 1, control: 3 });
    expect(result.summary.byStrip).toEqual({ X1: 3, XPE: 1, X2: 3 });
  });

  it('adds spare terminals at 10%', () => {
    const circuit = makeMotorStarterCircuit();
    const result = calculateTerminalBlocks(circuit, { sparePercent: 10 });

    // 7 real + spares: ceil(3*0.1)=1 for X1, ceil(1*0.1)=1 for XPE, ceil(3*0.1)=1 for X2 = 3 spares
    expect(result.summary.spareTerminals).toBe(3);
    expect(result.summary.totalTerminals).toBe(10);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty circuit returns empty result with warning', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [],
      parts: [],
      connections: [],
      nets: [],
    };

    const result = calculateTerminalBlocks(circuit);
    expect(result.terminals).toHaveLength(0);
    expect(result.summary.totalTerminals).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('No boundary connections');
  });

  it('junction devices are skipped', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('JL1', { symbolId: 'junction' }),
        makeDevice('K1', { symbolId: 'iec-contactor-coil' }),
      ],
      parts: [],
      connections: [makeConnection('JL1', 'pin-1', 'K1', 'A1', 'net-1')],
      nets: [makeNet('net-1', 'L1', 'power')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    // JL1 is unknown (junction) + K1 is panel → skipped (panel↔unknown warning)
    expect(result.boundaryConnections).toHaveLength(0);
  });

  it('preserves wire numbers from connections', () => {
    const circuit: TerminalCalcCircuitData = {
      devices: [
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      parts: [],
      connections: [makeConnection('K1', 'T1', 'M1', 'U1', 'net-1', 'W101')],
      nets: [makeNet('net-1', 'Motor-U', 'signal')],
    };

    const result = calculateTerminalBlocks(circuit, { sparePercent: 0 });
    expect(result.boundaryConnections[0].wireNumber).toBe('W101');
    expect(result.terminals[0].levels[0].wireNumberIn).toBe('W101');
  });
});

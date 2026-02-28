import { describe, it, expect } from 'vitest';
import { runERC } from './erc.js';
import type { ERCCircuitData } from './erc.js';
import type { Device, Net, Part } from '@fusion-cad/core-model';

function makeDevice(tag: string, opts?: { symbolId?: string; sheetId?: string }): Device {
  return {
    id: `dev-${tag}`,
    type: 'device',
    tag,
    sheetId: opts?.sheetId || 'sheet-1',
    symbolId: opts?.symbolId,
  } as any;
}

function makeNet(id: string, name: string, netType: 'power' | 'signal'): Net {
  return { id, type: 'net', name, netType } as any;
}

describe('checkHotToNeutralShort (via runERC)', () => {
  it('flags bare wire from L1 to L2 through junctions only', () => {
    const circuit: ERCCircuitData = {
      devices: [
        makeDevice('J1', { symbolId: 'junction' }),
        makeDevice('J2', { symbolId: 'junction' }),
      ],
      nets: [
        makeNet('net-l1', 'L1', 'power'),
        makeNet('net-l2', 'L2', 'power'),
        makeNet('net-wire', 'W1', 'signal'),
      ],
      parts: [],
      connections: [
        // J1 is on L1 net, J2 is on L2 net, they're connected through net-wire
        { fromDevice: 'J1', fromPin: '1', toDevice: 'J1', toPin: '2', netId: 'net-l1' },
        { fromDevice: 'J1', fromPin: '2', toDevice: 'J2', toPin: '1', netId: 'net-wire' },
        { fromDevice: 'J2', fromPin: '1', toDevice: 'J2', toPin: '2', netId: 'net-l2' },
      ],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    expect(shorts.length).toBeGreaterThan(0);
    expect(shorts[0].severity).toBe('error');
  });

  it('flags switch-only path from L1 to L2 (no load)', () => {
    // S1 → S2, both are switching devices, connected between L1 and L2
    const circuit: ERCCircuitData = {
      devices: [
        makeDevice('S1', { symbolId: 'iec-manual-switch' }),
        makeDevice('S2', { symbolId: 'iec-manual-switch' }),
      ],
      nets: [
        makeNet('net-l1', 'L1', 'power'),
        makeNet('net-l2', 'L2', 'power'),
        makeNet('net-1', 'W1', 'signal'),
      ],
      parts: [],
      connections: [
        // S1 is on L1 net
        { fromDevice: 'S1', fromPin: '1', toDevice: 'S1', toPin: '1', netId: 'net-l1' },
        // S1 connects to S2
        { fromDevice: 'S1', fromPin: '2', toDevice: 'S2', toPin: '1', netId: 'net-1' },
        // S2 is on L2 net
        { fromDevice: 'S2', fromPin: '2', toDevice: 'S2', toPin: '2', netId: 'net-l2' },
      ],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    expect(shorts.length).toBeGreaterThan(0);
  });

  it('does NOT flag legitimate motor starter circuit', () => {
    const circuit: ERCCircuitData = {
      devices: [
        makeDevice('CB1', { symbolId: 'iec-circuit-breaker-3p' }),
        makeDevice('K1', { symbolId: 'iec-contactor-3p' }),
        makeDevice('F1', { symbolId: 'iec-thermal-overload-relay' }),
        makeDevice('M1', { symbolId: 'iec-motor-3ph' }),
      ],
      nets: [
        makeNet('net-l1', 'L1', 'power'),
        makeNet('net-l2', 'L2', 'power'),
        makeNet('net-1', 'W1', 'signal'),
        makeNet('net-2', 'W2', 'signal'),
        makeNet('net-3', 'W3', 'signal'),
      ],
      parts: [],
      connections: [
        // L1 → CB1 → K1 → F1 → M1 → L2
        { fromDevice: 'CB1', fromPin: 'L1', toDevice: 'CB1', toPin: 'L1', netId: 'net-l1' },
        { fromDevice: 'CB1', fromPin: 'T1', toDevice: 'K1', toPin: 'L1', netId: 'net-1' },
        { fromDevice: 'K1', fromPin: 'T1', toDevice: 'F1', toPin: '1', netId: 'net-2' },
        { fromDevice: 'F1', fromPin: '2', toDevice: 'M1', toPin: '1', netId: 'net-3' },
        { fromDevice: 'M1', fromPin: '2', toDevice: 'M1', toPin: '2', netId: 'net-l2' },
      ],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    expect(shorts.length).toBe(0);
  });

  it('does NOT flag circuit with protection device (fuse)', () => {
    const circuit: ERCCircuitData = {
      devices: [
        makeDevice('FU1', { symbolId: 'iec-fuse-3p' }),
        makeDevice('K1', { symbolId: 'iec-coil' }),
      ],
      nets: [
        makeNet('net-l1', 'L1', 'power'),
        makeNet('net-l2', 'L2', 'power'),
        makeNet('net-1', 'W1', 'signal'),
      ],
      parts: [],
      connections: [
        { fromDevice: 'FU1', fromPin: 'L1', toDevice: 'FU1', toPin: 'L1', netId: 'net-l1' },
        { fromDevice: 'FU1', fromPin: 'T1', toDevice: 'K1', toPin: '1', netId: 'net-1' },
        { fromDevice: 'K1', fromPin: '2', toDevice: 'K1', toPin: '2', netId: 'net-l2' },
      ],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    // Fuse provides protection — coil is switching but fuse counts
    expect(shorts.length).toBe(0);
  });

  it('skips check when no power nets are identified', () => {
    const circuit: ERCCircuitData = {
      devices: [
        makeDevice('S1', { symbolId: 'iec-manual-switch' }),
        makeDevice('S2', { symbolId: 'iec-manual-switch' }),
      ],
      nets: [
        makeNet('net-1', 'Signal1', 'signal'),
        makeNet('net-2', 'Signal2', 'signal'),
      ],
      parts: [],
      connections: [
        { fromDevice: 'S1', fromPin: '1', toDevice: 'S2', toPin: '1', netId: 'net-1' },
      ],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    expect(shorts.length).toBe(0);
  });

  it('skips check when only hot rail exists (no neutral)', () => {
    const circuit: ERCCircuitData = {
      devices: [makeDevice('S1')],
      nets: [makeNet('net-l1', 'L1', 'power')],
      parts: [],
      connections: [],
    };

    const report = runERC(circuit);
    const shorts = report.violations.filter(v => v.rule === 'hot-to-neutral-short');
    expect(shorts.length).toBe(0);
  });
});

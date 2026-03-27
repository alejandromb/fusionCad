import { describe, it, expect } from 'vitest';
import { autoAssignWireNumbers } from './wire-numbering.js';
import type { WireNumberingConnection, WireNumberingNet, WireNumberingRung } from './wire-numbering.js';

describe('Wire Numbering', () => {
  const nets: WireNumberingNet[] = [
    { id: 'net-l1', name: 'L1', netType: 'power' },
    { id: 'net-l2', name: 'L2', netType: 'power' },
    { id: 'net-24v', name: '+24V', netType: 'power' },
    { id: 'net-sig1', name: 'W1', netType: 'signal' },
    { id: 'net-sig2', name: 'W2', netType: 'signal' },
  ];

  it('preserves manual wire number overrides', () => {
    const connections: WireNumberingConnection[] = [
      { fromDevice: 'K1', fromPin: '1', toDevice: 'K2', toPin: '1', netId: 'net-sig1', wireNumber: 'CUSTOM-1' },
    ];

    const result = autoAssignWireNumbers(connections, nets);
    expect(result).toHaveLength(1);
    expect(result[0].wireNumber).toBe('CUSTOM-1');
    expect(result[0].isManual).toBe(true);
  });

  it('uses net name for power nets', () => {
    const connections: WireNumberingConnection[] = [
      { fromDevice: 'J1', fromPin: '1', toDevice: 'CB1', toPin: '1', netId: 'net-l1' },
      { fromDevice: 'CB1', fromPin: '2', toDevice: 'J2', toPin: '1', netId: 'net-l2' },
      { fromDevice: 'PS1', fromPin: '+', toDevice: 'J3', toPin: '1', netId: 'net-24v' },
    ];

    const result = autoAssignWireNumbers(connections, nets);
    expect(result[0].wireNumber).toBe('L1');
    expect(result[1].wireNumber).toBe('L2');
    expect(result[2].wireNumber).toBe('+24V');
    expect(result.every(r => !r.isManual)).toBe(true);
  });

  it('assigns rung-based numbers: rungNum * 10 + L-to-R node index', () => {
    const rungs: WireNumberingRung[] = [
      { number: 100, sheetId: 'sheet-1', deviceIds: ['dev-K1', 'dev-OL1', 'dev-M1'] },
      { number: 110, sheetId: 'sheet-1', deviceIds: ['dev-S1', 'dev-K1-coil'] },
    ];

    const positions = new Map([
      ['dev-K1', { x: 100, y: 50 }],
      ['dev-OL1', { x: 200, y: 50 }],
      ['dev-M1', { x: 300, y: 50 }],
      ['dev-S1', { x: 100, y: 100 }],
      ['dev-K1-coil', { x: 200, y: 100 }],
    ]);

    const connections: WireNumberingConnection[] = [
      // Rung 100: K1 → OL1
      { fromDevice: 'K1', fromDeviceId: 'dev-K1', fromPin: '2', toDevice: 'OL1', toDeviceId: 'dev-OL1', toPin: '1', netId: 'net-sig1' },
      // Rung 100: OL1 → M1
      { fromDevice: 'OL1', fromDeviceId: 'dev-OL1', fromPin: '2', toDevice: 'M1', toDeviceId: 'dev-M1', toPin: '1', netId: 'net-sig2' },
      // Rung 110: S1 → K1-coil
      { fromDevice: 'S1', fromDeviceId: 'dev-S1', fromPin: '2', toDevice: 'K1', toDeviceId: 'dev-K1-coil', toPin: 'A1', netId: 'net-sig1' },
    ];

    const result = autoAssignWireNumbers(connections, nets, rungs, undefined, positions);
    expect(result[0].wireNumber).toBe('1001'); // rung 100 * 10 + node 1
    expect(result[1].wireNumber).toBe('1002'); // rung 100 * 10 + node 2
    expect(result[2].wireNumber).toBe('1101'); // rung 110 * 10 + node 1
  });

  it('sorts wires L-to-R by X position regardless of connection order', () => {
    const rungs: WireNumberingRung[] = [
      { number: 101, sheetId: 'sheet-1', deviceIds: ['dev-A', 'dev-B', 'dev-C'] },
    ];

    const positions = new Map([
      ['dev-A', { x: 100, y: 50 }],
      ['dev-B', { x: 300, y: 50 }],
      ['dev-C', { x: 500, y: 50 }],
    ]);

    const connections: WireNumberingConnection[] = [
      // Connections in reverse order: C→B first, then A→B
      { fromDevice: 'C', fromDeviceId: 'dev-C', fromPin: '1', toDevice: 'B', toDeviceId: 'dev-B', toPin: '2', netId: 'net-sig1' },
      { fromDevice: 'A', fromDeviceId: 'dev-A', fromPin: '2', toDevice: 'B', toDeviceId: 'dev-B', toPin: '1', netId: 'net-sig2' },
    ];

    const result = autoAssignWireNumbers(connections, nets, rungs, undefined, positions);
    // A(x=100)→B(x=300): sortX=100, B(x=300)→C(x=500): sortX=300
    expect(result[0].wireNumber).toBe('1012'); // C→B sorted second (leftX=300)
    expect(result[1].wireNumber).toBe('1011'); // A→B sorted first (leftX=100)
  });

  it('falls back to sequential for wires not on any rung', () => {
    const connections: WireNumberingConnection[] = [
      { fromDevice: 'K1', fromPin: '1', toDevice: 'K2', toPin: '1', netId: 'net-sig1', sheetId: 'sheet-1' },
      { fromDevice: 'K2', fromPin: '2', toDevice: 'M1', toPin: '1', netId: 'net-sig2', sheetId: 'sheet-1' },
    ];

    const result = autoAssignWireNumbers(connections, nets, []);
    expect(result[0].wireNumber).toBe('W001');
    expect(result[1].wireNumber).toBe('W002');
  });

  it('mixes rung-based and fallback numbering', () => {
    const rungs: WireNumberingRung[] = [
      { number: 200, sheetId: 'sheet-2', deviceIds: ['dev-CR1', 'dev-LIGHT1'] },
    ];

    const positions = new Map([
      ['dev-CR1', { x: 100, y: 50 }],
      ['dev-LIGHT1', { x: 300, y: 50 }],
    ]);

    const connections: WireNumberingConnection[] = [
      // Power net
      { fromDevice: 'J1', fromPin: '1', toDevice: 'CR1', toPin: '1', netId: 'net-l1' },
      // On rung 200
      { fromDevice: 'CR1', fromDeviceId: 'dev-CR1', fromPin: '2', toDevice: 'LIGHT1', toDeviceId: 'dev-LIGHT1', toPin: '1', netId: 'net-sig1' },
      // Not on any rung (no deviceId)
      { fromDevice: 'X1', fromPin: '1', toDevice: 'X2', toPin: '1', netId: 'net-sig2', sheetId: 'sheet-2' },
    ];

    const result = autoAssignWireNumbers(connections, nets, rungs, undefined, positions);
    expect(result[0].wireNumber).toBe('L1');     // Power net
    expect(result[1].wireNumber).toBe('2001');     // Rung-based: 200 * 10 + 1
    expect(result[2].wireNumber).toBe('W001');    // Fallback sequential
  });

  it('works without positions (falls back to insertion order)', () => {
    const rungs: WireNumberingRung[] = [
      { number: 100, sheetId: 'sheet-1', deviceIds: ['dev-A', 'dev-B'] },
    ];

    const connections: WireNumberingConnection[] = [
      { fromDevice: 'A', fromDeviceId: 'dev-A', fromPin: '2', toDevice: 'B', toDeviceId: 'dev-B', toPin: '1', netId: 'net-sig1' },
    ];

    // No positions passed — should still work
    const result = autoAssignWireNumbers(connections, nets, rungs);
    expect(result[0].wireNumber).toBe('1001');
  });
});

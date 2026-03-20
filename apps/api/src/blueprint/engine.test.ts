import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinSymbols } from '@fusion-cad/core-model';
import { instantiateBlueprint, resolveTemplate } from './engine.js';
import { registerBuiltinBlueprints, getBlueprintById } from './registry.js';

beforeAll(() => {
  registerBuiltinSymbols();
  registerBuiltinBlueprints();
});

function emptyCircuit() {
  return {
    devices: [], nets: [], parts: [], connections: [],
    positions: {}, sheets: [], annotations: [], rungs: [], blocks: [],
  };
}

describe('resolveTemplate', () => {
  it('resolves simple param', () => {
    expect(resolveTemplate('{{name}}', { name: 'CR1' })).toBe('CR1');
  });

  it('resolves arithmetic', () => {
    expect(resolveTemplate('{{_index + startIndex}}', { _index: 2, startIndex: 1 })).toBe('3');
  });

  it('resolves compound template', () => {
    expect(resolveTemplate('{{prefix}}{{_index + start}}', { prefix: 'CR', _index: 0, start: 1 })).toBe('CR1');
  });

  it('leaves unknown params unresolved', () => {
    expect(resolveTemplate('{{unknown}}', {})).toBe('{{unknown}}');
  });
});

describe('instantiateBlueprint — relay-output', () => {
  it('creates 5 devices and 3 wires', () => {
    const bp = getBlueprintById('relay-output')!;
    expect(bp).toBeDefined();

    // Need a pre-existing sheet
    let circuit = emptyCircuit();

    const result = instantiateBlueprint(bp, {
      params: { relayTag: 'CR1', plcRef: 'plcDO', doPin: 'DO0' },
      circuit,
      sheetId: 'sheet-1',
    });

    // 5 devices: coil, retTerminal, contact (linked), tbIn, tbOut
    expect(result.circuit.devices.length).toBe(5);

    // 3 internal wires: coil:2→ret, tbIn→contact, contact→tbOut
    expect(result.circuit.connections.length).toBe(3);

    // Check tags
    const tags = result.circuit.devices.map((d: any) => d.tag);
    expect(tags).toContain('CR1');
    expect(tags).toContain('RET-CR1');
    expect(tags).toContain('TB-CR1a');
    expect(tags).toContain('TB-CR1b');

    // CR1 appears twice (coil + linked contact)
    expect(tags.filter((t: string) => t === 'CR1').length).toBe(2);

    // Ports are resolved
    expect(result.resolvedPorts.coilInput).toBeDefined();
    expect(result.resolvedPorts.coilInput.pin).toBe('1');

    // deviceGroupId links coil and contact
    const cr1Devices = result.circuit.devices.filter((d: any) => d.tag === 'CR1');
    expect(cr1Devices[0].deviceGroupId).toBeDefined();
    expect(cr1Devices[0].deviceGroupId).toBe(cr1Devices[1].deviceGroupId);
  });
});

describe('instantiateBlueprint — power-section', () => {
  it('creates 5 devices and 4 wires', () => {
    const bp = getBlueprintById('power-section')!;
    expect(bp).toBeDefined();

    const result = instantiateBlueprint(bp, {
      params: {},
      circuit: emptyCircuit(),
      sheetId: 'sheet-1',
    });

    // CB1, TB-N, PS1, FU1, TB-0V
    expect(result.circuit.devices.length).toBe(5);
    expect(result.circuit.connections.length).toBe(4);

    const tags = result.circuit.devices.map((d: any) => d.tag);
    expect(tags).toContain('CB1');
    expect(tags).toContain('PS1');
    expect(tags).toContain('FU1');
    expect(tags).toContain('TB-N');
    expect(tags).toContain('TB-0V');
  });
});

describe('instantiateBlueprint — relay-bank', () => {
  it('creates PLC + 4 relay outputs with sheets', () => {
    const bp = getBlueprintById('relay-bank')!;
    expect(bp).toBeDefined();

    const result = instantiateBlueprint(bp, {
      params: { relayCount: 4, relayPrefix: 'CR', startIndex: 1, includePowerSupply: false },
      circuit: emptyCircuit(),
      sheetId: 'sheet-1',
    });

    // 1 PLC + 4×(coil, retTerminal, contact, tbIn, tbOut) = 1 + 20 = 21 devices
    expect(result.circuit.devices.length).toBe(21);

    // 4 relay-outputs × 3 internal wires = 12 wires
    // + 4 port wires (PLC DO → coil) = 16 total
    expect(result.circuit.connections.length).toBe(16);

    // Check PLC exists
    const plc = result.circuit.devices.find((d: any) => d.tag === 'PLC1-DO1');
    expect(plc).toBeDefined();

    // Check all 4 relay tags
    for (let i = 1; i <= 4; i++) {
      const coils = result.circuit.devices.filter((d: any) => d.tag === `CR${i}`);
      expect(coils.length).toBeGreaterThanOrEqual(1); // coil + linked contact
    }

    // 3 sheets created (power excluded since includePowerSupply=false, but sheets def still creates them)
    expect(result.circuit.sheets!.length).toBeGreaterThanOrEqual(3);
  });
});

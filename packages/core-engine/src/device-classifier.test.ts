import { describe, it, expect } from 'vitest';
import { classifyDevice, classifyByKeyword, classifyByTagPrefix } from './device-classifier.js';
import type { Device, Part } from '@fusion-cad/core-model';

function makeDevice(tag: string, opts?: { symbolId?: string; partId?: string }): Device {
  return {
    id: `dev-${tag}`,
    type: 'device',
    tag,
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
  } as any;
}

describe('classifyByKeyword', () => {
  it('classifies motor as load', () => {
    expect(classifyByKeyword('iec-motor-3ph')).toBe('load');
    expect(classifyByKeyword('iec-motor-1ph')).toBe('load');
  });

  it('classifies VFD as load', () => {
    expect(classifyByKeyword('iec-vfd')).toBe('load');
  });

  it('classifies pilot light as load', () => {
    expect(classifyByKeyword('iec-pilot-light')).toBe('load');
  });

  it('classifies horn as load', () => {
    expect(classifyByKeyword('iec-horn')).toBe('load');
  });

  it('classifies circuit breaker as protection', () => {
    expect(classifyByKeyword('iec-circuit-breaker-3p')).toBe('protection');
    expect(classifyByKeyword('iec-circuit-breaker-thermal-magnetic')).toBe('protection');
  });

  it('classifies fuse as protection', () => {
    expect(classifyByKeyword('iec-fuse-3p')).toBe('protection');
  });

  it('classifies thermal overload relay as protection', () => {
    expect(classifyByKeyword('iec-thermal-overload-relay')).toBe('protection');
    expect(classifyByKeyword('iec-thermal-overload-relay-3p')).toBe('protection');
  });

  it('classifies contactor as switching', () => {
    expect(classifyByKeyword('iec-contactor-3p')).toBe('switching');
  });

  it('classifies contacts as switching', () => {
    expect(classifyByKeyword('iec-normally-open-contact')).toBe('switching');
    expect(classifyByKeyword('iec-normally-closed-contact')).toBe('switching');
  });

  it('classifies coil as switching', () => {
    expect(classifyByKeyword('iec-coil')).toBe('switching');
  });

  it('classifies switches as switching', () => {
    expect(classifyByKeyword('iec-manual-switch')).toBe('switching');
    expect(classifyByKeyword('iec-selector-switch')).toBe('switching');
    expect(classifyByKeyword('iec-emergency-stop')).toBe('switching');
    expect(classifyByKeyword('iec-limit-switch')).toBe('switching');
  });

  it('classifies timer as switching', () => {
    expect(classifyByKeyword('iec-on-delay-timer')).toBe('switching');
    expect(classifyByKeyword('iec-off-delay-timer')).toBe('switching');
  });

  it('classifies terminal as passive', () => {
    expect(classifyByKeyword('iec-terminal-single')).toBe('passive');
    expect(classifyByKeyword('iec-terminal-dual')).toBe('passive');
  });

  it('classifies junction as passive', () => {
    expect(classifyByKeyword('junction')).toBe('passive');
  });

  it('classifies power supply as source', () => {
    expect(classifyByKeyword('iec-power-supply-ac-dc')).toBe('source');
  });

  it('classifies transformer as source', () => {
    expect(classifyByKeyword('iec-transformer-3ph')).toBe('source');
  });

  it('classifies resistor as load', () => {
    expect(classifyByKeyword('iec-resistor')).toBe('load');
  });

  it('returns unknown for unrecognized', () => {
    expect(classifyByKeyword('some-random-thing')).toBe('unknown');
  });
});

describe('classifyByTagPrefix', () => {
  it('M → load', () => expect(classifyByTagPrefix('M1')).toBe('load'));
  it('H → load', () => expect(classifyByTagPrefix('H1')).toBe('load'));
  it('CB → protection', () => expect(classifyByTagPrefix('CB1')).toBe('protection'));
  it('FU → protection', () => expect(classifyByTagPrefix('FU1')).toBe('protection'));
  it('F → protection', () => expect(classifyByTagPrefix('F1')).toBe('protection'));
  it('K → switching', () => expect(classifyByTagPrefix('K1')).toBe('switching'));
  it('S → switching', () => expect(classifyByTagPrefix('S1')).toBe('switching'));
  it('X → passive', () => expect(classifyByTagPrefix('X1')).toBe('passive'));
  it('PS → source', () => expect(classifyByTagPrefix('PS1')).toBe('source'));
  it('unknown prefix → unknown', () => expect(classifyByTagPrefix('ZZ1')).toBe('unknown'));
});

describe('classifyDevice', () => {
  it('uses symbolId first', () => {
    const device = makeDevice('K1', { symbolId: 'iec-motor-3ph' });
    expect(classifyDevice(device, [])).toBe('load'); // symbolId wins over tag prefix K→switching
  });

  it('uses part category when no symbolId', () => {
    const device = makeDevice('X1', { partId: 'p1' });
    const parts = [makePart('p1', 'circuit-breaker')];
    expect(classifyDevice(device, parts)).toBe('protection');
  });

  it('falls back to tag prefix', () => {
    const device = makeDevice('M1');
    expect(classifyDevice(device, [])).toBe('load');
  });

  it('returns unknown for unrecognized device', () => {
    const device = makeDevice('ZZ99');
    expect(classifyDevice(device, [])).toBe('unknown');
  });
});

/**
 * Golden Circuit: Three-Wire Motor Starter
 *
 * This is our first end-to-end test circuit.
 * It's hardcoded here to prove the automation stack works.
 */

import {
  Project,
  Sheet,
  Part,
  Device,
  Net,
  Terminal,
  generateId,
  type EntityId,
} from '@fusion-cad/core-model';

export interface GoldenCircuit {
  project: Project;
  sheet: Sheet;
  parts: Part[];
  devices: Device[];
  nets: Net[];
  terminals: Terminal[];
  // Simplified connection representation (for now)
  connections: Array<{
    fromDevice: string; // device tag
    fromPin: string;
    toDevice: string; // device tag
    toPin: string;
    netId: EntityId;
  }>;
}

/**
 * Creates the hardcoded 3-wire motor starter circuit
 */
export function createGoldenCircuitMotorStarter(): GoldenCircuit {
  const now = Date.now();

  // Project
  const project: Project = {
    id: generateId(),
    type: 'project',
    name: 'Golden Circuit - Motor Starter',
    description: '3-wire motor starter with E-stop',
    schemaVersion: '0.1.0',
    createdAt: now,
    modifiedAt: now,
  };

  // Sheet
  const sheet: Sheet = {
    id: generateId(),
    type: 'sheet',
    name: 'Main Control',
    number: 1,
    size: 'A4',
    createdAt: now,
    modifiedAt: now,
  };

  // Parts (catalog items)
  const parts: Part[] = [
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Schneider Electric',
      partNumber: 'LC1D09',
      description: 'Contactor, 3-pole, 9A, 24VDC coil',
      category: 'contactor',
      attributes: {
        poles: 3,
        current: '9A',
        coilVoltage: '24VDC',
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Schneider Electric',
      partNumber: 'XB4BA31',
      description: 'Push button, NO, green',
      category: 'button',
      attributes: {
        type: 'NO',
        color: 'green',
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Schneider Electric',
      partNumber: 'XB4BS142',
      description: 'E-stop button, NC, red',
      category: 'button',
      attributes: {
        type: 'NC',
        color: 'red',
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Schneider Electric',
      partNumber: 'LR2D1308',
      description: 'Thermal overload relay, 2.5-4A',
      category: 'overload',
      attributes: {
        range: '2.5-4A',
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Generic',
      partNumber: 'MOTOR-3PH-1HP',
      description: '3-phase motor, 1HP, 230/460V',
      category: 'motor',
      attributes: {
        power: '1HP',
        voltage: '230/460V',
        phases: 3,
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Phoenix Contact',
      partNumber: 'PT-2.5',
      description: 'Terminal block, 2.5mm², screw',
      category: 'terminal',
      attributes: {
        wireSize: '2.5mm²',
      },
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'part',
      manufacturer: 'Mean Well',
      partNumber: 'HDR-15-24',
      description: 'DIN rail power supply, 24VDC, 0.63A',
      category: 'power-supply',
      attributes: {
        voltage: '24VDC',
        current: '0.63A',
      },
      createdAt: now,
      modifiedAt: now,
    },
  ];

  // Devices (project instances)
  const devices: Device[] = [
    {
      id: generateId(),
      type: 'device',
      tag: 'K1',
      function: 'Motor contactor',
      partId: parts[0].id, // LC1D09
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'S1',
      function: 'Start button',
      partId: parts[1].id, // XB4BA31
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'S2',
      function: 'Stop button (E-stop)',
      partId: parts[2].id, // XB4BS142
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'F1',
      function: 'Motor overload relay',
      partId: parts[3].id, // LR2D1308
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'M1',
      function: 'Main motor',
      partId: parts[4].id, // MOTOR-3PH-1HP
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'X1',
      function: 'Control terminal strip',
      partId: parts[5].id, // PT-2.5
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'device',
      tag: 'PS1',
      function: '24VDC power supply',
      partId: parts[6].id, // HDR-15-24
      sheetId: sheet.id,
      createdAt: now,
      modifiedAt: now,
    },
  ];

  // Nets (electrical potentials)
  const nets: Net[] = [
    {
      id: generateId(),
      type: 'net',
      name: '24V',
      netType: 'power',
      potential: '24VDC',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: '0V',
      netType: 'ground',
      potential: '0V',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: 'COIL_24V',
      netType: 'signal',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: 'START_SEAL',
      netType: 'signal',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: 'L1',
      netType: 'power',
      potential: 'L1',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: 'L2',
      netType: 'power',
      potential: 'L2',
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'net',
      name: 'L3',
      netType: 'power',
      potential: 'L3',
      createdAt: now,
      modifiedAt: now,
    },
  ];

  // Terminals (terminal strip connections)
  const terminals: Terminal[] = [
    {
      id: generateId(),
      type: 'terminal',
      deviceId: devices[5].id, // X1
      index: 1,
      label: '24V IN',
      netId: nets[0].id, // 24V
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'terminal',
      deviceId: devices[5].id, // X1
      index: 2,
      label: '0V',
      netId: nets[1].id, // 0V
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'terminal',
      deviceId: devices[5].id, // X1
      index: 3,
      label: 'L1 IN',
      netId: nets[4].id, // L1
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'terminal',
      deviceId: devices[5].id, // X1
      index: 4,
      label: 'L2 IN',
      netId: nets[5].id, // L2
      createdAt: now,
      modifiedAt: now,
    },
    {
      id: generateId(),
      type: 'terminal',
      deviceId: devices[5].id, // X1
      index: 5,
      label: 'L3 IN',
      netId: nets[6].id, // L3
      createdAt: now,
      modifiedAt: now,
    },
  ];

  // Connections (simplified representation for Phase 1)
  const connections = [
    // 24VDC power distribution
    { fromDevice: 'PS1', fromPin: '+', toDevice: 'X1', toPin: '1', netId: nets[0].id },
    { fromDevice: 'PS1', fromPin: '-', toDevice: 'X1', toPin: '2', netId: nets[1].id },
    { fromDevice: 'X1', fromPin: '1', toDevice: 'S2', toPin: '1', netId: nets[0].id },

    // Control circuit: S2 (NC) -> S1 (NO) -> K1 (sealing contact) -> K1 coil
    { fromDevice: 'S2', fromPin: '2', toDevice: 'S1', toPin: '1', netId: nets[2].id },
    { fromDevice: 'S1', fromPin: '2', toDevice: 'K1', toPin: '13', netId: nets[3].id },
    { fromDevice: 'K1', fromPin: '14', toDevice: 'K1', toPin: 'A1', netId: nets[3].id },
    { fromDevice: 'K1', fromPin: 'A2', toDevice: 'F1', toPin: '96', netId: nets[1].id },
    { fromDevice: 'F1', fromPin: '95', toDevice: 'X1', toPin: '2', netId: nets[1].id },

    // Power circuit: L1, L2, L3 -> K1 -> F1 -> M1
    { fromDevice: 'X1', fromPin: '3', toDevice: 'K1', toPin: '1', netId: nets[4].id },
    { fromDevice: 'X1', fromPin: '4', toDevice: 'K1', toPin: '3', netId: nets[5].id },
    { fromDevice: 'X1', fromPin: '5', toDevice: 'K1', toPin: '5', netId: nets[6].id },
  ];

  return {
    project,
    sheet,
    parts,
    devices,
    nets,
    terminals,
    connections,
  };
}

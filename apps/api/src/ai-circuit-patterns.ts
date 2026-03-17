/**
 * AI Circuit Pattern Templates
 *
 * High-level functions that generate electrically complete sub-circuits.
 * Called by the AI chat tool_use system to produce correct circuits in one call.
 */

import {
  generateId,
  getSymbolById,
  type Device,
  type Part,
} from '@fusion-cad/core-model';

const GRID_SIZE = 20;
function snap(v: number): number { return Math.round(v / GRID_SIZE) * GRID_SIZE; }

interface CircuitData {
  devices: Device[];
  nets: any[];
  parts: Part[];
  connections: any[];
  positions: Record<string, { x: number; y: number }>;
  sheets?: any[];
  annotations?: any[];
  [key: string]: any;
}

interface PatternResult {
  circuit: CircuitData;
  summary: string;
}

// ================================================================
// Helpers
// ================================================================

function resolveSheetId(circuit: CircuitData, sheetName?: string): string {
  if (sheetName && circuit.sheets) {
    const match = circuit.sheets.find((s: any) => s.name === sheetName);
    if (match) return match.id;
  }
  return circuit.sheets?.[0]?.id || 'sheet-1';
}

function addDevice(
  circuit: CircuitData, symbolId: string, tag: string,
  x: number, y: number, sheetId: string, functionDesc?: string,
): { circuit: CircuitData; deviceId: string } {
  const sym = getSymbolById(symbolId);
  const now = Date.now();
  const deviceId = generateId();
  const partId = generateId();

  const newPart: Part = {
    id: partId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: functionDesc || sym?.name || symbolId, category: symbolId,
    attributes: {}, createdAt: now, modifiedAt: now,
  };
  const newDevice: Device = {
    id: deviceId, type: 'device', tag,
    function: functionDesc || sym?.name || symbolId,
    partId, sheetId, createdAt: now, modifiedAt: now,
  };

  return {
    deviceId,
    circuit: {
      ...circuit,
      devices: [...circuit.devices, newDevice],
      parts: [...circuit.parts, newPart],
      positions: { ...circuit.positions, [deviceId]: { x: snap(x), y: snap(y) } },
    },
  };
}

function addLinkedDevice(
  circuit: CircuitData, existingTag: string, symbolId: string,
  x: number, y: number, sheetId: string, functionDesc?: string,
): { circuit: CircuitData; deviceId: string } {
  const sym = getSymbolById(symbolId);
  const now = Date.now();
  const deviceId = generateId();
  const partId = generateId();

  // Find existing devices with this tag and get/create deviceGroupId
  const existing = circuit.devices.filter(d => d.tag === existingTag);
  let groupId = existing[0]?.deviceGroupId;
  let updatedDevices = [...circuit.devices];
  if (!groupId && existing.length > 0) {
    groupId = generateId();
    updatedDevices = updatedDevices.map(d =>
      d.tag === existingTag ? { ...d, deviceGroupId: groupId, modifiedAt: now } : d
    );
  }

  const newPart: Part = {
    id: partId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: functionDesc || `${sym?.name || symbolId} (linked to ${existingTag})`,
    category: symbolId, attributes: {}, createdAt: now, modifiedAt: now,
  };
  const newDevice: Device = {
    id: deviceId, type: 'device', tag: existingTag,
    function: functionDesc || sym?.name || symbolId,
    partId, sheetId, deviceGroupId: groupId || generateId(),
    createdAt: now, modifiedAt: now,
  };

  // If first device didn't have groupId, set it now
  if (!groupId) {
    updatedDevices = updatedDevices.map(d =>
      d.tag === existingTag ? { ...d, deviceGroupId: newDevice.deviceGroupId, modifiedAt: now } : d
    );
  }

  return {
    deviceId,
    circuit: {
      ...circuit,
      devices: [...updatedDevices, newDevice],
      parts: [...circuit.parts, newPart],
      positions: { ...circuit.positions, [deviceId]: { x: snap(x), y: snap(y) } },
    },
  };
}

function addWire(
  circuit: CircuitData, fromTag: string, fromPin: string, toTag: string, toPin: string,
): CircuitData {
  const fromDev = circuit.devices.find(d => d.tag === fromTag);
  const toDev = circuit.devices.find(d => d.tag === toTag);
  if (!fromDev || !toDev) return circuit;

  const netId = generateId();
  return {
    ...circuit,
    nets: [...circuit.nets, {
      id: netId, type: 'net', name: `N${circuit.nets.length + 1}`,
      netType: 'signal', createdAt: Date.now(), modifiedAt: Date.now(),
    }],
    connections: [...circuit.connections, {
      fromDevice: fromTag, fromDeviceId: fromDev.id, fromPin,
      toDevice: toTag, toDeviceId: toDev.id, toPin, netId,
    }],
  };
}

function addAnnotation(
  circuit: CircuitData, content: string, x: number, y: number, sheetId: string,
): CircuitData {
  return {
    ...circuit,
    annotations: [...(circuit.annotations || []), {
      id: generateId(), content,
      position: { x: snap(x), y: snap(y) }, sheetId,
      style: { fontSize: 14, fontWeight: 'bold' },
    }],
  };
}

function addSheet(circuit: CircuitData, name: string): { circuit: CircuitData; sheetId: string } {
  const sheetId = generateId();
  return {
    sheetId,
    circuit: {
      ...circuit,
      sheets: [...(circuit.sheets || []), {
        id: sheetId, name, order: (circuit.sheets?.length || 0) + 1,
        titleBlock: { title: name, date: new Date().toISOString().slice(0, 10), revision: 'A' },
      }],
    },
  };
}

// ================================================================
// Pattern: Complete Relay Output
// ================================================================

export interface RelayOutputParams {
  plcTag: string;
  doPin: string;
  relayTag: string;
  coilSheetName: string;
  contactSheetName?: string;
  coilX?: number;
  coilY?: number;
  contactX?: number;
  contactY?: number;
}

export function generateRelayOutput(circuit: CircuitData, params: RelayOutputParams): PatternResult {
  const coilSheetId = resolveSheetId(circuit, params.coilSheetName);
  const contactSheetId = params.contactSheetName
    ? resolveSheetId(circuit, params.contactSheetName)
    : coilSheetId;

  const coilX = params.coilX || 500;
  const coilY = params.coilY || 80;
  const contactX = params.contactX || 740;
  const contactY = params.contactY || coilY;

  // 1. Place coil
  const r1 = addDevice(circuit, 'ansi-coil', params.relayTag, coilX, coilY, coilSheetId, `${params.relayTag} Coil`);
  circuit = r1.circuit;

  // 2. Wire PLC DO → coil pin 1
  circuit = addWire(circuit, params.plcTag, params.doPin, params.relayTag, '1');

  // 3. Wire coil pin 2 → 0V (we use an annotation to mark it since we don't have a rail device)
  // For now, leave pin 2 for the user to connect to 0V bus — but annotate it
  circuit = addAnnotation(circuit, '→ 0V', coilX + 40, coilY + 30, coilSheetId);

  // 4. Place linked NO contact (same tag = linked device)
  const r2 = addLinkedDevice(circuit, params.relayTag, 'ansi-normally-open-contact', contactX, contactY, contactSheetId, `${params.relayTag} NO Contact`);
  circuit = r2.circuit;

  // 5. Place terminal blocks for field wiring
  const tbInTag = `TB-${params.relayTag}a`;
  const tbOutTag = `TB-${params.relayTag}b`;

  const r3 = addDevice(circuit, 'iec-terminal-single', tbInTag, contactX - 80, contactY, contactSheetId, `${params.relayTag} Field In`);
  circuit = r3.circuit;

  const r4 = addDevice(circuit, 'iec-terminal-single', tbOutTag, contactX + 80, contactY, contactSheetId, `${params.relayTag} Field Out`);
  circuit = r4.circuit;

  // 6. Wire: terminal-in → NO contact → terminal-out
  circuit = addWire(circuit, tbInTag, '2', params.relayTag, '1');
  circuit = addWire(circuit, params.relayTag, '2', tbOutTag, '1');

  return {
    circuit,
    summary: `${params.relayTag}: coil (${params.coilSheetName}) + NO contact + terminals (${params.contactSheetName || params.coilSheetName})`,
  };
}

// ================================================================
// Pattern: PLC Relay Bank (N relays)
// ================================================================

export interface RelayBankParams {
  relayCount: number;
  plcSymbolId?: string;        // default: iec-plc-do-8
  relayPrefix?: string;         // default: CR
  startIndex?: number;          // default: 1
  controlVoltage?: string;      // default: 24VDC
  relaysPerSheet?: number;      // default: 8
  includeContacts?: boolean;    // default: true
  includePowerSupply?: boolean; // default: true
}

export function generateRelayBank(circuit: CircuitData, params: RelayBankParams): PatternResult {
  const {
    relayCount,
    plcSymbolId = 'iec-plc-do-8',
    relayPrefix = 'CR',
    startIndex = 1,
    relaysPerSheet = 8,
    includeContacts = true,
    includePowerSupply = true,
  } = params;

  const sheetCount = Math.ceil(relayCount / relaysPerSheet);
  const log: string[] = [];

  // 1. Create power supply sheet if requested
  if (includePowerSupply) {
    const ps = addSheet(circuit, 'Power Distribution');
    circuit = ps.circuit;
    const psSheetId = ps.sheetId;

    // CB1
    const cb = addDevice(circuit, 'iec-circuit-breaker-1p', 'CB1', 200, 100, psSheetId, 'Main Breaker 120VAC');
    circuit = cb.circuit;

    // PS1
    const psu = addDevice(circuit, 'iec-power-supply-ac-dc', 'PS1', 200, 280, psSheetId, 'Power Supply 120VAC→24VDC');
    circuit = psu.circuit;

    // FU1
    const fu = addDevice(circuit, 'ansi-fuse', 'FU1', 200, 460, psSheetId, '24VDC Fuse');
    circuit = fu.circuit;

    // Wire power chain: CB1 → PS1 → FU1
    circuit = addWire(circuit, 'CB1', '2', 'PS1', '1');  // CB load → PS L
    circuit = addWire(circuit, 'PS1', '3', 'FU1', '1');  // PS +24V → Fuse

    // Annotations
    circuit = addAnnotation(circuit, '120VAC INPUT', 140, 60, psSheetId);
    circuit = addAnnotation(circuit, 'L', 160, 100, psSheetId);
    circuit = addAnnotation(circuit, 'N', 300, 280, psSheetId);
    circuit = addAnnotation(circuit, '+24VDC', 140, 520, psSheetId);
    circuit = addAnnotation(circuit, '0V', 300, 460, psSheetId);

    log.push('Power Distribution: CB1 → PS1 → FU1');
  }

  // 2. Create relay output sheets
  let relayIndex = startIndex;
  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const startDO = sheet * relaysPerSheet;
    const endDO = Math.min(startDO + relaysPerSheet, relayCount);
    const count = endDO - startDO;

    // Create DO output sheet
    const doSheetName = `DO${startDO}-DO${endDO - 1} Outputs`;
    const doSheet = addSheet(circuit, doSheetName);
    circuit = doSheet.circuit;

    // Create contacts sheet if needed
    let contactSheetName = doSheetName;
    if (includeContacts) {
      contactSheetName = `${relayPrefix}${relayIndex}-${relayPrefix}${relayIndex + count - 1} Field Contacts`;
      const cSheet = addSheet(circuit, contactSheetName);
      circuit = cSheet.circuit;
    }

    // Place PLC DO module
    const plcTag = `PLC1-DO${sheet + 1}`;
    const plcDev = addDevice(circuit, plcSymbolId, plcTag, 160, 80, doSheet.sheetId, `PLC DO Module ${sheet + 1}`);
    circuit = plcDev.circuit;

    // Annotations
    circuit = addAnnotation(circuit, doSheetName.toUpperCase(), 200, 40, doSheet.sheetId);

    // Place relay outputs
    for (let i = 0; i < count; i++) {
      const doPin = `DO${i}`;
      const relayTag = `${relayPrefix}${relayIndex}`;
      const coilY = 80 + i * 80;
      const contactY = 80 + i * 80;

      const result = generateRelayOutput(circuit, {
        plcTag,
        doPin,
        relayTag,
        coilSheetName: doSheetName,
        contactSheetName: includeContacts ? contactSheetName : undefined,
        coilX: 500,
        coilY,
        contactX: 500,
        contactY,
      });
      circuit = result.circuit;
      log.push(result.summary);
      relayIndex++;
    }
  }

  return {
    circuit,
    summary: `Generated ${relayCount} relay outputs:\n${log.map(l => `  - ${l}`).join('\n')}`,
  };
}

// ================================================================
// Pattern: Power Supply Section
// ================================================================

export interface PowerSectionParams {
  inputVoltage?: string;   // default: '120VAC'
  outputVoltage?: string;  // default: '24VDC'
  sheetName?: string;
}

export function generatePowerSection(circuit: CircuitData, params: PowerSectionParams): PatternResult {
  const sheetName = params.sheetName || 'Power Distribution';
  let sheetId = resolveSheetId(circuit, sheetName);

  // Create sheet if it doesn't exist
  if (!circuit.sheets?.find((s: any) => s.name === sheetName)) {
    const s = addSheet(circuit, sheetName);
    circuit = s.circuit;
    sheetId = s.sheetId;
  }

  const r1 = addDevice(circuit, 'iec-circuit-breaker-1p', 'CB1', 200, 100, sheetId, 'Main Breaker');
  circuit = r1.circuit;

  const r2 = addDevice(circuit, 'iec-power-supply-ac-dc', 'PS1', 200, 280, sheetId, `PSU ${params.inputVoltage || '120VAC'}→${params.outputVoltage || '24VDC'}`);
  circuit = r2.circuit;

  const r3 = addDevice(circuit, 'ansi-fuse', 'FU1', 200, 460, sheetId, 'DC Output Fuse');
  circuit = r3.circuit;

  circuit = addWire(circuit, 'CB1', '2', 'PS1', '1');
  circuit = addWire(circuit, 'PS1', '3', 'FU1', '1');

  circuit = addAnnotation(circuit, `${params.inputVoltage || '120VAC'} INPUT`, 140, 60, sheetId);
  circuit = addAnnotation(circuit, `+${params.outputVoltage || '24VDC'}`, 140, 520, sheetId);
  circuit = addAnnotation(circuit, '0V', 300, 460, sheetId);

  return {
    circuit,
    summary: 'Power section: CB1 → PS1 → FU1 (breaker → PSU → fuse)',
  };
}

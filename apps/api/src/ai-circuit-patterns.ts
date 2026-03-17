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

/** Wire by tag (finds first device with that tag) */
function addWire(
  circuit: CircuitData, fromTag: string, fromPin: string, toTag: string, toPin: string,
): CircuitData {
  const fromDev = circuit.devices.find(d => d.tag === fromTag);
  const toDev = circuit.devices.find(d => d.tag === toTag);
  if (!fromDev || !toDev) return circuit;
  return addWireById(circuit, fromDev.id, fromTag, fromPin, toDev.id, toTag, toPin);
}

/** Wire by device ID (precise — needed for linked devices sharing a tag) */
function addWireById(
  circuit: CircuitData,
  fromDeviceId: string, fromTag: string, fromPin: string,
  toDeviceId: string, toTag: string, toPin: string,
): CircuitData {
  const netId = generateId();
  return {
    ...circuit,
    nets: [...circuit.nets, {
      id: netId, type: 'net', name: `N${circuit.nets.length + 1}`,
      netType: 'signal', createdAt: Date.now(), modifiedAt: Date.now(),
    }],
    connections: [...circuit.connections, {
      fromDevice: fromTag, fromDeviceId, fromPin,
      toDevice: toTag, toDeviceId, toPin, netId,
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

  const coilX = params.coilX || 400;
  const coilY = params.coilY || 80;
  const retX = coilX + 140;  // return terminal to the right of coil (same Y = straight wire)

  // Contacts sheet: laid out HORIZONTALLY with good spacing
  const contactY = params.contactY || coilY;
  const tbInX = 100;        // TB field-in on the left
  const contactX = 240;     // NO contact in the middle
  const tbOutX = 400;       // TB field-out on the right

  // 1. Place coil
  const r1 = addDevice(circuit, 'ansi-coil', params.relayTag, coilX, coilY, coilSheetId, `${params.relayTag} Coil`);
  circuit = r1.circuit;
  const coilDeviceId = r1.deviceId;

  // 2. Wire PLC DO → coil pin 1 (A1)
  const plcDev = circuit.devices.find(d => d.tag === params.plcTag);
  if (plcDev) {
    circuit = addWireById(circuit, plcDev.id, params.plcTag, params.doPin, coilDeviceId, params.relayTag, '1');
  }

  // 3. Wire coil pin 2 (A2) → 0V return
  // Place a ground/return terminal for the 0V bus connection
  const retTag = `RET-${params.relayTag}`;
  const r1b = addDevice(circuit, 'iec-terminal-single', retTag, retX, coilY, coilSheetId, '0V Return');
  circuit = r1b.circuit;
  circuit = addWireById(circuit, coilDeviceId, params.relayTag, '2', r1b.deviceId, retTag, '1');

  // 4. Place linked NO contact (same tag = linked device, HORIZONTAL orientation)
  const r2 = addLinkedDevice(circuit, params.relayTag, 'ansi-normally-open-contact', contactX, contactY, contactSheetId, `${params.relayTag} NO Contact`);
  circuit = r2.circuit;
  const contactDeviceId = r2.deviceId;

  // 5. Place terminal blocks for field wiring (horizontal: TB-in ... NO contact ... TB-out)
  const tbInTag = `TB-${params.relayTag}a`;
  const tbOutTag = `TB-${params.relayTag}b`;

  const r3 = addDevice(circuit, 'iec-terminal-single', tbInTag, tbInX, contactY, contactSheetId, `${params.relayTag} Field In`);
  circuit = r3.circuit;

  const r4 = addDevice(circuit, 'iec-terminal-single', tbOutTag, tbOutX, contactY, contactSheetId, `${params.relayTag} Field Out`);
  circuit = r4.circuit;

  // 6. Wire by deviceId: TB-in pin 1 → NO contact pin 1; NO contact pin 2 → TB-out pin 1
  circuit = addWireById(circuit, r3.deviceId, tbInTag, '1', contactDeviceId, params.relayTag, '1');
  circuit = addWireById(circuit, contactDeviceId, params.relayTag, '2', r4.deviceId, tbOutTag, '1');

  return {
    circuit,
    summary: `${params.relayTag}: coil wired (DO→A1, A2→0V) + NO contact + terminals`,
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

    // CB1 (120VAC line breaker)
    const cb = addDevice(circuit, 'iec-circuit-breaker-1p', 'CB1', 200, 100, psSheetId, 'Main Breaker 120VAC');
    circuit = cb.circuit;

    // Neutral terminal (straight-through, no breaker on neutral per NEC)
    const nTerm = addDevice(circuit, 'iec-terminal-single', 'TB-N', 400, 100, psSheetId, 'Neutral');
    circuit = nTerm.circuit;

    // PS1 (AC/DC power supply: pins 1=L, 2=N, 3=+24V, 4=0V)
    const psu = addDevice(circuit, 'iec-power-supply-ac-dc', 'PS1', 300, 300, psSheetId, 'Power Supply 120VAC→24VDC');
    circuit = psu.circuit;

    // FU1 (fuse on +24VDC output)
    const fu = addDevice(circuit, 'ansi-fuse', 'FU1', 200, 500, psSheetId, '24VDC Fuse');
    circuit = fu.circuit;

    // 0V distribution terminal
    const zeroV = addDevice(circuit, 'iec-terminal-single', 'TB-0V', 400, 500, psSheetId, '0V Distribution');
    circuit = zeroV.circuit;

    // Wire complete power chain:
    // AC side: CB1 pin 2 (load) → PS1 pin 1 (L)
    circuit = addWireById(circuit, cb.deviceId, 'CB1', '2', psu.deviceId, 'PS1', '1');
    // Neutral: TB-N pin 2 → PS1 pin 2 (N)
    circuit = addWireById(circuit, nTerm.deviceId, 'TB-N', '1', psu.deviceId, 'PS1', '2');
    // DC output: PS1 pin 3 (+24V) → FU1 pin 1
    circuit = addWireById(circuit, psu.deviceId, 'PS1', '3', fu.deviceId, 'FU1', '1');
    // DC return: PS1 pin 4 (0V) → TB-0V pin 1
    circuit = addWireById(circuit, psu.deviceId, 'PS1', '4', zeroV.deviceId, 'TB-0V', '1');

    // Annotations
    circuit = addAnnotation(circuit, '120VAC INPUT', 140, 60, psSheetId);
    circuit = addAnnotation(circuit, 'L', 160, 100, psSheetId);
    circuit = addAnnotation(circuit, 'N', 440, 100, psSheetId);
    circuit = addAnnotation(circuit, '+24VDC OUTPUT', 140, 560, psSheetId);
    circuit = addAnnotation(circuit, '0V', 440, 500, psSheetId);

    log.push('Power Distribution: CB1→PS1(L+N)→FU1(+24V), PS1→TB-0V(0V)');
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
    // PLC DO-8 pin layout: header=50px, pin spacing=30px
    // So DO0 is at symbol_y + 50, DO1 at symbol_y + 80, etc.
    const plcTag = `PLC1-DO${sheet + 1}`;
    const plcY = 60;
    const plcDev = addDevice(circuit, plcSymbolId, plcTag, 100, plcY, doSheet.sheetId, `PLC DO Module ${sheet + 1}`);
    circuit = plcDev.circuit;

    // Annotations
    circuit = addAnnotation(circuit, doSheetName.toUpperCase(), 200, 20, doSheet.sheetId);

    // Place relay outputs — align coil Y with each PLC DO pin Y
    // DO pin positions: first pin at plcY + 50, then every 30px
    const firstPinY = plcY + 50;  // DO0 pin Y position
    const pinSpacing = 30;        // matches PLC DO symbol pin spacing

    for (let i = 0; i < count; i++) {
      const doPin = `DO${i}`;
      const relayTag = `${relayPrefix}${relayIndex}`;
      // Align coil Y exactly with the PLC DO pin Y for straight horizontal wire
      const rungY = firstPinY + i * pinSpacing;
      const contactY = 80 + i * 80; // contacts sheet has more spacing for clarity

      const result = generateRelayOutput(circuit, {
        plcTag,
        doPin,
        relayTag,
        coilSheetName: doSheetName,
        contactSheetName: includeContacts ? contactSheetName : undefined,
        coilX: 400,       // coil to the right of PLC (PLC is 100px wide at x=100, so x=400 gives clearance)
        coilY: rungY,     // aligned with PLC pin
        contactX: 200,    // contact sheet center
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

  const inV = params.inputVoltage || '120VAC';
  const outV = params.outputVoltage || '24VDC';

  const r1 = addDevice(circuit, 'iec-circuit-breaker-1p', 'CB1', 200, 100, sheetId, `Main Breaker ${inV}`);
  circuit = r1.circuit;

  const rN = addDevice(circuit, 'iec-terminal-single', 'TB-N', 400, 100, sheetId, 'Neutral');
  circuit = rN.circuit;

  const r2 = addDevice(circuit, 'iec-power-supply-ac-dc', 'PS1', 300, 300, sheetId, `PSU ${inV}→${outV}`);
  circuit = r2.circuit;

  const r3 = addDevice(circuit, 'ansi-fuse', 'FU1', 200, 500, sheetId, 'DC Output Fuse');
  circuit = r3.circuit;

  const r4 = addDevice(circuit, 'iec-terminal-single', 'TB-0V', 400, 500, sheetId, '0V Distribution');
  circuit = r4.circuit;

  // Complete wiring: L, N, +24V, 0V
  circuit = addWireById(circuit, r1.deviceId, 'CB1', '2', r2.deviceId, 'PS1', '1');
  circuit = addWireById(circuit, rN.deviceId, 'TB-N', '1', r2.deviceId, 'PS1', '2');
  circuit = addWireById(circuit, r2.deviceId, 'PS1', '3', r3.deviceId, 'FU1', '1');
  circuit = addWireById(circuit, r2.deviceId, 'PS1', '4', r4.deviceId, 'TB-0V', '1');

  circuit = addAnnotation(circuit, `${inV} INPUT`, 140, 60, sheetId);
  circuit = addAnnotation(circuit, 'L', 160, 100, sheetId);
  circuit = addAnnotation(circuit, 'N', 440, 100, sheetId);
  circuit = addAnnotation(circuit, `+${outV} OUTPUT`, 140, 560, sheetId);
  circuit = addAnnotation(circuit, '0V', 440, 500, sheetId);

  return {
    circuit,
    summary: `Power section: CB1→PS1(L+N)→FU1(+${outV}), PS1→TB-0V(0V) — all pins wired`,
  };
}

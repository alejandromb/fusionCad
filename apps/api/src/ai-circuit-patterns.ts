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
  type LadderBlock,
  type LadderConfig,
  type Rung,
  type AnyDiagramBlock,
} from '@fusion-cad/core-model';

const GRID_SIZE = 20;

// ================================================================
// Drawing Layout System — coordinates scale to paper size
// ================================================================

const SHEET_SIZES: Record<string, { width: number; height: number }> = {
  'A4': { width: 1123, height: 794 },
  'A3': { width: 1587, height: 1123 },
  'Letter': { width: 1056, height: 816 },
  'Tabloid': { width: 1632, height: 1056 },
  'ANSI-D': { width: 2592, height: 1728 },
};

const BORDER_MARGIN = 40;
const TITLE_BLOCK_HEIGHT = 100;

/** Get usable drawing area for a paper size */
function getDrawingArea(paperSize: string = 'Tabloid') {
  const sheet = SHEET_SIZES[paperSize] || SHEET_SIZES['Tabloid'];
  return {
    left: BORDER_MARGIN,
    top: BORDER_MARGIN,
    right: sheet.width - BORDER_MARGIN,
    bottom: sheet.height - BORDER_MARGIN - TITLE_BLOCK_HEIGHT,
    width: sheet.width - 2 * BORDER_MARGIN,
    height: sheet.height - 2 * BORDER_MARGIN - TITLE_BLOCK_HEIGHT,
  };
}

/** Calculate layout positions as proportions of the drawing area */
function layoutForSheet(paperSize: string = 'Tabloid') {
  const area = getDrawingArea(paperSize);
  return {
    // PLC I/O sheet positions (proportional to drawing area)
    plcX: snap(area.left + area.width * 0.1),           // 10% from left
    coilX: snap(area.left + area.width * 0.55),          // 55% from left
    retTerminalX: snap(area.left + area.width * 0.75),   // 75% from left
    descriptionX: snap(area.left + area.width * 0.85),   // 85% for rung labels
    firstDeviceY: snap(area.top + 40),                    // top margin + header space
    railL1X: snap(area.left),                             // left rail at drawing edge
    railL2X: snap(area.right),                            // right rail at drawing edge
    // Contact sheet positions
    contactTbInX: snap(area.left + area.width * 0.15),
    contactX: snap(area.left + area.width * 0.40),
    contactTbOutX: snap(area.left + area.width * 0.65),
    // General
    annotationY: snap(area.top),
    area,
  };
}
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

function addSheet(circuit: CircuitData, name: string, size?: string): { circuit: CircuitData; sheetId: string } {
  const sheetId = generateId();
  return {
    sheetId,
    circuit: {
      ...circuit,
      sheets: [...(circuit.sheets || []), {
        id: sheetId, name, order: (circuit.sheets?.length || 0) + 1,
        ...(size ? { size } : {}),
        titleBlock: {
          title: name,
          date: new Date().toISOString().slice(0, 10),
          revision: 'A',
          drawingNumber: `DWG-${String((circuit.sheets?.length || 0) + 1).padStart(3, '0')}`,
          drawnBy: '',
        },
      }],
    },
  };
}

function setTransform(
  circuit: CircuitData, deviceId: string, rotation: number, mirrorH?: boolean,
): CircuitData {
  const transforms = { ...(circuit.transforms || {}) };
  transforms[deviceId] = { rotation, ...(mirrorH !== undefined ? { mirrorH } : {}) };
  return { ...circuit, transforms };
}

function addLadderBlock(
  circuit: CircuitData, sheetId: string, name: string,
  config?: Partial<LadderConfig>,
): { circuit: CircuitData; blockId: string } {
  const blockId = generateId();
  const now = Date.now();
  const fullConfig: LadderConfig = {
    railL1X: 80, railL2X: 700, firstRungY: 80, rungSpacing: 40,
    railLabelL1: '+24VDC', railLabelL2: '0V',
    numberingScheme: 'page-based',
    ...config,
  };
  const block: LadderBlock = {
    id: blockId, type: 'block', blockType: 'ladder', sheetId,
    name, position: { x: 0, y: 0 }, ladderConfig: fullConfig,
    createdAt: now, modifiedAt: now,
  };
  return {
    blockId,
    circuit: { ...circuit, blocks: [...(circuit.blocks || []), block] },
  };
}

function addRung(
  circuit: CircuitData, blockId: string, sheetId: string,
  rungNumber: number, deviceTags: string[], description?: string,
): CircuitData {
  const deviceIds: string[] = [];
  for (const tag of deviceTags) {
    const dev = circuit.devices.find(d => d.tag === tag);
    if (dev) deviceIds.push(dev.id);
  }
  const rung: Rung = {
    id: generateId(), type: 'rung', number: rungNumber,
    sheetId, blockId, deviceIds, description,
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  return { ...circuit, rungs: [...(circuit.rungs || []), rung] };
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

  const layout = layoutForSheet('Tabloid');
  const coilX = params.coilX || layout.coilX;
  const coilY = params.coilY || 80;
  const retX = layout.retTerminalX;

  // Contacts sheet: laid out HORIZONTALLY, scaled to paper
  const contactY = params.contactY || coilY;
  const tbInX = layout.contactTbInX;
  const contactX = layout.contactX;
  const tbOutX = layout.contactTbOutX;

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
  // Return terminal: align pin (at y=10 within 20px symbol) with coil pin 2 (at coilY+20)
  // So terminalY = coilY + 20 - 10 = coilY + 10
  const retTag = `RET-${params.relayTag}`;
  const r1b = addDevice(circuit, 'iec-terminal-single', retTag, retX, coilY + 10, coilSheetId, '0V Return');
  circuit = r1b.circuit;
  // Rotate return terminal 180° so pin faces left (toward the coil)
  circuit = setTransform(circuit, r1b.deviceId, 180);
  circuit = addWireById(circuit, coilDeviceId, params.relayTag, '2', r1b.deviceId, retTag, '1');

  // 4. Place linked NO contact (same tag = linked device, HORIZONTAL orientation)
  const r2 = addLinkedDevice(circuit, params.relayTag, 'ansi-normally-open-contact', contactX, contactY, contactSheetId, `${params.relayTag} NO Contact`);
  circuit = r2.circuit;
  const contactDeviceId = r2.deviceId;

  // 5. Place terminal blocks for field wiring (horizontal: TB-in ... NO contact ... TB-out)
  const tbInTag = `TB-${params.relayTag}a`;
  const tbOutTag = `TB-${params.relayTag}b`;

  // Terminals: pin at y=10 within 20px symbol. Contact pin at y=20 within 40px symbol.
  // To align: terminalY = contactY + 20 - 10 = contactY + 10
  // Left terminal: pin-right (toward contact). Right terminal: pin-left (toward contact).
  const tbAlignedY = contactY + 10;
  const r3 = addDevice(circuit, 'iec-terminal-single', tbInTag, tbInX, tbAlignedY, contactSheetId, `${params.relayTag} - IN`);
  circuit = r3.circuit;

  const r4 = addDevice(circuit, 'iec-terminal-single', tbOutTag, tbOutX, tbAlignedY, contactSheetId, `${params.relayTag} - OUT`);
  circuit = r4.circuit;
  // Rotate right-side terminal 180° so pin faces left (toward the contact)
  circuit = setTransform(circuit, r4.deviceId, 180);

  // 6. Wire by deviceId: TB-in pin 1 → NO contact pin 1; NO contact pin 2 → TB-out pin 1
  circuit = addWireById(circuit, r3.deviceId, tbInTag, '1', contactDeviceId, params.relayTag, '1');
  circuit = addWireById(circuit, contactDeviceId, params.relayTag, '2', r4.deviceId, tbOutTag, '1');

  // 7. Add rung description annotation next to the coil
  const relayNum = params.relayTag.replace(/\D/g, '');
  circuit = addAnnotation(circuit, `RELAY OUTPUT ${relayNum}`, layout.descriptionX, coilY, coilSheetId);

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
    const ps = addSheet(circuit, 'Power Distribution', 'Tabloid');
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
    const doSheet = addSheet(circuit, doSheetName, 'Tabloid');
    circuit = doSheet.circuit;

    // Create contacts sheet if needed
    let contactSheetName = doSheetName;
    let contactSheetId = doSheet.sheetId;
    if (includeContacts) {
      contactSheetName = `${relayPrefix}${relayIndex}-${relayPrefix}${relayIndex + count - 1} Field Contacts`;
      const cSheet = addSheet(circuit, contactSheetName, 'Tabloid');
      circuit = cSheet.circuit;
      contactSheetId = cSheet.sheetId;
    }

    // Place PLC DO module
    const plcTag = `PLC1-DO${sheet + 1}`;
    const plcY = 60;
    const bankLayout = layoutForSheet('Tabloid');
    const plcDev = addDevice(circuit, plcSymbolId, plcTag, bankLayout.plcX, plcY, doSheet.sheetId, `PLC DO Module ${sheet + 1}`);
    circuit = plcDev.circuit;

    // Create ladder block for this DO sheet (renders L1/L2 rails + rung numbers)
    const sheetNum = sheet + 2; // Sheet 1 = power, sheet 2+ = DO outputs
    const firstRungNum = sheetNum * 100 + 1; // Page-based: sheet 2 → 201, sheet 3 → 301
    const ladderBlock = addLadderBlock(circuit, doSheet.sheetId, `${doSheetName} Ladder`, {
      railL1X: bankLayout.railL1X, railL2X: bankLayout.railL2X,
      firstRungY: plcY + 50, // align with first PLC pin
      rungSpacing: 40,       // match PLC pin spacing
      railLabelL1: '+24VDC', railLabelL2: '0V',
      voltage: '24VDC',
      numberingScheme: 'page-based',
      firstRungNumber: firstRungNum,
    });
    circuit = ladderBlock.circuit;

    // Annotations
    circuit = addAnnotation(circuit, doSheetName.toUpperCase(), bankLayout.plcX, bankLayout.annotationY, doSheet.sheetId);

    // Create ladder block for contacts sheet too
    if (includeContacts) {
      const contactBlock = addLadderBlock(circuit, contactSheetId, `${contactSheetName} Ladder`, {
        railL1X: bankLayout.contactTbInX - 40, railL2X: bankLayout.contactTbOutX + 100,
        firstRungY: 80, rungSpacing: 80,
        railLabelL1: 'FIELD PWR', railLabelL2: 'FIELD RTN',
        numberingScheme: 'page-based',
        firstRungNumber: (sheetNum + 1) * 100 + 1,
      });
      circuit = contactBlock.circuit;
    }

    // Place relay outputs — align coil pin Y with each PLC DO pin Y
    // PLC DO-8 pins: DO0 at symbol_y+50, then every 30px
    // ANSI coil: pin 1 (A1) is at symbol_y+20 within symbol
    const firstPinAbsY = plcY + 50;
    const pinSpacing = 40;            // matches PLC DO symbol pin spacing (DIGITAL_PIN_SPACING)
    const coilPinOffset = 20;

    for (let i = 0; i < count; i++) {
      const doPin = `DO${i}`;
      const relayTag = `${relayPrefix}${relayIndex}`;
      const plcPinY = firstPinAbsY + i * pinSpacing;
      const rungY = plcPinY - coilPinOffset;
      const contactY = 80 + i * 80;

      const result = generateRelayOutput(circuit, {
        plcTag, doPin, relayTag,
        coilSheetName: doSheetName,
        contactSheetName: includeContacts ? contactSheetName : undefined,
        coilX: bankLayout.coilX, coilY: rungY,
        contactX: 200, contactY,
      });
      circuit = result.circuit;

      // Add rung to the ladder block (for rung number rendering)
      const rungNum = firstRungNum + i;
      circuit = addRung(circuit, ladderBlock.blockId, doSheet.sheetId, rungNum,
        [plcTag, relayTag], `RELAY OUTPUT ${relayIndex}`);

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

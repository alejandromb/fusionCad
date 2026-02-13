/**
 * AI-powered circuit generation endpoint.
 *
 * Uses Claude to parse natural language requirements into structured options,
 * then calls circuit-templates to generate the design.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  generateId,
  registerBuiltinSymbols,
  getSymbolById,
  lookupMotorStarter,
  type Device,
  type Part,
  type Sheet,
  type Rung,
  type LadderConfig,
  type LadderBlock,
  type AnyDiagramBlock,
  type Annotation,
  type MotorStarterResult,
} from '@fusion-cad/core-model';
import { layoutLadder, DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';

// Ensure symbols are registered for getSymbolById
registerBuiltinSymbols();

// ================================================================
//  CircuitData type (matches api-client.ts in mcp-server)
// ================================================================

interface Connection {
  fromDevice: string;
  fromDeviceId?: string;
  fromPin: string;
  toDevice: string;
  toDeviceId?: string;
  toPin: string;
  netId: string;
  waypoints?: { x: number; y: number }[];
}

interface CircuitData {
  devices: Device[];
  nets: { id: string; type: string; name: string; netType: string; createdAt: number; modifiedAt: number }[];
  parts: Part[];
  connections: Connection[];
  positions: Record<string, { x: number; y: number }>;
  sheets?: Sheet[];
  rungs?: Rung[];
  annotations?: Annotation[];
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>;
  blocks?: AnyDiagramBlock[];
}

// ================================================================
//  Circuit helpers (inlined from mcp-server to avoid cross-package dep)
// ================================================================

const GRID_SIZE = 20;
function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function generateTag(symbolId: string, devices: Device[]): string {
  const symbolDef = getSymbolById(symbolId);
  const prefix = symbolDef?.tagPrefix || 'D';
  const existingNumbers = devices
    .filter(d => d.tag.startsWith(prefix))
    .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
  const nextNum = Math.max(0, ...existingNumbers) + 1;
  return `${prefix}${nextNum}`;
}

function placeDevice(
  circuit: CircuitData, symbolId: string, x: number, y: number,
  sheetId: string, tag?: string,
): { circuit: CircuitData; tag: string; deviceId: string } {
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);
  const symbolDef = getSymbolById(symbolId);
  if (!symbolDef) throw new Error(`Symbol not found: ${symbolId}`);
  const deviceTag = tag || generateTag(symbolId, circuit.devices);
  const now = Date.now();
  const newPartId = generateId();
  const newDeviceId = generateId();
  const displayName = symbolDef.name || symbolId;
  const newPart: Part = {
    id: newPartId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: `${displayName} (unassigned)`, category: symbolId, attributes: {},
    createdAt: now, modifiedAt: now,
  };
  const newDevice: Device = {
    id: newDeviceId, type: 'device', tag: deviceTag, function: displayName,
    partId: newPartId, sheetId, createdAt: now, modifiedAt: now,
  };
  return {
    circuit: {
      ...circuit,
      parts: [...circuit.parts, newPart],
      devices: [...circuit.devices, newDevice],
      positions: { ...circuit.positions, [newDeviceId]: { x: snappedX, y: snappedY } },
    },
    tag: deviceTag, deviceId: newDeviceId,
  };
}

function placeLinkedDevice(
  circuit: CircuitData, existingTag: string, symbolId: string,
  x: number, y: number, sheetId: string,
): { circuit: CircuitData; deviceId: string } {
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);
  const symbolDef = getSymbolById(symbolId);
  if (!symbolDef) throw new Error(`Symbol not found: ${symbolId}`);
  const existingDevices = circuit.devices.filter(d => d.tag === existingTag);
  if (existingDevices.length === 0) throw new Error(`No device with tag "${existingTag}" found`);
  const now = Date.now();
  const newDeviceId = generateId();
  let groupId = existingDevices[0].deviceGroupId;
  let updatedDevices = [...circuit.devices];
  if (!groupId) {
    groupId = generateId();
    updatedDevices = updatedDevices.map(d =>
      d.tag === existingTag ? { ...d, deviceGroupId: groupId, modifiedAt: now } : d,
    );
  }
  const newPartId = generateId();
  const displayName = symbolDef.name || symbolId;
  const newPart: Part = {
    id: newPartId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: `${displayName} (linked to ${existingTag})`, category: symbolId, attributes: {},
    createdAt: now, modifiedAt: now,
  };
  const newDevice: Device = {
    id: newDeviceId, type: 'device', tag: existingTag, function: displayName,
    partId: newPartId, sheetId, deviceGroupId: groupId,
    createdAt: now, modifiedAt: now,
  };
  return {
    circuit: {
      ...circuit,
      parts: [...circuit.parts, newPart],
      devices: [...updatedDevices, newDevice],
      positions: { ...circuit.positions, [newDeviceId]: { x: snappedX, y: snappedY } },
    },
    deviceId: newDeviceId,
  };
}

function createWire(
  circuit: CircuitData, fromDevice: string, fromPin: string,
  toDevice: string, toPin: string, fromDeviceId?: string, toDeviceId?: string,
): CircuitData {
  const fromDev = fromDeviceId
    ? circuit.devices.find(d => d.id === fromDeviceId)
    : circuit.devices.find(d => d.tag === fromDevice);
  if (!fromDev) throw new Error(`Device "${fromDeviceId || fromDevice}" not found`);
  const toDev = toDeviceId
    ? circuit.devices.find(d => d.id === toDeviceId)
    : circuit.devices.find(d => d.tag === toDevice);
  if (!toDev) throw new Error(`Device "${toDeviceId || toDevice}" not found`);
  const now = Date.now();
  const newNetId = generateId();
  return {
    ...circuit,
    nets: [...circuit.nets, { id: newNetId, type: 'net', name: `NET_${circuit.nets.length + 1}`, netType: 'signal', createdAt: now, modifiedAt: now }],
    connections: [...circuit.connections, { fromDevice, fromDeviceId: fromDev.id, fromPin, toDevice, toDeviceId: toDev.id, toPin, netId: newNetId }],
  };
}

function addSheet(circuit: CircuitData, name?: string): { circuit: CircuitData; sheetId: string } {
  const sheets = circuit.sheets || [];
  const sheetNumber = sheets.length + 1;
  const sheetId = generateId();
  const now = Date.now();
  const newSheet: Sheet = {
    id: sheetId, type: 'sheet', name: name || `Sheet ${sheetNumber}`,
    number: sheetNumber, size: 'A3', createdAt: now, modifiedAt: now,
  };
  return { circuit: { ...circuit, sheets: [...sheets, newSheet] }, sheetId };
}

function addAnnotation(
  circuit: CircuitData, sheetId: string, x: number, y: number, content: string,
): { circuit: CircuitData; annotationId: string } {
  const now = Date.now();
  const annotationId = generateId();
  const annotation: Annotation = {
    id: annotationId, type: 'annotation', sheetId, annotationType: 'text',
    position: { x: snapToGrid(x), y: snapToGrid(y) }, content,
    style: { fontSize: 14 }, createdAt: now, modifiedAt: now,
  };
  return {
    circuit: { ...circuit, annotations: [...(circuit.annotations || []), annotation] },
    annotationId,
  };
}

function assignPart(
  circuit: CircuitData, deviceTag: string, manufacturer: string,
  partNumber: string, description: string, category: string,
): CircuitData {
  const deviceIdx = circuit.devices.findIndex(d => d.tag === deviceTag);
  if (deviceIdx === -1) throw new Error(`Device "${deviceTag}" not found`);
  const device = circuit.devices[deviceIdx];
  const now = Date.now();
  let symbolCategory = category;
  if (device.partId) {
    const oldPart = circuit.parts.find(p => p.id === device.partId);
    if (oldPart && getSymbolById(oldPart.category)) symbolCategory = oldPart.category;
  }
  let filteredParts = circuit.parts;
  if (device.partId) {
    const oldPartUsedByOthers = circuit.devices.some((d, i) => i !== deviceIdx && d.partId === device.partId);
    if (!oldPartUsedByOthers) filteredParts = filteredParts.filter(p => p.id !== device.partId);
  }
  const newPartId = generateId();
  const newPart: Part = {
    id: newPartId, type: 'part', manufacturer, partNumber, description,
    category: symbolCategory, attributes: {}, createdAt: now, modifiedAt: now,
  };
  const updatedDevices = [...circuit.devices];
  updatedDevices[deviceIdx] = { ...device, partId: newPartId, modifiedAt: now };
  return { ...circuit, parts: [...filteredParts, newPart], devices: updatedDevices };
}

function createLadderBlock(
  circuit: CircuitData, sheetId: string, ladderConfig?: Partial<LadderConfig>,
  position?: { x: number; y: number }, name?: string,
): { circuit: CircuitData; blockId: string } {
  const sheets = circuit.sheets || [];
  const sheet = sheets.find(s => s.id === sheetId);
  const now = Date.now();
  const blockId = generateId();
  const fullConfig: LadderConfig = { ...DEFAULT_LADDER_CONFIG, ...ladderConfig };
  const block: LadderBlock = {
    id: blockId, type: 'block', blockType: 'ladder', sheetId,
    name: name || `${sheet?.name ?? 'Sheet 1'} Ladder`,
    position: position ?? { x: 0, y: 0 }, ladderConfig: fullConfig,
    createdAt: now, modifiedAt: now,
  };
  return { circuit: { ...circuit, blocks: [...(circuit.blocks || []), block] }, blockId };
}

function autoLayoutLadder(
  circuit: CircuitData, sheetId: string, blockId?: string,
): { circuit: CircuitData } {
  let config: LadderConfig;
  let rungs: Rung[];
  let blockOffset: { x: number; y: number } | undefined;
  if (blockId) {
    const block = (circuit.blocks || []).find(b => b.id === blockId);
    if (!block || block.blockType !== 'ladder') return { circuit };
    config = (block as LadderBlock).ladderConfig;
    rungs = (circuit.rungs || []).filter(r => r.blockId === blockId);
    blockOffset = block.position;
  } else {
    const sheet = (circuit.sheets || []).find(s => s.id === sheetId);
    if (!sheet) return { circuit };
    config = (sheet as any).ladderConfig ?? DEFAULT_LADDER_CONFIG;
    rungs = (circuit.rungs || []).filter(r => r.sheetId === sheetId);
  }
  const devices = circuit.devices.filter(d => d.sheetId === sheetId);
  const result = layoutLadder(rungs, devices, config, blockOffset);
  const updatedPositions = { ...circuit.positions };
  for (const [deviceId, pos] of Object.entries(result.positions)) {
    updatedPositions[deviceId] = pos;
  }
  const updatedTransforms: Record<string, { rotation: number; mirrorH?: boolean }> = { ...(circuit.transforms || {}) };
  for (const deviceId of Object.keys(result.positions)) {
    updatedTransforms[deviceId] = { rotation: -90 };
  }
  return { circuit: { ...circuit, positions: updatedPositions, transforms: updatedTransforms } };
}

function createLadderRails(circuit: CircuitData, sheetId: string, blockId?: string): CircuitData {
  let cd = circuit;
  let config: LadderConfig;
  let rungs: Rung[];
  let blockOffset = { x: 0, y: 0 };
  if (blockId) {
    const block = (cd.blocks || []).find(b => b.id === blockId);
    if (!block || block.blockType !== 'ladder') return cd;
    config = (block as LadderBlock).ladderConfig;
    rungs = (cd.rungs || []).filter(r => r.blockId === blockId).sort((a, b) => a.number - b.number);
    blockOffset = block.position;
  } else {
    return cd;
  }
  if (rungs.length === 0) return cd;
  const PIN_OFFSET = 6;
  const l1Junctions: { deviceId: string; tag: string; rungNumber: number }[] = [];
  const l2Junctions: { deviceId: string; tag: string; rungNumber: number }[] = [];
  const ox = blockOffset.x;
  const oy = blockOffset.y;
  for (const rung of rungs) {
    const rungY = config.firstRungY + (rung.number - 1) * config.rungSpacing + oy;
    const l1Tag = `JL${rung.number}`;
    const l1 = placeDevice(cd, 'junction', 0, 0, sheetId, l1Tag);
    cd = l1.circuit;
    cd = { ...cd, positions: { ...cd.positions, [l1.deviceId]: { x: config.railL1X - PIN_OFFSET + ox, y: rungY - PIN_OFFSET } } };
    l1Junctions.push({ deviceId: l1.deviceId, tag: l1Tag, rungNumber: rung.number });
    if (!rung.branchOf) {
      const l2Tag = `JR${rung.number}`;
      const l2 = placeDevice(cd, 'junction', 0, 0, sheetId, l2Tag);
      cd = l2.circuit;
      cd = { ...cd, positions: { ...cd.positions, [l2.deviceId]: { x: config.railL2X - PIN_OFFSET + ox, y: rungY - PIN_OFFSET } } };
      l2Junctions.push({ deviceId: l2.deviceId, tag: l2Tag, rungNumber: rung.number });
    }
  }
  for (let i = 0; i < l1Junctions.length - 1; i++) {
    const from = l1Junctions[i]; const to = l1Junctions[i + 1];
    cd = createWire(cd, from.tag, '1', to.tag, '1', from.deviceId, to.deviceId);
  }
  for (let i = 0; i < l2Junctions.length - 1; i++) {
    const from = l2Junctions[i]; const to = l2Junctions[i + 1];
    cd = createWire(cd, from.tag, '1', to.tag, '1', from.deviceId, to.deviceId);
  }
  for (const rung of rungs) {
    if (rung.deviceIds.length === 0) continue;
    const firstDeviceId = rung.deviceIds[0];
    const firstDevice = cd.devices.find(d => d.id === firstDeviceId);
    if (!firstDevice) continue;
    const l1J = l1Junctions.find(j => j.rungNumber === rung.number);
    if (!l1J) continue;
    cd = createWire(cd, l1J.tag, '1', firstDevice.tag, '1', l1J.deviceId, firstDeviceId);
  }
  for (const rung of rungs) {
    if (rung.branchOf) continue;
    if (rung.deviceIds.length === 0) continue;
    const lastDeviceId = rung.deviceIds[rung.deviceIds.length - 1];
    const lastDevice = cd.devices.find(d => d.id === lastDeviceId);
    if (!lastDevice) continue;
    const l2J = l2Junctions.find(j => j.rungNumber === rung.number);
    if (!l2J) continue;
    cd = createWire(cd, lastDevice.tag, '2', l2J.tag, '1', lastDeviceId, l2J.deviceId);
  }
  return cd;
}

// ================================================================
//  Motor Starter Panel Generator
// ================================================================

interface PanelOptions {
  hp: string;
  voltage: string;
  phase?: 'single' | 'three';
  controlVoltage?: '24VDC' | '120VAC';
  country?: 'USA' | 'Canada';
  starterType?: string;
  hoaSwitch?: boolean;
  pilotLight?: boolean;
  plcRemote?: boolean;
  eStop?: boolean;
  panelLayout?: boolean;
}

function generateMotorStarterPanel(
  circuit: CircuitData,
  options: PanelOptions,
  motorData?: MotorStarterResult,
): { circuit: CircuitData; summary: string } {
  let cd = circuit;
  const controlVoltage = options.controlVoltage || '120VAC';
  const hasEStop = options.eStop !== false;
  const hasHOA = options.hoaSwitch || false;
  const hasPLC = options.plcRemote || false;
  const hasPilot = options.pilotLight !== false;

  // Create sheet
  const mainSheet = addSheet(cd, 'Motor Starter');
  cd = mainSheet.circuit;
  const sheetId = mainSheet.sheetId;

  // Power section (top)
  const cb1 = placeDevice(cd, 'iec-circuit-breaker-3p', 100, 60, sheetId, 'CB1');
  cd = cb1.circuit;
  const k1power = placeDevice(cd, 'iec-contactor-3p', 100, 180, sheetId, 'K1');
  cd = k1power.circuit;
  const f1power = placeDevice(cd, 'iec-thermal-overload-relay-3p', 100, 300, sheetId, 'F1');
  cd = f1power.circuit;
  const m1 = placeDevice(cd, 'iec-motor-3ph', 100, 420, sheetId, 'M1');
  cd = m1.circuit;

  // Phase wires
  cd = createWire(cd, 'CB1', 'T1', 'K1', 'L1', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T1', 'F1', 'L1', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T1', 'M1', '1', f1power.deviceId, m1.deviceId);
  cd = createWire(cd, 'CB1', 'T2', 'K1', 'L2', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T2', 'F1', 'L2', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T2', 'M1', '2', f1power.deviceId, m1.deviceId);
  cd = createWire(cd, 'CB1', 'T3', 'K1', 'L3', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T3', 'F1', 'L3', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T3', 'M1', '3', f1power.deviceId, m1.deviceId);

  // Ladder block (below power)
  const ladderBlock = createLadderBlock(cd, sheetId, {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
    firstRungY: 100,
    rungSpacing: 120,
  }, { x: 0, y: 560 }, 'Motor Control');
  cd = ladderBlock.circuit;
  const controlBlockId = ladderBlock.blockId;

  // Rung 1: OL → (E-Stop) → Stop → Start → Junction → K1 Coil
  let rungNumber = 1;
  const rung1DeviceIds: string[] = [];

  const ol = placeLinkedDevice(cd, 'F1', 'iec-normally-closed-contact', 0, 0, sheetId);
  cd = ol.circuit;
  rung1DeviceIds.push(ol.deviceId);

  if (hasEStop) {
    const estop = placeDevice(cd, 'iec-emergency-stop', 0, 0, sheetId, 'ES1');
    cd = estop.circuit;
    rung1DeviceIds.push(estop.deviceId);
  }

  const stop = placeDevice(cd, 'iec-normally-closed-contact', 0, 0, sheetId, 'S2');
  cd = stop.circuit;
  rung1DeviceIds.push(stop.deviceId);

  const start = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'S1');
  cd = start.circuit;
  rung1DeviceIds.push(start.deviceId);

  const junction = placeDevice(cd, 'junction', 0, 0, sheetId, 'J1');
  cd = junction.circuit;
  rung1DeviceIds.push(junction.deviceId);

  const coil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
  cd = coil.circuit;
  rung1DeviceIds.push(coil.deviceId);

  cd = { ...cd, rungs: [...(cd.rungs || []), {
    id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
    blockId: controlBlockId, deviceIds: rung1DeviceIds,
    description: 'Motor starter control', createdAt: Date.now(), modifiedAt: Date.now(),
  }] };

  // Rung 2: Seal-in (branch)
  rungNumber++;
  const sealin = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
  cd = sealin.circuit;
  cd = { ...cd, rungs: [...(cd.rungs || []), {
    id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
    blockId: controlBlockId, deviceIds: [sealin.deviceId],
    description: 'Seal-in circuit', branchOf: 1, createdAt: Date.now(), modifiedAt: Date.now(),
  }] };

  // HOA Hand rung
  let hoaHandDeviceId: string | undefined;
  let hoaHandCoilId: string | undefined;
  if (hasHOA) {
    rungNumber++;
    const hoaHand = placeDevice(cd, 'iec-selector-switch', 0, 0, sheetId, 'HOA-H');
    cd = hoaHand.circuit;
    hoaHandDeviceId = hoaHand.deviceId;
    const hoaCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = hoaCoil.circuit;
    hoaHandCoilId = hoaCoil.deviceId;
    cd = { ...cd, rungs: [...(cd.rungs || []), {
      id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
      blockId: controlBlockId, deviceIds: [hoaHand.deviceId, hoaCoil.deviceId],
      description: 'HOA - Hand (manual override)', createdAt: Date.now(), modifiedAt: Date.now(),
    }] };
  }

  // HOA Auto + PLC or standalone PLC
  let plcDeviceId: string | undefined;
  let plcCoilId: string | undefined;
  let hoaAutoDeviceId: string | undefined;
  if (hasHOA && hasPLC) {
    rungNumber++;
    const hoaAuto = placeDevice(cd, 'iec-selector-switch', 0, 0, sheetId, 'HOA-A');
    cd = hoaAuto.circuit;
    hoaAutoDeviceId = hoaAuto.deviceId;
    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;
    const plcAutoCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcAutoCoil.circuit;
    plcCoilId = plcAutoCoil.deviceId;
    cd = { ...cd, rungs: [...(cd.rungs || []), {
      id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
      blockId: controlBlockId, deviceIds: [hoaAuto.deviceId, plcContact.deviceId, plcAutoCoil.deviceId],
      description: 'HOA - Auto (PLC remote)', createdAt: Date.now(), modifiedAt: Date.now(),
    }] };
  } else if (hasPLC && !hasHOA) {
    rungNumber++;
    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;
    const plcCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcCoil.circuit;
    plcCoilId = plcCoil.deviceId;
    cd = { ...cd, rungs: [...(cd.rungs || []), {
      id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
      blockId: controlBlockId, deviceIds: [plcContact.deviceId, plcCoil.deviceId],
      description: 'PLC remote start', createdAt: Date.now(), modifiedAt: Date.now(),
    }] };
  }

  // Pilot light rung
  let k1AuxDeviceId: string | undefined;
  let pilotDeviceId: string | undefined;
  if (hasPilot) {
    rungNumber++;
    const k1aux = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
    cd = k1aux.circuit;
    k1AuxDeviceId = k1aux.deviceId;
    const pilot = placeDevice(cd, 'iec-pilot-light', 0, 0, sheetId, 'PL1');
    cd = pilot.circuit;
    pilotDeviceId = pilot.deviceId;
    cd = { ...cd, rungs: [...(cd.rungs || []), {
      id: generateId(), type: 'rung' as const, number: rungNumber, sheetId,
      blockId: controlBlockId, deviceIds: [k1aux.deviceId, pilot.deviceId],
      description: 'Running indicator', createdAt: Date.now(), modifiedAt: Date.now(),
    }] };
  }

  // Auto-layout
  const layout = autoLayoutLadder(cd, sheetId, controlBlockId);
  cd = layout.circuit;

  // Wire rung 1
  for (let i = 0; i < rung1DeviceIds.length - 1; i++) {
    const fromId = rung1DeviceIds[i];
    const toId = rung1DeviceIds[i + 1];
    const fromDev = cd.devices.find(d => d.id === fromId)!;
    const toDev = cd.devices.find(d => d.id === toId)!;
    const fromPin = fromDev.tag.startsWith('J') ? '1' : '2';
    cd = createWire(cd, fromDev.tag, fromPin, toDev.tag, '1', fromId, toId);
  }

  // Wire rung 2 (seal-in)
  cd = createWire(cd, 'K1', '2', 'J1', '1', sealin.deviceId, junction.deviceId);

  // Wire HOA Hand
  if (hasHOA && hoaHandDeviceId && hoaHandCoilId) {
    cd = createWire(cd, 'HOA-H', '2', 'K1', '1', hoaHandDeviceId, hoaHandCoilId);
  }
  // Wire HOA Auto + PLC
  if (hasHOA && hasPLC && hoaAutoDeviceId && plcDeviceId && plcCoilId) {
    cd = createWire(cd, 'HOA-A', '2', 'PLC1', '1', hoaAutoDeviceId, plcDeviceId);
    cd = createWire(cd, 'PLC1', '2', 'K1', '1', plcDeviceId, plcCoilId);
  } else if (hasPLC && !hasHOA && plcDeviceId && plcCoilId) {
    cd = createWire(cd, 'PLC1', '2', 'K1', '1', plcDeviceId, plcCoilId);
  }
  // Wire pilot light
  if (hasPilot && k1AuxDeviceId && pilotDeviceId) {
    cd = createWire(cd, 'K1', '2', 'PL1', '1', k1AuxDeviceId, pilotDeviceId);
  }

  // Rails
  cd = createLadderRails(cd, sheetId, controlBlockId);

  // Assign real parts
  if (motorData) {
    const { components } = motorData;
    cd = assignPart(cd, 'CB1', components.circuitBreaker.manufacturer,
      components.circuitBreaker.partNumber, components.circuitBreaker.description,
      components.circuitBreaker.category);
    cd = assignPart(cd, 'K1', components.contactor.manufacturer,
      components.contactor.partNumber, components.contactor.description,
      components.contactor.category);
    cd = assignPart(cd, 'F1', components.overloadRelay.manufacturer,
      components.overloadRelay.partNumber, components.overloadRelay.description,
      components.overloadRelay.category);
    cd = assignPart(cd, 'M1', 'Generic',
      `MOTOR-${motorData.spec.hp}HP-${motorData.spec.voltage}`,
      `${motorData.spec.hp} HP ${motorData.spec.voltage} ${motorData.spec.phase === 'three' ? '3-Phase' : '1-Phase'} Motor`,
      'motor');
  }

  // Panel layout
  if (options.panelLayout) {
    const hp = parseFloat(options.hp) || 5;
    let enclosureSymbol = 'panel-enclosure-20x16';
    let subpanelSymbol = 'panel-subpanel-20x16';
    if (hp > 10) { enclosureSymbol = 'panel-enclosure-24x20'; subpanelSymbol = 'panel-subpanel-24x20'; }
    if (hp > 30) { enclosureSymbol = 'panel-enclosure-30x24'; subpanelSymbol = 'panel-subpanel-30x24'; }

    const layoutSheet = addSheet(cd, 'Panel Layout');
    cd = layoutSheet.circuit;
    const layoutSheetId = layoutSheet.sheetId;
    const encl = placeDevice(cd, enclosureSymbol, 60, 60, layoutSheetId, 'PNL1');
    cd = encl.circuit;
    const sub = placeDevice(cd, subpanelSymbol, 70, 70, layoutSheetId, 'SP1');
    cd = sub.circuit;
    for (const a of [
      { x: 100, y: 135, text: 'CB1' },
      { x: 180, y: 135, text: 'K1' },
      { x: 280, y: 135, text: 'F1' },
      { x: 100, y: 225, text: 'Terminal Block' },
    ]) {
      const ann = addAnnotation(cd, layoutSheetId, a.x, a.y, a.text);
      cd = ann.circuit;
    }
  }

  const summary = `Motor starter panel: ${options.hp} HP @ ${options.voltage}, ` +
    `${cd.devices.length} devices, ${cd.connections.length} wires` +
    (motorData ? `, Schneider parts assigned` : '') +
    (options.panelLayout ? `, panel layout included` : '');

  return { circuit: cd, summary };
}

// ================================================================
//  Claude API Integration
// ================================================================

const SYSTEM_PROMPT = `You are an electrical engineering assistant that interprets natural language motor starter panel requirements and outputs structured JSON.

Given a user's description of a motor control panel, extract these parameters:
- hp: Motor horsepower (string, e.g., "30", "0.5", "1/2")
- voltage: Supply voltage (string, e.g., "208V", "480V", "240V")
- phase: "single" or "three" (default: "three")
- controlVoltage: "24VDC" or "120VAC" (default: "120VAC")
- country: "USA" or "Canada" (default: "USA")
- starterType: "iec-open", "iec-enclosed", "nema-open", or "nema-enclosed" (default: "iec-open")
- hoaSwitch: boolean — true if user mentions HOA, Hand-Off-Auto, selector switch, or mode selection
- pilotLight: boolean — true if user mentions pilot light, indicator, running light (default: true)
- plcRemote: boolean — true if user mentions PLC, remote, automation, auto contact
- eStop: boolean — true if user mentions emergency stop, E-stop (default: true)
- panelLayout: boolean — true if user mentions panel layout, enclosure layout, physical layout

Standard North American voltages:
- Single phase: 120V, 208V, 240V
- Three phase: 208V, 240V, 480V, 600V

Common patterns:
- "HOA switch" → hoaSwitch: true
- "PLC remote contact" → plcRemote: true, usually with hoaSwitch: true
- "manual start stop" → basic 3-wire control (always included)
- "control light" or "pilot light" → pilotLight: true

Respond with ONLY a JSON object, no markdown, no explanation:
{"hp":"...","voltage":"...","phase":"...","controlVoltage":"...","country":"...","starterType":"...","hoaSwitch":...,"pilotLight":...,"plcRemote":...,"eStop":...,"panelLayout":...}`;

export interface AIGenerateResult {
  success: boolean;
  summary?: string;
  circuitData?: CircuitData;
  error?: string;
  parsedOptions?: PanelOptions;
}

export async function aiGenerate(
  prompt: string,
  existingCircuitData: CircuitData,
): Promise<AIGenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY environment variable is not set. Set it to enable AI generation.' };
  }

  const anthropic = new Anthropic({ apiKey });

  // Step 1: Parse the prompt with Claude
  let parsedOptions: PanelOptions;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { success: false, error: 'No text response from Claude' };
    }

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    parsedOptions = JSON.parse(jsonStr) as PanelOptions;
  } catch (err: any) {
    return { success: false, error: `Failed to parse requirements: ${err.message}` };
  }

  // Step 2: Look up motor data
  const motorData = lookupMotorStarter({
    hp: parsedOptions.hp,
    voltage: parsedOptions.voltage,
    country: parsedOptions.country,
    phase: parsedOptions.phase,
    starterType: parsedOptions.starterType as any,
  });

  // Step 3: Generate the circuit
  try {
    const result = generateMotorStarterPanel(existingCircuitData, parsedOptions, motorData || undefined);
    return {
      success: true,
      summary: result.summary,
      circuitData: result.circuit,
      parsedOptions,
    };
  } catch (err: any) {
    return { success: false, error: `Failed to generate circuit: ${err.message}`, parsedOptions };
  }
}

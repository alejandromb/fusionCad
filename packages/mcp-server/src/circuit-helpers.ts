/**
 * Circuit manipulation helpers for the MCP server.
 *
 * Extracted from the web app's useCircuitState.ts — pure functions
 * that operate on CircuitData without React dependencies.
 */

import { generateId, getSymbolById, resolveSymbol, GRID_MM, LADDER_LAYOUT_PRESETS, DEFAULT_LADDER_MM, type Device, type Part, type Annotation, type Sheet, type Rung, type LadderConfig, type DiagramType, type LadderBlock, type AnyDiagramBlock, type SheetLadderLayout } from '@fusion-cad/core-model';
import { layoutLadder, DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import type { CircuitData, Connection } from './api-client.js';

const GRID_SIZE = GRID_MM; // 5mm grid — all coordinates are in mm

/**
 * Resolve a symbol by ID, using the full 4-tier resolution (exact → alias → generator → fallback).
 * Throws if the symbol resolves to a generic fallback (truly unknown symbol).
 */
function resolveSymbolOrThrow(symbolId: string): ReturnType<typeof resolveSymbol> {
  const sym = resolveSymbol(symbolId);
  if (sym.source === 'generated-fallback') {
    throw new Error(`Symbol not found: ${symbolId}. Use list_symbols to see available symbols.`);
  }
  return sym;
}

/** Snap a coordinate to the 20px grid (matches web app) */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Generate the next available tag for a symbol.
 * E.g., if symbolId has tagPrefix 'K' and devices already have K1, K2 → returns 'K3'.
 */
export function generateTag(symbolId: string, devices: Device[]): string {
  const symbolDef = getSymbolById(symbolId);
  const prefix = symbolDef?.tagPrefix || 'D';

  const existingNumbers = devices
    .filter(d => d.tag.startsWith(prefix))
    .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
  const nextNum = Math.max(0, ...existingNumbers) + 1;
  return `${prefix}${nextNum}`;
}

/**
 * Detect whether positions are tag-keyed (legacy) or ID-keyed (new).
 * ULID keys are 26 uppercase alphanumeric characters.
 */
export function migratePositions(
  positions: Record<string, { x: number; y: number }>,
  devices: Device[],
): Record<string, { x: number; y: number }> {
  const migrated: Record<string, { x: number; y: number }> = {};
  for (const [key, pos] of Object.entries(positions)) {
    if (key.length === 26 && /^[0-9A-Z]+$/.test(key)) {
      migrated[key] = pos;
    } else {
      const device = devices.find(d => d.tag === key);
      if (device) migrated[device.id] = pos;
    }
  }
  return migrated;
}

/**
 * Place a device onto the circuit.
 * Creates a placeholder Part + Device + position entry (keyed by device ID).
 * Returns the mutated circuitData and the new device tag.
 */
export function placeDevice(
  circuit: CircuitData,
  symbolId: string,
  x: number,
  y: number,
  sheetId: string,
  tag?: string,
): { circuit: CircuitData; tag: string; deviceId: string } {
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  const symbolDef = resolveSymbolOrThrow(symbolId);

  const deviceTag = tag || generateTag(symbolId, circuit.devices);

  // Check for duplicate tag (warn but allow for linked devices)
  if (circuit.devices.some(d => d.tag === deviceTag)) {
    throw new Error(`Device tag "${deviceTag}" already exists. Use place_linked_device for linked representations, or choose a different tag.`);
  }

  const now = Date.now();
  const newPartId = generateId();
  const newDeviceId = generateId();
  const displayName = symbolDef.name || symbolId;

  const newPart: Part = {
    id: newPartId,
    type: 'part',
    manufacturer: 'Unassigned',
    partNumber: 'TBD',
    description: `${displayName} (unassigned)`,
    category: symbolId,
    attributes: {},
    createdAt: now,
    modifiedAt: now,
  };

  const newDevice: Device = {
    id: newDeviceId,
    type: 'device',
    tag: deviceTag,
    function: displayName,
    partId: newPartId,
    sheetId,
    createdAt: now,
    modifiedAt: now,
  };

  return {
    circuit: {
      ...circuit,
      parts: [...circuit.parts, newPart],
      devices: [...circuit.devices, newDevice],
      positions: { ...circuit.positions, [newDeviceId]: { x: snappedX, y: snappedY } },
    },
    tag: deviceTag,
    deviceId: newDeviceId,
  };
}

/**
 * Delete a device by tag. Cascades: removes connections referencing this device,
 * removes the position entry, and removes the part if orphaned.
 */
export function deleteDevice(circuit: CircuitData, deviceTag: string): CircuitData {
  const device = circuit.devices.find(d => d.tag === deviceTag);
  if (!device) {
    throw new Error(`Device "${deviceTag}" not found`);
  }

  const filteredDevices = circuit.devices.filter(d => d.id !== device.id);
  const filteredConnections = circuit.connections.filter(c => {
    // Use deviceId fields when available, fall back to tag
    const fromId = c.fromDeviceId || circuit.devices.find(d => d.tag === c.fromDevice)?.id;
    const toId = c.toDeviceId || circuit.devices.find(d => d.tag === c.toDevice)?.id;
    return fromId !== device.id && toId !== device.id;
  });

  // Remove orphaned part
  const partStillUsed = device.partId
    ? filteredDevices.some(d => d.partId === device.partId)
    : true;
  const filteredParts = partStillUsed
    ? circuit.parts
    : circuit.parts.filter(p => p.id !== device.partId);

  // Remove orphaned nets (nets with no remaining connections)
  const usedNetIds = new Set(filteredConnections.map(c => c.netId));
  const filteredNets = circuit.nets.filter(n => usedNetIds.has(n.id));

  // Remove position by device ID
  const { [device.id]: _removed, ...remainingPositions } = circuit.positions;

  return {
    ...circuit,
    devices: filteredDevices,
    connections: filteredConnections,
    parts: filteredParts,
    nets: filteredNets,
    positions: remainingPositions,
  };
}

/**
 * Update device properties. If tag is renamed, cascades to connections.
 * Positions are ID-keyed so they don't need cascading on tag rename.
 */
export function updateDevice(
  circuit: CircuitData,
  deviceTag: string,
  updates: { tag?: string; function?: string; location?: string },
): CircuitData {
  const idx = circuit.devices.findIndex(d => d.tag === deviceTag);
  if (idx === -1) {
    throw new Error(`Device "${deviceTag}" not found`);
  }

  const updatedDevices = [...circuit.devices];
  updatedDevices[idx] = { ...updatedDevices[idx], ...updates, modifiedAt: Date.now() };

  let updatedConnections = circuit.connections;

  // Cascade tag rename to connections (fromDevice/toDevice display fields)
  if (updates.tag && updates.tag !== deviceTag) {
    const newTag = updates.tag;
    updatedConnections = circuit.connections.map(c => {
      let conn = c;
      if (c.fromDevice === deviceTag) conn = { ...conn, fromDevice: newTag };
      if (c.toDevice === deviceTag) conn = { ...conn, toDevice: newTag };
      return conn;
    });
  }

  return {
    ...circuit,
    devices: updatedDevices,
    connections: updatedConnections,
    positions: circuit.positions, // ID-keyed, no cascade needed
  };
}

/**
 * Create a wire connection between two device pins.
 * Creates a new Net and Connection entry with device IDs for reliable lookup.
 */
export function createWire(
  circuit: CircuitData,
  fromDevice: string,
  fromPin: string,
  toDevice: string,
  toPin: string,
  fromDeviceId?: string,
  toDeviceId?: string,
  waypoints?: Array<{ x: number; y: number }>,
): CircuitData {
  // Validate devices exist — use device ID when provided (needed for linked devices with same tag)
  const fromDev = fromDeviceId
    ? circuit.devices.find(d => d.id === fromDeviceId)
    : circuit.devices.find(d => d.tag === fromDevice);
  if (!fromDev) {
    throw new Error(`Device "${fromDeviceId || fromDevice}" not found`);
  }
  const toDev = toDeviceId
    ? circuit.devices.find(d => d.id === toDeviceId)
    : circuit.devices.find(d => d.tag === toDevice);
  if (!toDev) {
    throw new Error(`Device "${toDeviceId || toDevice}" not found`);
  }

  // Validate pin IDs against symbol definitions (soft — skips if symbol not found)
  for (const [dev, pin, tag] of [[fromDev, fromPin, fromDevice], [toDev, toPin, toDevice]] as const) {
    const part = circuit.parts.find(p => p.id === dev.partId);
    if (part) {
      const symbolDef = getSymbolById(part.category);
      if (symbolDef) {
        const validPinIds = symbolDef.pins.map(p => p.id);
        if (!validPinIds.includes(pin)) {
          throw new Error(
            `Invalid pin "${pin}" on device "${tag}" (symbol: ${symbolDef.name}). Valid pins: ${validPinIds.join(', ')}`,
          );
        }
      }
    }
  }

  // Check for duplicate connection (by device ID or tag)
  const duplicate = circuit.connections.some(c => {
    const cFromId = c.fromDeviceId || circuit.devices.find(d => d.tag === c.fromDevice)?.id;
    const cToId = c.toDeviceId || circuit.devices.find(d => d.tag === c.toDevice)?.id;
    return (
      (cFromId === fromDev.id && c.fromPin === fromPin && cToId === toDev.id && c.toPin === toPin) ||
      (cFromId === toDev.id && c.fromPin === toPin && cToId === fromDev.id && c.toPin === fromPin)
    );
  });
  if (duplicate) {
    throw new Error(`Connection already exists between ${fromDevice}:${fromPin} and ${toDevice}:${toPin}`);
  }

  const now = Date.now();
  const newNetId = generateId();

  const newNet = {
    id: newNetId,
    type: 'net' as const,
    name: `NET_${circuit.nets.length + 1}`,
    netType: 'signal' as const,
    createdAt: now,
    modifiedAt: now,
  };

  // Derive sheetId from the endpoint devices — both should be on the same sheet.
  // Prefer fromDevice's sheet; if devices are on different sheets, the wire
  // belongs to whichever sheet contains the "from" device.
  const wireSheetId = fromDev.sheetId || toDev.sheetId;

  const newConnection: Connection & { waypoints?: Array<{ x: number; y: number }> } = {
    fromDevice,
    fromDeviceId: fromDev.id,
    fromPin,
    toDevice,
    toDeviceId: toDev.id,
    toPin,
    netId: newNetId,
    ...(wireSheetId ? { sheetId: wireSheetId } : {}),
    ...(waypoints && waypoints.length > 0 ? { waypoints } : {}),
  };

  return {
    ...circuit,
    nets: [...circuit.nets, newNet],
    connections: [...circuit.connections, newConnection],
  };
}

/**
 * Delete a wire connection matching the given endpoints.
 * Matches by device ID when available, falls back to tag.
 */
export function deleteWire(
  circuit: CircuitData,
  fromDevice: string,
  fromPin: string,
  toDevice: string,
  toPin: string,
  fromDeviceId?: string,
  toDeviceId?: string,
): CircuitData {
  // Resolve device IDs for reliable matching — use explicit ID when provided
  const fromDev = fromDeviceId
    ? circuit.devices.find(d => d.id === fromDeviceId)
    : circuit.devices.find(d => d.tag === fromDevice);
  const toDev = toDeviceId
    ? circuit.devices.find(d => d.id === toDeviceId)
    : circuit.devices.find(d => d.tag === toDevice);

  const idx = circuit.connections.findIndex(c => {
    const cFromId = c.fromDeviceId || circuit.devices.find(d => d.tag === c.fromDevice)?.id;
    const cToId = c.toDeviceId || circuit.devices.find(d => d.tag === c.toDevice)?.id;
    return (
      (cFromId === fromDev?.id && c.fromPin === fromPin && cToId === toDev?.id && c.toPin === toPin) ||
      (cFromId === toDev?.id && c.fromPin === toPin && cToId === fromDev?.id && c.toPin === fromPin)
    );
  });

  if (idx === -1) {
    throw new Error(`Wire not found between ${fromDevice}:${fromPin} and ${toDevice}:${toPin}`);
  }

  const removedNetId = circuit.connections[idx].netId;
  const filteredConnections = circuit.connections.filter((_, i) => i !== idx);

  // Remove net if orphaned
  const netStillUsed = filteredConnections.some(c => c.netId === removedNetId);
  const filteredNets = netStillUsed
    ? circuit.nets
    : circuit.nets.filter(n => n.id !== removedNetId);

  return {
    ...circuit,
    connections: filteredConnections,
    nets: filteredNets,
  };
}

/**
 * Assign a catalog part to a device.
 */
export function assignPart(
  circuit: CircuitData,
  deviceTag: string,
  manufacturer: string,
  partNumber: string,
  description: string,
  category: string,
): CircuitData {
  const deviceIdx = circuit.devices.findIndex(d => d.tag === deviceTag);
  if (deviceIdx === -1) {
    throw new Error(`Device "${deviceTag}" not found`);
  }

  const device = circuit.devices[deviceIdx];
  const now = Date.now();

  // ALWAYS preserve the original part's category (symbolId) for rendering.
  // The web app uses part.category to look up which symbol to draw.
  // Layout symbols (imported DXF/SVG) are only in the DB, not in-memory registry,
  // so we must never overwrite the category — it's the symbol key.
  let symbolCategory = category;
  if (device.partId) {
    const oldPart = circuit.parts.find(p => p.id === device.partId);
    if (oldPart) {
      symbolCategory = oldPart.category;
    }
  }

  // Remove old placeholder part if exists and is orphaned
  let filteredParts = circuit.parts;
  if (device.partId) {
    const oldPartUsedByOthers = circuit.devices.some(
      (d, i) => i !== deviceIdx && d.partId === device.partId,
    );
    if (!oldPartUsedByOthers) {
      filteredParts = filteredParts.filter(p => p.id !== device.partId);
    }
  }

  const newPartId = generateId();
  const newPart: Part = {
    id: newPartId,
    type: 'part',
    manufacturer,
    partNumber,
    description,
    category: symbolCategory,
    attributes: {},
    createdAt: now,
    modifiedAt: now,
  };

  const updatedDevices = [...circuit.devices];
  updatedDevices[deviceIdx] = { ...device, partId: newPartId, modifiedAt: now };

  return {
    ...circuit,
    parts: [...filteredParts, newPart],
    devices: updatedDevices,
  };
}

/**
 * Add a new sheet to the project.
 */
export function addSheet(circuit: CircuitData, name?: string): { circuit: CircuitData; sheetId: string } {
  let sheets = circuit.sheets || [];
  const now = Date.now();

  // If sheets is empty but devices exist on 'sheet-1', bootstrap the default sheet
  if (sheets.length === 0 && circuit.devices.some(d => d.sheetId === WEB_APP_DEFAULT_SHEET_ID)) {
    sheets = [{
      id: WEB_APP_DEFAULT_SHEET_ID,
      type: 'sheet',
      name: 'Sheet 1',
      number: 1,
      size: 'Tabloid',
      createdAt: now,
      modifiedAt: now,
    } as Sheet];
  }

  const sheetNumber = sheets.length + 1;
  const sheetId = generateId();

  const newSheet: Sheet = {
    id: sheetId,
    type: 'sheet',
    name: name || `Sheet ${sheetNumber}`,
    number: sheetNumber,
    size: 'Tabloid',
    createdAt: now,
    modifiedAt: now,
  };

  return {
    circuit: {
      ...circuit,
      sheets: [...sheets, newSheet],
    },
    sheetId,
  };
}

/**
 * Add a text annotation to a sheet.
 */
export function addAnnotation(
  circuit: CircuitData,
  sheetId: string,
  x: number,
  y: number,
  content: string,
): { circuit: CircuitData; annotationId: string } {
  const now = Date.now();
  const annotationId = generateId();

  const annotation: Annotation = {
    id: annotationId,
    type: 'annotation',
    sheetId,
    annotationType: 'text',
    position: { x: snapToGrid(x), y: snapToGrid(y) },
    content,
    style: { fontSize: 14 },
    createdAt: now,
    modifiedAt: now,
  };

  const annotations = circuit.annotations || [];

  return {
    circuit: {
      ...circuit,
      annotations: [...annotations, annotation],
    },
    annotationId,
  };
}

/**
 * Place a linked representation of an existing device.
 * The new device shares the same tag and deviceGroupId for BOM grouping,
 * but uses a different symbol (e.g., contactor coil vs power contacts).
 */
export function placeLinkedDevice(
  circuit: CircuitData,
  existingTag: string,
  symbolId: string,
  x: number,
  y: number,
  sheetId: string,
): { circuit: CircuitData; deviceId: string } {
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  const symbolDef = resolveSymbolOrThrow(symbolId);

  // Find existing device(s) with this tag
  const existingDevices = circuit.devices.filter(d => d.tag === existingTag);
  if (existingDevices.length === 0) {
    throw new Error(`No device with tag "${existingTag}" found. Use place_device first.`);
  }

  const now = Date.now();
  const newDeviceId = generateId();

  // Determine deviceGroupId: reuse from existing, or create one and backfill
  let groupId = existingDevices[0].deviceGroupId;
  let updatedDevices = [...circuit.devices];

  if (!groupId) {
    groupId = generateId();
    // Backfill all existing devices with same tag
    updatedDevices = updatedDevices.map(d =>
      d.tag === existingTag ? { ...d, deviceGroupId: groupId, modifiedAt: now } : d,
    );
  }

  // Create a new part entry for the new symbol representation
  const newPartId = generateId();
  const displayName = symbolDef.name || symbolId;
  const newPart: Part = {
    id: newPartId,
    type: 'part',
    manufacturer: 'Unassigned',
    partNumber: 'TBD',
    description: `${displayName} (linked to ${existingTag})`,
    category: symbolId,
    attributes: {},
    createdAt: now,
    modifiedAt: now,
  };

  const newDevice: Device = {
    id: newDeviceId,
    type: 'device',
    tag: existingTag, // Same tag — linked representation
    function: displayName,
    partId: newPartId,
    sheetId,
    deviceGroupId: groupId,
    createdAt: now,
    modifiedAt: now,
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

/**
 * Set a sheet's diagram type and optional ladder configuration.
 * If the sheet doesn't exist yet (e.g., empty project with default 'sheet-1'),
 * bootstraps it from the virtual default.
 */
export function setSheetType(
  circuit: CircuitData,
  sheetId: string,
  diagramType: DiagramType,
  ladderConfig?: Partial<LadderConfig>,
): CircuitData {
  let sheets = circuit.sheets || [];

  // Bootstrap default sheet if needed
  if (sheets.length === 0 && sheetId === WEB_APP_DEFAULT_SHEET_ID) {
    const now = Date.now();
    sheets = [{
      id: WEB_APP_DEFAULT_SHEET_ID,
      type: 'sheet',
      name: 'Sheet 1',
      number: 1,
      size: 'Tabloid',
      createdAt: now,
      modifiedAt: now,
    } as Sheet];
  }

  const idx = sheets.findIndex(s => s.id === sheetId);
  if (idx === -1) {
    throw new Error(`Sheet "${sheetId}" not found`);
  }

  const updatedSheets = [...sheets];
  const now = Date.now();

  const fullLadderConfig: LadderConfig | undefined = diagramType === 'ladder'
    ? { ...DEFAULT_LADDER_CONFIG, ...ladderConfig }
    : undefined;

  updatedSheets[idx] = {
    ...updatedSheets[idx],
    diagramType,
    ladderConfig: fullLadderConfig,
    modifiedAt: now,
  };

  return { ...circuit, sheets: updatedSheets };
}

/**
 * Create a LadderBlock on a sheet.
 * Replaces the need to call setSheetType() for new designs.
 * Position defaults to (0, 0) if not specified.
 */
export function createLadderBlock(
  circuit: CircuitData,
  sheetId: string,
  ladderConfig?: Partial<LadderConfig>,
  position?: { x: number; y: number },
  name?: string,
): { circuit: CircuitData; blockId: string } {
  const sheets = circuit.sheets || [];
  const sheet = sheets.find(s => s.id === sheetId);
  if (!sheet && sheetId !== WEB_APP_DEFAULT_SHEET_ID) {
    throw new Error(`Sheet "${sheetId}" not found`);
  }

  const now = Date.now();
  const blockId = generateId();
  const fullConfig: LadderConfig = { ...DEFAULT_LADDER_CONFIG, ...ladderConfig };

  const block: LadderBlock = {
    id: blockId,
    type: 'block',
    blockType: 'ladder',
    sheetId,
    name: name || `${sheet?.name ?? 'Sheet 1'} Ladder`,
    position: position ?? { x: 0, y: 0 },
    ladderConfig: fullConfig,
    createdAt: now,
    modifiedAt: now,
  };

  const blocks: AnyDiagramBlock[] = [...(circuit.blocks || []), block];
  return { circuit: { ...circuit, blocks }, blockId };
}

/**
 * Set up a sheet with a ladder layout preset.
 * 'single-column': one set of L1/L2 rails.
 * 'dual-column': two sets of L1/L2 rails side by side.
 * 'no-rungs': removes all ladder blocks from the sheet.
 *
 * Deletes existing ladder blocks on the sheet first, then creates new ones.
 */
export function setupSheetLayout(
  circuit: CircuitData,
  sheetId: string,
  layout: 'single-column' | 'dual-column' | 'no-rungs',
  options?: {
    voltage?: string;
    numberingScheme?: 'sequential' | 'page-based' | 'page-tens';
    rungSpacing?: number;
  },
): { circuit: CircuitData; blockIds: string[] } {
  // Remove existing ladder blocks on this sheet
  let cd = circuit;
  const existingBlocks = (cd.blocks || []).filter(b => b.sheetId === sheetId && b.blockType === 'ladder');
  for (const block of existingBlocks) {
    cd = deleteBlock(cd, block.id);
  }

  if (layout === 'no-rungs') {
    return { circuit: cd, blockIds: [] };
  }

  const preset = LADDER_LAYOUT_PRESETS[layout];
  const blockIds: string[] = [];
  const scheme = options?.numberingScheme ?? 'page-based';
  const spacing = options?.rungSpacing ?? DEFAULT_LADDER_MM.rungSpacing;

  for (let col = 0; col < preset.columns.length; col++) {
    const colDef = preset.columns[col];
    const suffix = preset.columns.length > 1 ? ` (Col ${col + 1})` : '';
    const sheet = (cd.sheets || []).find(s => s.id === sheetId);

    const result = createLadderBlock(cd, sheetId, {
      railL1X: colDef.railL1X,
      railL2X: colDef.railL2X,
      firstRungY: DEFAULT_LADDER_MM.firstRungY,
      rungSpacing: spacing,
      voltage: options?.voltage,
      numberingScheme: scheme,
    }, { x: colDef.blockOffsetX, y: 0 }, `${sheet?.name ?? 'Sheet'} Ladder${suffix}`);

    cd = result.circuit;
    blockIds.push(result.blockId);
  }

  return { circuit: cd, blockIds };
}

/**
 * Delete a block and its associated rungs.
 */
export function deleteBlock(
  circuit: CircuitData,
  blockId: string,
): CircuitData {
  const blocks = (circuit.blocks || []).filter(b => b.id !== blockId);
  const rungs = (circuit.rungs || []).filter(r => r.blockId !== blockId);
  return { ...circuit, blocks, rungs };
}

/**
 * Add a rung to a ladder diagram.
 * Accepts blockId (preferred) or sheetId (deprecated fallback).
 * Resolves device tags to device IDs for the rung's deviceIds array.
 */
export function addRung(
  circuit: CircuitData,
  sheetId: string,
  rungNumber: number,
  deviceTags: string[],
  description?: string,
  blockId?: string,
): { circuit: CircuitData; rungId: string } {
  // Resolve tags to device IDs — for each tag, find device on the given sheet
  const deviceIds: string[] = [];
  for (const tag of deviceTags) {
    const device = circuit.devices.find(d => d.tag === tag && d.sheetId === sheetId)
      || circuit.devices.find(d => d.tag === tag);
    if (!device) {
      throw new Error(`Device "${tag}" not found`);
    }
    deviceIds.push(device.id);
  }

  const now = Date.now();
  const rungId = generateId();

  const newRung: Rung = {
    id: rungId,
    type: 'rung',
    number: rungNumber,
    sheetId,
    ...(blockId ? { blockId } : {}),
    deviceIds,
    description,
    createdAt: now,
    modifiedAt: now,
  };

  const rungs = circuit.rungs || [];

  return {
    circuit: { ...circuit, rungs: [...rungs, newRung] },
    rungId,
  };
}

/**
 * Auto-layout all devices on a ladder according to rung definitions.
 * Accepts blockId (preferred) or sheetId (deprecated fallback).
 * Returns updated circuit with new positions + a summary.
 */
export function autoLayoutLadder(
  circuit: CircuitData,
  sheetId: string,
  blockId?: string,
): { circuit: CircuitData; layoutSummary: { rungCount: number; deviceCount: number } } {
  let config: LadderConfig;
  let rungs: Rung[];
  let blockOffset: { x: number; y: number } | undefined;

  if (blockId) {
    // Block-based: resolve config from the block
    const block = (circuit.blocks || []).find(b => b.id === blockId);
    if (!block) {
      throw new Error(`Block "${blockId}" not found`);
    }
    if (block.blockType !== 'ladder') {
      throw new Error(`Block "${block.name}" is not a ladder block (type: ${block.blockType})`);
    }
    config = { ...DEFAULT_LADDER_CONFIG, ...(block as LadderBlock).ladderConfig };
    rungs = (circuit.rungs || []).filter(r => r.blockId === blockId);
    blockOffset = block.position;
  } else {
    // Legacy: resolve from sheet
    const sheets = circuit.sheets || [];
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) {
      throw new Error(`Sheet "${sheetId}" not found`);
    }
    if (sheet.diagramType !== 'ladder') {
      throw new Error(`Sheet "${sheet.name}" is not a ladder diagram (type: ${sheet.diagramType || 'schematic'})`);
    }
    config = sheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
    rungs = (circuit.rungs || []).filter(r => r.sheetId === sheetId);
  }

  const devices = circuit.devices.filter(d => d.sheetId === sheetId);

  // Build symbolHeights map: for each device, compute the Y offset from device origin
  // to where pin "1" sits. This allows layoutLadder to align pins with rung Y.
  // For vertical symbols (IEC, rotated -90°): pin "1" is at top, offset = height/2
  // For horizontal symbols (ANSI coil): pin "1" is at its actual Y position
  const symbolHeights: Record<string, number> = {};
  for (const device of devices) {
    const part = circuit.parts.find(p => p.id === device.partId);
    if (part) {
      const symbolKey = part.symbolCategory || part.category;
      try {
        const symbolDef = resolveSymbol(symbolKey);
        const pinDirs = symbolDef.pins.map(p => p.direction);
        const isHorizontal = pinDirs.every(d => d === 'left' || d === 'right');

        if (isHorizontal) {
          // For horizontal symbols: use the pin Y position × 2 as "height"
          // so that height/2 = actual pin Y offset
          const pin1 = symbolDef.pins.find(p => p.id === '1');
          const pinY = pin1?.position?.y ?? symbolDef.geometry.height / 2;
          symbolHeights[device.id] = pinY * 2;
        } else {
          // For vertical symbols: use actual height (will be rotated -90°)
          symbolHeights[device.id] = symbolDef.geometry.height;
        }
      } catch {
        // Symbol not found — use default
      }
    }
  }

  const result = layoutLadder(rungs, devices, config, blockOffset, symbolHeights);

  // Merge positions (overwrite for devices on rungs, keep others)
  const updatedPositions = { ...circuit.positions };
  for (const [deviceId, pos] of Object.entries(result.positions)) {
    updatedPositions[deviceId] = pos;
  }

  // Set rotation = -90 for single-rung devices so pins face left/right.
  // Skip rotation for symbols that are already horizontal (pins facing left/right),
  // like the ANSI coil. These symbols don't need rotation for ladder orientation.
  const updatedTransforms: Record<string, { rotation: number; mirrorH?: boolean }> = {
    ...(circuit.transforms || {}),
  };
  for (const deviceId of Object.keys(result.positions)) {
    if (result.multiRungDeviceIds.has(deviceId)) {
      // PLC modules stay upright (no rotation) — their pins already face right
      delete updatedTransforms[deviceId];
      continue;
    }

    // Check if the symbol is already horizontal (pins face left/right)
    const device = circuit.devices.find(d => d.id === deviceId);
    const part = device?.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const symbolKey = part?.symbolCategory || part?.category;
    let isHorizontal = false;
    if (symbolKey) {
      try {
        const symDef = resolveSymbol(symbolKey);
        // A symbol is horizontal if its pins face left/right (not top/bottom)
        const pinDirs = symDef.pins.map(p => p.direction);
        isHorizontal = pinDirs.every(d => d === 'left' || d === 'right');
      } catch { /* symbol not found — default to rotating */ }
    }

    if (isHorizontal) {
      // Already horizontal — no rotation needed
      delete updatedTransforms[deviceId];
    } else {
      // Vertical symbol (IEC style) — rotate -90° for horizontal ladder flow
      updatedTransforms[deviceId] = { rotation: -90 };
    }
  }

  let deviceCount = 0;
  for (const rung of rungs) {
    deviceCount += rung.deviceIds.length;
  }

  return {
    circuit: { ...circuit, positions: updatedPositions, transforms: updatedTransforms },
    layoutSummary: {
      rungCount: rungs.length,
      deviceCount,
    },
  };
}

/**
 * Create L1/L2 rail junctions and wires for a ladder diagram.
 * Places junction devices at each rail intercept and wires them
 * vertically (forming the rails) and horizontally (forming stubs to rung devices).
 * Should be called AFTER auto-layout so rung positions are established.
 * Accepts blockId (preferred) or sheetId (deprecated fallback).
 */
export function createLadderRails(
  circuit: CircuitData,
  sheetId: string,
  blockId?: string,
): CircuitData {
  let cd = circuit;
  let config: LadderConfig;
  let rungs: Rung[];
  let blockOffset: { x: number; y: number } = { x: 0, y: 0 };

  if (blockId) {
    const block = (cd.blocks || []).find(b => b.id === blockId);
    if (!block || block.blockType !== 'ladder') return cd;
    config = { ...DEFAULT_LADDER_CONFIG, ...(block as LadderBlock).ladderConfig };
    rungs = (cd.rungs || []).filter(r => r.blockId === blockId)
      .sort((a, b) => a.number - b.number);
    blockOffset = block.position;
  } else {
    const sheets = cd.sheets || [];
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet || sheet.diagramType !== 'ladder') return cd;
    config = sheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
    rungs = (cd.rungs || []).filter(r => r.sheetId === sheetId)
      .sort((a, b) => a.number - b.number);
  }

  if (rungs.length === 0) return cd;

  // Junction pin "1" is at position (0,0) relative to symbol origin — no offset needed.
  const PIN_OFFSET = 0;

  const l1Junctions: { deviceId: string; tag: string; rungNumber: number }[] = [];
  const l2Junctions: { deviceId: string; tag: string; rungNumber: number }[] = [];

  // Place junction devices at each rung intercept
  const ox = blockOffset.x;
  const oy = blockOffset.y;

  // Use block ID suffix for unique junction tags — prevents collisions across sheets/blocks.
  // Block ID is a ULID, last 4 chars are unique enough for tag disambiguation.
  const blockSuffix = blockId ? blockId.slice(-4) : '';

  for (let ri = 0; ri < rungs.length; ri++) {
    const rung = rungs[ri];
    const rungY = config.firstRungY + ri * config.rungSpacing + oy;

    // Skip junction creation for empty rungs (spacers)
    if (rung.deviceIds.length === 0) continue;

    // L1 junction for every rung — tag includes block suffix for uniqueness
    const l1Tag = blockSuffix ? `JL_${blockSuffix}_${ri + 1}` : `JL${rung.number}`;
    const l1 = placeDevice(cd, 'junction', 0, 0, sheetId, l1Tag);
    cd = l1.circuit;
    // Override position for precise rail alignment (bypass grid snapping)
    cd = {
      ...cd,
      positions: {
        ...cd.positions,
        [l1.deviceId]: { x: config.railL1X - PIN_OFFSET + ox, y: rungY - PIN_OFFSET },
      },
    };
    l1Junctions.push({ deviceId: l1.deviceId, tag: l1Tag, rungNumber: rung.number });

    // L2 junction only for non-branch rungs
    if (!rung.branchOf) {
      const l2Tag = blockSuffix ? `JR_${blockSuffix}_${ri + 1}` : `JR${rung.number}`;
      const l2 = placeDevice(cd, 'junction', 0, 0, sheetId, l2Tag);
      cd = l2.circuit;
      cd = {
        ...cd,
        positions: {
          ...cd.positions,
          [l2.deviceId]: { x: config.railL2X - PIN_OFFSET + ox, y: rungY - PIN_OFFSET },
        },
      };
      l2Junctions.push({ deviceId: l2.deviceId, tag: l2Tag, rungNumber: rung.number });
    }
  }

  // Wire L1 junctions vertically (forming L1 rail)
  for (let i = 0; i < l1Junctions.length - 1; i++) {
    const from = l1Junctions[i];
    const to = l1Junctions[i + 1];
    cd = createWire(cd, from.tag, '1', to.tag, '1', from.deviceId, to.deviceId);
  }

  // Wire L2 junctions vertically (forming L2 rail)
  for (let i = 0; i < l2Junctions.length - 1; i++) {
    const from = l2Junctions[i];
    const to = l2Junctions[i + 1];
    cd = createWire(cd, from.tag, '1', to.tag, '1', from.deviceId, to.deviceId);
  }

  // Wire L1 junctions horizontally to first device on each rung.
  // Waypoints force straight horizontal routing at the rung Y coordinate.
  // Skip devices without standard pin "1" (e.g., PLC modules with named pins).
  for (let ri = 0; ri < rungs.length; ri++) {
    const rung = rungs[ri];
    if (rung.deviceIds.length === 0) continue;
    const firstDeviceId = rung.deviceIds[0];
    const firstDevice = cd.devices.find(d => d.id === firstDeviceId);
    if (!firstDevice) continue;

    // Check if device has pin "1" — skip if not (e.g., PLC modules)
    const firstPart = cd.parts.find(p => p.id === firstDevice.partId);
    if (firstPart) {
      const symKey = firstPart.symbolCategory || firstPart.category;
      if (symKey) {
        try {
          const symDef = resolveSymbol(symKey);
          if (!symDef.pins.some(p => p.id === '1')) continue;
        } catch { /* skip validation if symbol not found */ }
      }
    }

    const l1J = l1Junctions.find(j => j.rungNumber === rung.number);
    if (!l1J) continue;

    const rungY = config.firstRungY + ri * config.rungSpacing + oy;
    const l1Pos = cd.positions[l1J.deviceId];
    const devPos = cd.positions[firstDeviceId];

    // Build waypoints for a clean horizontal path at rungY
    const wp = (l1Pos && devPos) ? [
      { x: l1Pos.x, y: rungY },
      { x: devPos.x, y: rungY },
    ] : undefined;

    cd = createWire(cd, l1J.tag, '1', firstDevice.tag, '1', l1J.deviceId, firstDeviceId, wp);
  }

  // Wire last device on each non-branch rung to L2 junction.
  // Skip devices without standard pin "2" (e.g., PLC modules).
  for (let ri = 0; ri < rungs.length; ri++) {
    const rung = rungs[ri];
    if (rung.branchOf) continue;
    if (rung.deviceIds.length === 0) continue;

    const lastDeviceId = rung.deviceIds[rung.deviceIds.length - 1];
    const lastDevice = cd.devices.find(d => d.id === lastDeviceId);
    if (!lastDevice) continue;

    // Check if device has pin "2" — skip if not
    const lastPart = cd.parts.find(p => p.id === lastDevice.partId);
    if (lastPart) {
      const symKey = lastPart.symbolCategory || lastPart.category;
      if (symKey) {
        try {
          const symDef = resolveSymbol(symKey);
          if (!symDef.pins.some(p => p.id === '2')) continue;
        } catch { /* skip */ }
      }
    }

    const l2J = l2Junctions.find(j => j.rungNumber === rung.number);
    if (!l2J) continue;

    const rungY = config.firstRungY + ri * config.rungSpacing + oy;
    const devPos = cd.positions[lastDeviceId];
    const l2Pos = cd.positions[l2J.deviceId];

    const wp = (devPos && l2Pos) ? [
      { x: devPos.x, y: rungY },
      { x: l2Pos.x, y: rungY },
    ] : undefined;

    cd = createWire(cd, lastDevice.tag, '2', l2J.tag, '1', lastDeviceId, l2J.deviceId, wp);
  }

  return cd;
}

/**
 * Default sheet ID must match the web app's DEFAULT_SHEET_ID ('sheet-1').
 * The web app creates a virtual sheet with this ID when circuit.sheets is empty.
 */
const WEB_APP_DEFAULT_SHEET_ID = 'sheet-1';

/**
 * Get the default sheet ID for a circuit.
 * Returns the first sheet's ID, or 'sheet-1' to match the web app convention.
 */
export function getDefaultSheetId(circuit: CircuitData): string {
  if (circuit.sheets && circuit.sheets.length > 0) {
    return circuit.sheets[0].id;
  }
  return WEB_APP_DEFAULT_SHEET_ID;
}

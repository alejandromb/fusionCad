/**
 * Automatic Terminal Block Calculator
 *
 * Analyzes a wired schematic, classifies devices as panel-internal vs field-external,
 * identifies boundary wires (panel↔field), and generates Terminal entities with
 * appropriate Phoenix Contact parts.
 *
 * Algorithm:
 * 1. Classify device locations — panel vs field
 * 2. Find boundary connections — wires where one end is panel and the other is field
 * 3. Classify each wire — power, control, ground
 * 4. Group into terminal strips — X1=power, X2=control, XPE=ground
 * 5. Select Phoenix Contact parts — UT 4, UT 2.5, UTTB 2.5-PE
 * 6. Generate Terminal entities
 * 7. Add spare terminals — configurable %
 */

import type { Device, Part, Net, Terminal, TerminalLevel, EntityId } from '@fusion-cad/core-model';

// ── Types ───────────────────────────────────────────────────────────

export type DeviceLocation = 'panel' | 'field' | 'unknown';

export type WireClass = 'power' | 'control' | 'ground';

export interface TerminalCalcConnection {
  fromDevice: string;
  fromDeviceId?: string;
  fromPin: string;
  toDevice: string;
  toDeviceId?: string;
  toPin: string;
  netId: string;
  sheetId?: string;
  wireNumber?: string;
}

export interface TerminalCalcCircuitData {
  devices: Device[];
  parts: Part[];
  connections: TerminalCalcConnection[];
  nets: Net[];
  terminals?: Terminal[];
}

export interface TerminalCalculationOptions {
  sparePercent?: number;                      // default 10
  stripNaming?: 'functional' | 'sequential';  // default 'functional'
}

export interface BoundaryConnectionInfo {
  connectionIndex: number;
  fromDevice: string;
  fromPin: string;
  fromLocation: DeviceLocation;
  toDevice: string;
  toPin: string;
  toLocation: DeviceLocation;
  wireClass: WireClass;
  stripTag: string;
  netId: string;
  wireNumber?: string;
}

export interface TerminalCalculationResult {
  terminals: Terminal[];
  parts: Part[];
  summary: {
    totalTerminals: number;
    byType: Record<string, number>;
    byStrip: Record<string, number>;
    spareTerminals: number;
  };
  warnings: string[];
  boundaryConnections: BoundaryConnectionInfo[];
}

// ── Phoenix Contact Part Catalog ────────────────────────────────────

interface TerminalPartSpec {
  manufacturer: string;
  partNumber: string;
  description: string;
  category: string;
}

const PHOENIX_PARTS: Record<WireClass, TerminalPartSpec> = {
  power: {
    manufacturer: 'Phoenix Contact',
    partNumber: '3044102',
    description: 'UT 4 - Feed-through terminal block, 4mm²',
    category: 'terminal',
  },
  control: {
    manufacturer: 'Phoenix Contact',
    partNumber: '3044076',
    description: 'UT 2.5 - Feed-through terminal block, 2.5mm²',
    category: 'terminal',
  },
  ground: {
    manufacturer: 'Phoenix Contact',
    partNumber: '3213974',
    description: 'UTTB 2.5-PE - Ground terminal block',
    category: 'terminal',
  },
};

const END_COVER: TerminalPartSpec = {
  manufacturer: 'Phoenix Contact',
  partNumber: '3070048',
  description: 'D-UT 2.5/10 - End cover',
  category: 'terminal-accessory',
};

// ── Location Classification ─────────────────────────────────────────

const PANEL_KEYWORDS = [
  'plc', 'contactor', 'overload', 'breaker', 'relay', 'transformer',
  'power-supply', 'power_supply', 'surge', 'fuse', 'terminal', 'coil',
  'timer', 'vfd', 'receptacle', 'disconnect',
];

const FIELD_KEYWORDS = [
  'motor', 'pushbutton', 'selector', 'e-stop', 'estop', 'emergency-stop',
  'pilot-light', 'pilot_light', 'indicator', 'sensor', 'limit-switch',
  'limit_switch', 'proximity', 'horn', 'solenoid',
];

const PANEL_TAG_PREFIXES = [
  'KM', 'KA', 'QF', 'CB', 'FU', 'OL', 'TR', 'CR', 'PS', 'XF', 'TB', 'PLC',
  // Single-char prefixes checked after multi-char
  'K', 'Q', 'F', 'T', 'X',
];

const FIELD_TAG_PREFIXES = [
  'SS', 'PL',
  // Single-char prefixes checked after multi-char
  'M', 'S', 'H', 'B',
];

/**
 * Classify a device as panel-internal or field-external.
 *
 * Priority: symbolId keyword → part category → tag prefix fallback.
 */
export function classifyDeviceLocation(device: Device, parts: Part[]): DeviceLocation {
  // Skip junction devices — internal wiring nodes
  const symbolId = (device as any).symbolId as string | undefined;
  if (symbolId === 'junction' || /^J[LR]\d+$/.test(device.tag)) {
    return 'unknown';
  }

  // 1. Try classification by symbolId
  if (symbolId) {
    const loc = classifyLocationByKeyword(symbolId);
    if (loc !== 'unknown') return loc;
  }

  // 2. Try classification by part category
  const part = device.partId ? parts.find(p => p.id === device.partId) : undefined;
  const category = part?.category || (part as any)?.symbolCategory;
  if (category) {
    const loc = classifyLocationByKeyword(category);
    if (loc !== 'unknown') return loc;
  }

  // 3. Fallback: classify by tag prefix
  return classifyLocationByTagPrefix(device.tag);
}

/**
 * Classify location by keyword matching against a symbol ID or category string.
 */
export function classifyLocationByKeyword(id: string): DeviceLocation {
  const s = id.toLowerCase();

  for (const kw of PANEL_KEYWORDS) {
    if (s.includes(kw)) return 'panel';
  }

  for (const kw of FIELD_KEYWORDS) {
    if (s.includes(kw)) return 'field';
  }

  return 'unknown';
}

/**
 * Fallback classification by device tag prefix.
 */
export function classifyLocationByTagPrefix(tag: string): DeviceLocation {
  const upper = tag.toUpperCase();

  // Check multi-char prefixes first (KM before K, SS before S)
  for (const prefix of PANEL_TAG_PREFIXES) {
    if (upper.startsWith(prefix) && /\d/.test(upper.charAt(prefix.length))) {
      return 'panel';
    }
  }

  for (const prefix of FIELD_TAG_PREFIXES) {
    if (upper.startsWith(prefix) && /\d/.test(upper.charAt(prefix.length))) {
      return 'field';
    }
  }

  return 'unknown';
}

// ── Wire Classification ─────────────────────────────────────────────

/**
 * Classify a wire/connection as power, control, or ground.
 */
function classifyWire(
  conn: TerminalCalcConnection,
  devices: Device[],
  nets: Net[],
): WireClass {
  // Check net name for ground/PE
  const net = nets.find(n => n.id === conn.netId);
  if (net) {
    const netName = (net.name || '').toUpperCase();
    if (net.netType === 'pe' || net.netType === 'ground') return 'ground';
    if (/\bPE\b|GND|GROUND/.test(netName)) return 'ground';

    // Check for power phase nets
    if (/L[123]|PHASE/.test(netName)) return 'power';
  }

  // Check if either device is a motor (→ power terminal)
  const fromDev = devices.find(d => d.tag === conn.fromDevice);
  const toDev = devices.find(d => d.tag === conn.toDevice);

  for (const dev of [fromDev, toDev]) {
    if (!dev) continue;
    const sid = ((dev as any).symbolId || '') as string;
    if (sid.toLowerCase().includes('motor')) return 'power';
    if (dev.tag.match(/^M\d/)) return 'power';
  }

  // Default: control
  return 'control';
}

// ── Strip Naming ────────────────────────────────────────────────────

function getStripTag(wireClass: WireClass, naming: 'functional' | 'sequential'): string {
  if (naming === 'functional') {
    switch (wireClass) {
      case 'power': return 'X1';
      case 'control': return 'X2';
      case 'ground': return 'XPE';
    }
  }
  // Sequential: all go on X1 (terminals numbered sequentially)
  return 'X1';
}

// ── Terminal Type for Wire Class ────────────────────────────────────

function getTerminalType(wireClass: WireClass): 'single' | 'ground' {
  return wireClass === 'ground' ? 'ground' : 'single';
}

// ── Main Calculator ─────────────────────────────────────────────────

let nextId = 1;
function generateId(): string {
  return `tc-${Date.now()}-${nextId++}`;
}

/**
 * Calculate terminal blocks needed for a circuit.
 *
 * Analyzes boundary connections (panel↔field) and generates Terminal entities
 * with Phoenix Contact parts.
 */
export function calculateTerminalBlocks(
  circuit: TerminalCalcCircuitData,
  options?: TerminalCalculationOptions,
): TerminalCalculationResult {
  const sparePercent = options?.sparePercent ?? 10;
  const stripNaming = options?.stripNaming ?? 'functional';

  const warnings: string[] = [];
  const boundaryConnections: BoundaryConnectionInfo[] = [];

  // Reset ID counter for deterministic output in tests
  nextId = 1;

  // 1. Classify all device locations
  const locationMap = new Map<string, DeviceLocation>();
  for (const device of circuit.devices) {
    locationMap.set(device.tag, classifyDeviceLocation(device, circuit.parts));
  }

  // 2. Find boundary connections and classify wires
  for (let i = 0; i < circuit.connections.length; i++) {
    const conn = circuit.connections[i];
    const fromLoc = locationMap.get(conn.fromDevice) || 'unknown';
    const toLoc = locationMap.get(conn.toDevice) || 'unknown';

    // Skip if both on same side or both unknown
    if (fromLoc === toLoc) continue;

    // Panel↔field = 1 terminal
    if ((fromLoc === 'panel' && toLoc === 'field') ||
        (fromLoc === 'field' && toLoc === 'panel')) {
      const wireClass = classifyWire(conn, circuit.devices, circuit.nets);
      const stripTag = getStripTag(wireClass, stripNaming);

      boundaryConnections.push({
        connectionIndex: i,
        fromDevice: conn.fromDevice,
        fromPin: conn.fromPin,
        fromLocation: fromLoc,
        toDevice: conn.toDevice,
        toPin: conn.toPin,
        toLocation: toLoc,
        wireClass,
        stripTag,
        netId: conn.netId,
        wireNumber: conn.wireNumber,
      });
    }
    // Field↔unknown or panel↔unknown → warning
    else if (fromLoc === 'unknown' || toLoc === 'unknown') {
      const unknownTag = fromLoc === 'unknown' ? conn.fromDevice : conn.toDevice;
      warnings.push(
        `Cannot classify device "${unknownTag}" as panel or field — connection skipped`
      );
    }
  }

  if (boundaryConnections.length === 0) {
    return {
      terminals: [],
      parts: [],
      summary: {
        totalTerminals: 0,
        byType: {},
        byStrip: {},
        spareTerminals: 0,
      },
      warnings: warnings.length > 0 ? warnings : ['No boundary connections found between panel and field devices'],
      boundaryConnections: [],
    };
  }

  // 3. Group by strip and generate terminals
  const stripGroups = new Map<string, BoundaryConnectionInfo[]>();
  for (const bc of boundaryConnections) {
    const group = stripGroups.get(bc.stripTag) || [];
    group.push(bc);
    stripGroups.set(bc.stripTag, group);
  }

  const terminals: Terminal[] = [];
  const partsList: Part[] = [];
  const partIdMap = new Map<string, string>(); // wireClass → partId
  const byType: Record<string, number> = {};
  const byStrip: Record<string, number> = {};

  // Get a sheet ID for terminals (use first sheet from a device)
  const defaultSheetId = circuit.devices[0]?.sheetId || 'sheet-1';

  // Ensure parts exist for each wire class used
  for (const bc of boundaryConnections) {
    if (!partIdMap.has(bc.wireClass)) {
      const spec = PHOENIX_PARTS[bc.wireClass];
      const partId = generateId();
      partsList.push({
        id: partId,
        type: 'part',
        manufacturer: spec.manufacturer,
        partNumber: spec.partNumber,
        description: spec.description,
        category: spec.category,
        attributes: {},
      } as Part);
      partIdMap.set(bc.wireClass, partId);
    }
  }

  // Generate terminals per strip
  for (const [stripTag, connections] of stripGroups) {
    const wireClass = connections[0].wireClass;

    for (let i = 0; i < connections.length; i++) {
      const bc = connections[i];
      const terminalIndex = i + 1;
      const terminalId = generateId();

      const level: TerminalLevel = {
        levelIndex: 0,
        netId: bc.netId,
        wireNumberIn: bc.wireNumber,
      };

      terminals.push({
        id: terminalId,
        type: 'terminal',
        stripTag,
        index: terminalIndex,
        label: `${stripTag}:${terminalIndex}`,
        terminalType: getTerminalType(bc.wireClass),
        levels: [level],
        partId: partIdMap.get(bc.wireClass),
        sheetId: defaultSheetId as EntityId,
      } as Terminal);
    }

    byStrip[stripTag] = connections.length;
    byType[wireClass] = (byType[wireClass] || 0) + connections.length;
  }

  // 4. Add spare terminals
  let spareCount = 0;
  if (sparePercent > 0) {
    for (const [stripTag, connections] of stripGroups) {
      const wireClass = connections[0].wireClass;
      const spares = Math.max(1, Math.ceil(connections.length * sparePercent / 100));
      spareCount += spares;

      const baseIndex = connections.length;
      for (let i = 0; i < spares; i++) {
        const terminalIndex = baseIndex + i + 1;
        const terminalId = generateId();

        terminals.push({
          id: terminalId,
          type: 'terminal',
          stripTag,
          index: terminalIndex,
          label: `${stripTag}:${terminalIndex} (SPARE)`,
          terminalType: getTerminalType(wireClass),
          levels: [{ levelIndex: 0 }],
          partId: partIdMap.get(wireClass),
          sheetId: defaultSheetId as EntityId,
        } as Terminal);
      }

      byStrip[stripTag] = (byStrip[stripTag] || 0) + spares;
    }
  }

  // 5. Add end covers (2 per strip — one each end)
  const endCoverPartId = generateId();
  partsList.push({
    id: endCoverPartId,
    type: 'part',
    manufacturer: END_COVER.manufacturer,
    partNumber: END_COVER.partNumber,
    description: END_COVER.description,
    category: END_COVER.category,
    attributes: {},
  } as Part);

  return {
    terminals,
    parts: partsList,
    summary: {
      totalTerminals: terminals.length,
      byType,
      byStrip,
      spareTerminals: spareCount,
    },
    warnings,
    boundaryConnections,
  };
}

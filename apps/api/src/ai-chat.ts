/**
 * AI Chat endpoint with tool use — the AI can actually modify the circuit.
 *
 * Uses Claude's tool_use feature to call circuit manipulation functions
 * (place devices, create wires, add annotations, etc.) against the project database.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL } from './ai-config.js';
import { AppDataSource } from './data-source.js';
import { Project } from './entities/Project.js';
import {
  generateId,
  getSymbolById,
  getAllSymbols,
  registerBuiltinSymbols,
  type Device,
  type Part,
} from '@fusion-cad/core-model';
import { generateRelayBank, generateRelayOutput, generatePowerSection } from './ai-circuit-patterns.js';
import { runERC, type ERCReport, layoutLadder } from '@fusion-cad/core-engine';
import type { LadderConfig, LadderBlock, Rung, AnyDiagramBlock } from '@fusion-cad/core-model';
import { instantiateBlueprint } from './blueprint/engine.js';
import { getBlueprintById, registerBuiltinBlueprints } from './blueprint/registry.js';

// Register blueprints on module load
registerBuiltinBlueprints();

// Ensure symbols are registered
registerBuiltinSymbols();

const client = new Anthropic();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GRID_SIZE = 20;
function snapToGrid(v: number): number { return Math.round(v / GRID_SIZE) * GRID_SIZE; }

function generateTag(symbolId: string, devices: Device[]): string {
  const sym = getSymbolById(symbolId);
  const prefix = sym?.tagPrefix || 'D';
  const nums = devices.filter(d => d.tag.startsWith(prefix)).map(d => parseInt(d.tag.slice(prefix.length)) || 0);
  return `${prefix}${Math.max(0, ...nums) + 1}`;
}

// ================================================================
// P1: Rich circuit context builder (server-side, has symbol pin data)
// ================================================================

function buildEnrichedContext(circuit: CircuitData): string {
  if (!circuit.devices.length) return 'Empty project — no devices placed yet.';

  // Build a set of connected pins: "deviceId:pinId"
  const connectedPins = new Set<string>();
  for (const conn of circuit.connections) {
    const fromId = conn.fromDeviceId || circuit.devices.find((d: any) => d.tag === conn.fromDevice)?.id;
    const toId = conn.toDeviceId || circuit.devices.find((d: any) => d.tag === conn.toDevice)?.id;
    if (fromId) connectedPins.add(`${fromId}:${conn.fromPin}`);
    if (toId) connectedPins.add(`${toId}:${conn.toPin}`);
  }

  // Group devices by sheet
  const sheetDevices = new Map<string, typeof circuit.devices>();
  for (const dev of circuit.devices) {
    const sid = dev.sheetId || 'sheet-1';
    if (!sheetDevices.has(sid)) sheetDevices.set(sid, []);
    sheetDevices.get(sid)!.push(dev);
  }

  const lines: string[] = [];
  lines.push(`Devices: ${circuit.devices.length} | Wires: ${circuit.connections.length} | Sheets: ${circuit.sheets?.length || 1}`);
  lines.push('');

  // For each sheet, list devices with pin status
  const sheets = circuit.sheets || [{ id: 'sheet-1', name: 'Sheet 1' }];
  for (const sheet of sheets as any[]) {
    const devs = sheetDevices.get(sheet.id) || [];
    if (devs.length === 0) {
      lines.push(`Sheet "${sheet.name}": (empty)`);
      continue;
    }
    lines.push(`Sheet "${sheet.name}" (${devs.length} devices):`);

    // Cap at 20 devices per sheet for context size
    const displayDevs = devs.slice(0, 20);
    for (const dev of displayDevs) {
      // Find the part to get the symbolId
      const part = circuit.parts.find((p: any) => p.id === dev.partId);
      const symbolId = part?.category || 'unknown';
      const sym = getSymbolById(symbolId);

      if (sym && sym.pins.length > 0) {
        const pinStatuses = sym.pins.map(pin => {
          const isConnected = connectedPins.has(`${dev.id}:${pin.id}`);
          return `${pin.name}(${isConnected ? 'wired' : 'OPEN!'})`;
        });
        lines.push(`  ${dev.tag} [${sym.name}] — ${pinStatuses.join(', ')}`);
      } else {
        lines.push(`  ${dev.tag} [${symbolId}]`);
      }
    }
    if (devs.length > 20) lines.push(`  ...and ${devs.length - 20} more`);
    lines.push('');
  }

  // Connection summary (cap at 20)
  if (circuit.connections.length > 0) {
    lines.push('Connections:');
    for (const conn of circuit.connections.slice(0, 20)) {
      lines.push(`  ${conn.fromDevice}:${conn.fromPin} → ${conn.toDevice}:${conn.toPin}`);
    }
    if (circuit.connections.length > 20) {
      lines.push(`  ...and ${circuit.connections.length - 20} more`);
    }
  }

  return lines.join('\n');
}

// ================================================================
// Tool definitions for Claude
// ================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'place_device',
    description: 'Place an electrical symbol on the schematic. Returns the device tag and ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbolId: { type: 'string', description: 'Symbol ID (e.g., "iec-coil", "iec-no-contact", "iec-plc-do-16"). Use list_symbols first if unsure.' },
        x: { type: 'number', description: 'X position (world coordinates, multiples of 20)' },
        y: { type: 'number', description: 'Y position (world coordinates, multiples of 20)' },
        tag: { type: 'string', description: 'Optional device tag (e.g., "K1"). Auto-generated if omitted.' },
        sheetName: { type: 'string', description: 'Name of the sheet to place on (e.g., "DO0-DO7 Outputs"). Defaults to first sheet if omitted.' },
      },
      required: ['symbolId', 'x', 'y'],
    },
  },
  {
    name: 'move_device',
    description: 'Move an existing device to a new position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tag: { type: 'string', description: 'Device tag to move (e.g., "CR1")' },
        x: { type: 'number', description: 'New X position (multiples of 20)' },
        y: { type: 'number', description: 'New Y position (multiples of 20)' },
      },
      required: ['tag', 'x', 'y'],
    },
  },
  {
    name: 'delete_device',
    description: 'Delete a device and its connections from the project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tag: { type: 'string', description: 'Device tag to delete (e.g., "CR1")' },
      },
      required: ['tag'],
    },
  },
  {
    name: 'delete_wire',
    description: 'Delete a wire between two device pins.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromDevice: { type: 'string', description: 'Source device tag' },
        fromPin: { type: 'string', description: 'Source pin ID' },
        toDevice: { type: 'string', description: 'Target device tag' },
        toPin: { type: 'string', description: 'Target pin ID' },
      },
      required: ['fromDevice', 'fromPin', 'toDevice', 'toPin'],
    },
  },
  {
    name: 'create_wire',
    description: 'Connect two device pins with a wire.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromDevice: { type: 'string', description: 'Source device tag (e.g., "K1")' },
        fromPin: { type: 'string', description: 'Source pin ID (e.g., "A1", "DO0")' },
        toDevice: { type: 'string', description: 'Target device tag' },
        toPin: { type: 'string', description: 'Target pin ID' },
      },
      required: ['fromDevice', 'fromPin', 'toDevice', 'toPin'],
    },
  },
  {
    name: 'add_annotation',
    description: 'Add a text label/annotation on the schematic.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Text content' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        sheetName: { type: 'string', description: 'Sheet name to place on. Defaults to first sheet.' },
      },
      required: ['content', 'x', 'y'],
    },
  },
  {
    name: 'list_available_symbols',
    description: 'List all available symbol IDs and their names. Use this to find the right symbolId before placing devices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', description: 'Optional search filter (e.g., "relay", "plc", "breaker")' },
      },
    },
  },
  {
    name: 'add_sheet',
    description: 'Add a new sheet/page to the project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Sheet name' },
      },
      required: ['name'],
    },
  },
  // ---- HIGH-LEVEL PATTERN TOOLS (P2) ----
  {
    name: 'generate_relay_bank',
    description: 'Generate a COMPLETE relay output system: power supply + PLC DO modules + relay coils (with return wires) + NO contacts + terminal blocks for field wiring. Creates multiple sheets automatically. This is the preferred tool for relay-based projects — use it instead of placing individual devices.',
    input_schema: {
      type: 'object' as const,
      properties: {
        relayCount: { type: 'number', description: 'Number of relay outputs (e.g., 16)' },
        relayPrefix: { type: 'string', description: 'Tag prefix for relays (default: "CR")' },
        startIndex: { type: 'number', description: 'Starting relay number (default: 1)' },
        relaysPerSheet: { type: 'number', description: 'Relays per sheet (default: 8)' },
        includeContacts: { type: 'boolean', description: 'Include NO contacts + terminal blocks (default: true)' },
        includePowerSupply: { type: 'boolean', description: 'Include power supply sheet with CB+PSU+fuse (default: true)' },
        plcSymbolId: { type: 'string', description: 'PLC DO module symbol (default: "iec-plc-do-8")' },
      },
      required: ['relayCount'],
    },
  },
  {
    name: 'generate_power_section',
    description: 'Generate a complete power supply section: circuit breaker → AC/DC power supply → fuse. Creates the sheet if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        inputVoltage: { type: 'string', description: 'Input voltage (default: "120VAC")' },
        outputVoltage: { type: 'string', description: 'Output voltage (default: "24VDC")' },
        sheetName: { type: 'string', description: 'Sheet name (default: "Power Distribution")' },
      },
    },
  },
  {
    name: 'generate_relay_output',
    description: 'Generate ONE complete relay output: PLC DO → coil + NO contact + terminal blocks. Use generate_relay_bank for multiple relays.',
    input_schema: {
      type: 'object' as const,
      properties: {
        plcTag: { type: 'string', description: 'PLC device tag (e.g., "PLC1-DO1")' },
        doPin: { type: 'string', description: 'Digital output pin (e.g., "DO0")' },
        relayTag: { type: 'string', description: 'Relay tag (e.g., "CR1")' },
        coilSheetName: { type: 'string', description: 'Sheet for the coil circuit' },
        contactSheetName: { type: 'string', description: 'Sheet for contacts (optional, defaults to coil sheet)' },
      },
      required: ['plcTag', 'doPin', 'relayTag', 'coilSheetName'],
    },
  },
  // ---- LADDER DIAGRAM TOOLS ----
  {
    name: 'create_ladder_block',
    description: 'Create a ladder diagram on a sheet with L1/L2 power rails. This is the PREFERRED layout for control panel schematics. Devices are then added to rungs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sheetName: { type: 'string', description: 'Sheet name to create the ladder on' },
        voltage: { type: 'string', description: 'Voltage label (e.g., "24VDC", "120VAC")' },
        railLabelL1: { type: 'string', description: 'Left rail label (default: "L1")' },
        railLabelL2: { type: 'string', description: 'Right rail label (default: "L2")' },
      },
      required: ['sheetName'],
    },
  },
  {
    name: 'add_rung',
    description: 'Add a rung to a ladder diagram. Specify device tags left-to-right (L1→L2). Devices must already be placed on the sheet. After adding all rungs, call auto_layout_ladder.',
    input_schema: {
      type: 'object' as const,
      properties: {
        blockId: { type: 'string', description: 'Ladder block ID (from create_ladder_block)' },
        rungNumber: { type: 'number', description: 'Rung number (1, 2, 3...)' },
        deviceTags: { type: 'array', items: { type: 'string' }, description: 'Device tags left to right (e.g., ["PLC1-DO1", "CR1"])' },
        description: { type: 'string', description: 'Rung description (e.g., "PUMP NO.1 START/STOP RELAY")' },
      },
      required: ['blockId', 'rungNumber', 'deviceTags'],
    },
  },
  {
    name: 'auto_layout_ladder',
    description: 'Auto-position all devices on a ladder based on rung definitions. Call this AFTER adding all rungs. Positions devices evenly between L1 and L2 rails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        blockId: { type: 'string', description: 'Ladder block ID' },
      },
      required: ['blockId'],
    },
  },
  // ---- BLUEPRINT SYSTEM ----
  {
    name: 'instantiate_blueprint',
    description: 'Generate a circuit from a predefined blueprint template. PREFERRED over manual device placement. Available blueprints: "relay-bank" (PLC + N relay coils + contacts + terminals), "power-section" (breaker + PSU + fuse), "relay-output" (single relay output).',
    input_schema: {
      type: 'object' as const,
      properties: {
        blueprintId: { type: 'string', description: 'Blueprint ID: "relay-bank", "power-section", or "relay-output"' },
        params: {
          type: 'object',
          description: 'Blueprint parameters. relay-bank: {relayCount, relayPrefix?, startIndex?, plcSymbolId?, controlVoltage?, includePowerSupply?}. power-section: {inputVoltage?, outputVoltage?}. relay-output: {relayTag, plcRef, doPin}.',
        },
      },
      required: ['blueprintId', 'params'],
    },
  },
];

// ================================================================
// Tool execution
// ================================================================

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

function executeToolPlaceDevice(circuit: CircuitData, input: any): { result: string; circuit: CircuitData } {
  const symbolId = input.symbolId;
  const sym = getSymbolById(symbolId);
  if (!sym) return { result: `Error: Symbol "${symbolId}" not found. Use list_available_symbols to see valid IDs.`, circuit };

  const x = snapToGrid(input.x);
  const y = snapToGrid(input.y);
  const tag = input.tag || generateTag(symbolId, circuit.devices);
  const now = Date.now();
  const deviceId = generateId();
  const partId = generateId();

  const newPart: Part = {
    id: partId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: sym.name || symbolId, category: symbolId, attributes: {},
    createdAt: now, modifiedAt: now,
  };
  // Resolve target sheet by name, fall back to first sheet
  let targetSheetId = circuit.sheets?.[0]?.id || 'sheet-1';
  if (input.sheetName && circuit.sheets) {
    const match = circuit.sheets.find((s: any) => s.name === input.sheetName);
    if (match) targetSheetId = match.id;
  }

  const newDevice: Device = {
    id: deviceId, type: 'device', tag, function: sym.name || symbolId,
    partId, sheetId: targetSheetId,
    createdAt: now, modifiedAt: now,
  };

  return {
    result: `Placed ${sym.name} as ${tag} at (${x}, ${y})`,
    circuit: {
      ...circuit,
      devices: [...circuit.devices, newDevice],
      parts: [...circuit.parts, newPart],
      positions: { ...circuit.positions, [deviceId]: { x, y } },
    },
  };
}

function executeToolCreateWire(circuit: CircuitData, input: any): { result: string; circuit: CircuitData } {
  const fromDev = circuit.devices.find(d => d.tag === input.fromDevice);
  const toDev = circuit.devices.find(d => d.tag === input.toDevice);
  if (!fromDev) return { result: `Error: Device "${input.fromDevice}" not found`, circuit };
  if (!toDev) return { result: `Error: Device "${input.toDevice}" not found`, circuit };

  const netId = generateId();
  const net = {
    id: netId, type: 'net', name: `N${circuit.nets.length + 1}`,
    netType: 'signal', createdAt: Date.now(), modifiedAt: Date.now(),
  };
  const connection = {
    fromDevice: input.fromDevice, fromDeviceId: fromDev.id, fromPin: input.fromPin,
    toDevice: input.toDevice, toDeviceId: toDev.id, toPin: input.toPin,
    netId,
  };

  return {
    result: `Wired ${input.fromDevice}:${input.fromPin} → ${input.toDevice}:${input.toPin}`,
    circuit: {
      ...circuit,
      nets: [...circuit.nets, net],
      connections: [...circuit.connections, connection],
    },
  };
}

function executeToolAddAnnotation(circuit: CircuitData, input: any): { result: string; circuit: CircuitData } {
  let targetSheetId = circuit.sheets?.[0]?.id || 'sheet-1';
  if (input.sheetName && circuit.sheets) {
    const match = circuit.sheets.find((s: any) => s.name === input.sheetName);
    if (match) targetSheetId = match.id;
  }
  const annotation = {
    id: generateId(),
    content: input.content,
    position: { x: snapToGrid(input.x), y: snapToGrid(input.y) },
    sheetId: targetSheetId,
    style: { fontSize: 14, fontWeight: 'normal' as const },
  };
  return {
    result: `Added annotation "${input.content}" at (${input.x}, ${input.y})`,
    circuit: {
      ...circuit,
      annotations: [...(circuit.annotations || []), annotation],
    },
  };
}

function executeToolListSymbols(input: any): string {
  let symbols = getAllSymbols();
  if (input.filter) {
    const f = input.filter.toLowerCase();
    symbols = symbols.filter(s =>
      s.name.toLowerCase().includes(f) ||
      s.id.toLowerCase().includes(f) ||
      s.category.toLowerCase().includes(f)
    );
  }
  if (symbols.length === 0) return 'No symbols match that filter.';
  return symbols.slice(0, 30).map(s => `${s.id} — ${s.name} (${s.category}, pins: ${s.pins.length})`).join('\n');
}

function executeToolAddSheet(circuit: CircuitData, input: any): { result: string; circuit: CircuitData } {
  const sheetId = generateId();
  const sheet = {
    id: sheetId, name: input.name, order: (circuit.sheets?.length || 0) + 1,
    titleBlock: { title: input.name, date: new Date().toISOString().slice(0, 10), revision: 'A' },
  };
  return {
    result: `Added sheet "${input.name}"`,
    circuit: {
      ...circuit,
      sheets: [...(circuit.sheets || []), sheet],
    },
  };
}

// ================================================================
// System prompt
// ================================================================

const SYSTEM_PROMPT = `You are an expert electrical controls engineer and the AI assistant built into fusionCad, an electrical CAD tool for industrial control schematics.

You have tools to DIRECTLY modify the user's drawing. When asked to create/build/draw something, USE YOUR TOOLS — don't just describe what to do.

═══════════════════════════════════════════════════
CIRCUIT COMPLETION RULES — NEVER violate these
═══════════════════════════════════════════════════

1. Every coil (relay, contactor, solenoid) needs TWO connections:
   - Pin 1 (A1) → power source (e.g., PLC DO output, or +24VDC through a contact)
   - Pin 2 (A2) → return (0V / COM / L2)
   Missing the return = OPEN CIRCUIT. No current flows.

2. Every contact (NO/NC) needs TWO connections:
   - Pin 1 → source side (power rail or upstream device)
   - Pin 2 → load side (downstream device or load)

3. Every load (pilot light, horn, LED) needs TWO connections: power + return.

4. Every circuit must have a COMPLETE PATH: power source → devices → return.
   Trace every circuit mentally: +24V → ... → 0V. If any link is missing, fix it.

5. PLC digital outputs are CURRENT SOURCES:
   - DO pin provides +24V when ON
   - The load (coil) connects between DO and 0V return
   - Wire: DO pin → coil pin 1; coil pin 2 → 0V/COM

6. Every relay that has a coil placed MUST also have its contacts placed:
   - At minimum, place one NO contact for each relay coil
   - Contacts go to field wiring via terminal blocks: Terminal → NO contact → Terminal
   - Coil and contacts share the same tag (e.g., CR1 coil + CR1 NO contact)

7. Terminal blocks are the interface between panel and field wiring:
   - Place them at every panel boundary (where wires leave the panel)
   - Each relay contact output pair needs terminals for field connection

8. Power supply circuits must be complete:
   - AC input: L (line) and N (neutral) both connected
   - DC output: + and - both connected to distribution
   - Add fuse protection on the DC output

═══════════════════════════════════════════════════
PIN REFERENCE — exact pin IDs from the symbol library
═══════════════════════════════════════════════════

ansi-coil (PREFERRED for relays):
  pin "1" = A1 (top, power input) | pin "2" = A2 (bottom, return)

ansi-normally-open-contact (PREFERRED for NO contacts):
  pin "1" = top (input) | pin "2" = bottom (output)

ansi-normally-closed-contact:
  pin "1" = top | pin "2" = bottom

iec-circuit-breaker-1p:
  pin "1" = line (top) | pin "2" = load (bottom)

iec-power-supply-ac-dc:
  pin "1" = L (AC line) | pin "2" = N (AC neutral)
  pin "3" = + (DC out) | pin "4" = - (DC out)

ansi-fuse:
  pin "1" = top (line) | pin "2" = bottom (load)

iec-terminal-single:
  pin "1" = left (single connection point — one pin only)

iec-plc-do-8:
  pins "DO0"-"DO7" = outputs (right side) | pin "COM" = common (right side)

iec-plc-do-16:
  pins "DO0"-"DO15" = outputs | "COM0", "COM1" = commons

iec-plc-di-8:
  pins "DI0"-"DI7" = inputs (left side) | pin "COM" = common

iec-plc-cpu:
  pin "1" = L+ (24VDC) | pin "2" = M (0V)

iec-pilot-light:
  pin "1" = top (power) | pin "2" = bottom (return)

iec-earth-ground:
  pin "1" = top (single pin)

═══════════════════════════════════════════════════
STANDARD CIRCUIT PATTERNS
═══════════════════════════════════════════════════

POWER SUPPLY SECTION (always Sheet 1):
  CB1 pin 2 → PS1 pin 1 (L)
  Neutral wire → PS1 pin 2 (N)
  PS1 pin 3 (+24V) → FU1 pin 1 (fuse for protection)
  FU1 pin 2 → 24VDC distribution
  PS1 pin 4 (0V) → 0V distribution
  Add annotations: "120VAC INPUT", "+24VDC", "0V"

PLC POWER:
  +24VDC (from fused PSU output) → PLC CPU pin 1 (L+)
  0V → PLC CPU pin 2 (M)

RELAY OUTPUT (repeat for each PLC DO → relay):
  Step 1 — Coil circuit (on DO output sheet):
    Wire: PLC_DO:DOx → CR_coil pin 1
    Wire: CR_coil pin 2 → 0V return
  Step 2 — Contact circuit (on same or separate sheet):
    Place: Terminal (TB-xa) for power input to contact
    Place: ansi-normally-open-contact with SAME TAG as coil (e.g., CR1)
    Place: Terminal (TB-xb) for field output
    Wire: TB-xa pin 1 → CR_NO pin 1
    Wire: CR_NO pin 2 → TB-xb pin 1

E-STOP CIRCUIT:
  Series NC contacts: power → ES1 pin 1; ES1 pin 2 → next device

PILOT LIGHT:
  Contact NO pin 2 → PL pin 1; PL pin 2 → return

═══════════════════════════════════════════════════
SYMBOL STANDARD — ANSI/NEMA PREFERRED
═══════════════════════════════════════════════════

ALWAYS use ANSI symbols when available:
  Coil:       "ansi-coil" (circle style, NOT iec-coil rectangle)
  NO Contact: "ansi-normally-open-contact"
  NC Contact: "ansi-normally-closed-contact"
  Fuse:       "ansi-fuse"
  Overload:   "ansi-overload-relay"
  Switch:     "ansi-manual-switch"

For symbols without ANSI variants, use IEC:
  Breakers, PLCs, terminals, motors, power supplies, transformers → IEC symbols

TAG CONVENTIONS (ANSI/NEMA style):
  CR1-CR16  = Control Relays (NOT K1-K16)
  CB1       = Circuit Breaker
  PS1       = Power Supply
  PLC1      = PLC module
  PL1       = Pilot Light
  ES1       = E-Stop
  TB1-xx    = Terminal Block (TB1-1, TB1-2, etc.)
  FU1       = Fuse
  M1        = Motor
  OL1       = Overload Relay

═══════════════════════════════════════════════════
TOOL SELECTION — USE BLUEPRINTS FIRST
═══════════════════════════════════════════════════

CRITICAL: Use instantiate_blueprint as your PRIMARY circuit generation tool.
It produces clean, properly laid out circuits from declarative templates.

🔴 instantiate_blueprint with "relay-bank":
  - PLC DO outputs + relay coils + contacts + terminals (ANY quantity)
  - Params: { relayCount, relayPrefix?, startIndex?, plcSymbolId?, controlVoltage?, includePowerSupply? }
  - Creates multiple sheets with proper ladder layout automatically

🔴 instantiate_blueprint with "power-section":
  - Circuit breaker + AC/DC power supply + fuse
  - Params: { inputVoltage?, outputVoltage? }

🔴 instantiate_blueprint with "relay-output":
  - Single relay output added to existing circuit
  - Params: { relayTag, plcRef, doPin }

🟡 generate_relay_bank / generate_power_section / generate_relay_output:
  - Legacy tools — still work but instantiate_blueprint is preferred

🟡 Only use manual placement (place_device + create_wire + ladder tools) when:
  - The circuit pattern doesn't match any blueprint
  - User explicitly asks for manual/custom placement
  - Building something the templates don't cover (e.g., custom interlocking logic)

═══════════════════════════════════════════════════
WORKFLOW — LADDER DIAGRAM (manual fallback)
═══════════════════════════════════════════════════

Only use this manual workflow when high-level tools above don't apply:

1. Create sheets with clear names.
2. For each sheet, create a LADDER BLOCK using create_ladder_block with appropriate voltage label.
3. Place devices on the sheet (they'll be repositioned by auto_layout).
4. Add rungs using add_rung — specify device tags left-to-right (L1 side → L2 side).
   Example rung: ["PLC1-DO1", "CR1"] means PLC output on left, relay coil on right.
   PLC modules can appear on MULTIPLE rungs — auto_layout will center them vertically.
5. Call auto_layout_ladder to position everything on the ladder grid.
6. Wire devices AFTER layout (the auto-layout sets positions correctly).
7. Add annotations for rung descriptions.

LADDER RUNG CONVENTIONS:
  - Each rung is a horizontal path from L1 (power) to L2 (return)
  - Input devices (PLC outputs, contacts, switches) go on the LEFT
  - Output devices (coils, lights, horns) go on the RIGHT
  - One output per rung (standard practice)
  - Rung description on the right: "PUMP NO.1 START/STOP RELAY"

WHEN TO USE LADDER vs FREE-FORM:
  - Control panels, relay logic, PLC I/O → LADDER (always)
  - Power distribution, single-line diagrams → FREE-FORM with manual positioning
  - If unsure, ask the user

═══════════════════════════════════════════════════
SCHEMATIC LAYOUT RULES — NEVER violate these (IEC 61082 / industry standard)
═══════════════════════════════════════════════════

1. SIGNAL FLOW: Always left to right. L1 (power) on left, L2 (return) on right.
   Input devices (PLC outputs, contacts, switches) on the LEFT side of each rung.
   Output devices (coils, lights) on the RIGHT side, last device before L2.

2. HORIZONTAL ALIGNMENT: ALL devices on the same rung MUST share the same Y coordinate.
   PLC output pin Y = coil Y = return terminal Y. This creates straight horizontal wires.

3. NO OVERLAPPING: Every device must have clear space around it.
   Minimum horizontal gap between devices on a rung: 100px.
   Minimum vertical gap between rungs: 80px.
   NEVER place a device where another device already exists.

4. NO WIRES THROUGH DEVICES: Wires must route around device bounding boxes, never through them.

5. ONE LOAD PER RUNG: Each rung has exactly one output device (coil, light, horn).
   Multiple control devices (contacts) can be in series or parallel on the left side.

6. WIRE ROUTING: Strictly orthogonal (horizontal and vertical only, no diagonals).
   Horizontal wires on rungs, vertical wires between rungs to power rails.
   Minimize crossings. Use T-junctions, avoid 4-way crosses.

7. WHEN MOVING DEVICES: Always check that the new position:
   - Does not overlap any existing device
   - Maintains horizontal alignment with other devices on the same rung
   - Keeps minimum spacing from adjacent devices

8. CONTACT SHEET LAYOUT: Terminal → NO Contact → Terminal, all on the same horizontal line.
   TB-CRxa at x=100, CR contact at x=200, TB-CRxb at x=340.
   Each row spaced 80px vertically.

Keep text responses brief. Focus on DOING, not explaining.`;

// ================================================================
// Main chat function with tool use loop
// ================================================================

export async function aiChat(
  message: string,
  circuitContext: string,
  history: ChatMessage[],
  projectId?: string,
): Promise<{ reply: string; actionsPerformed: number }> {

  // Load the project from database if we have a projectId
  let circuit: CircuitData | null = null;
  let project: any = null;
  if (projectId) {
    const projectRepo = AppDataSource.getRepository(Project);
    project = await projectRepo.findOneBy({ id: projectId });
    if (project) {
      circuit = project.circuitData as CircuitData || {
        devices: [], nets: [], parts: [], connections: [], positions: {},
      };
    }
  }

  const messages: Anthropic.MessageParam[] = [];

  // Add conversation history
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Build enriched context from the loaded circuit (server-side, with pin status)
  const enrichedContext = circuit ? buildEnrichedContext(circuit) : circuitContext;
  const userContent = enrichedContext
    ? `[Current drawing state]\n${enrichedContext}\n\n${message}`
    : message;
  messages.push({ role: 'user', content: userContent });

  let actionsPerformed = 0;
  const actionLog: string[] = [];

  // Tool use loop — keep going until Claude stops calling tools
  let response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: projectId ? TOOLS : [], // Only provide tools if we have a project to modify
    messages,
  });

  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result = '';
      const input = toolUse.input as any;

      switch (toolUse.name) {
        case 'place_device': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = executeToolPlaceDevice(circuit, input);
          circuit = r.circuit;
          result = r.result;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'move_device': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const moveDev = circuit.devices.find((d: any) => d.tag === input.tag);
          if (!moveDev) { result = `Error: Device "${input.tag}" not found`; break; }
          const newX = snapToGrid(input.x);
          const newY = snapToGrid(input.y);
          // Overlap check: ensure no other device on the same sheet is within 40px
          const MIN_CLEARANCE = 40;
          const positions = circuit!.positions;
          const overlapping = circuit!.devices.find((d: any) => {
            if (d.id === moveDev.id) return false;
            if (d.sheetId !== moveDev.sheetId) return false;
            const pos = positions[d.id];
            if (!pos) return false;
            return Math.abs(pos.x - newX) < MIN_CLEARANCE && Math.abs(pos.y - newY) < MIN_CLEARANCE;
          });
          if (overlapping) {
            result = `Warning: Moving ${input.tag} to (${newX}, ${newY}) would overlap with ${(overlapping as any).tag} at (${circuit.positions[(overlapping as any).id]?.x}, ${circuit.positions[(overlapping as any).id]?.y}). Move completed but check layout.`;
          } else {
            result = `Moved ${input.tag} to (${newX}, ${newY})`;
          }
          circuit = {
            ...circuit,
            positions: { ...circuit.positions, [moveDev.id]: { x: newX, y: newY } },
          };
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'delete_device': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const delDev = circuit.devices.find((d: any) => d.tag === input.tag);
          if (!delDev) { result = `Error: Device "${input.tag}" not found`; break; }
          const delId = delDev.id;
          // Remove device
          const remainingDevices = circuit.devices.filter((d: any) => d.id !== delId);
          // Remove connections referencing this device
          const remainingConns = circuit.connections.filter((c: any) =>
            c.fromDeviceId !== delId && c.toDeviceId !== delId &&
            c.fromDevice !== input.tag && c.toDevice !== input.tag
          );
          // Remove orphaned nets
          const usedNetIds = new Set(remainingConns.map((c: any) => c.netId));
          const remainingNets = circuit.nets.filter((n: any) => usedNetIds.has(n.id));
          // Remove position
          const { [delId]: _removed, ...remainingPositions } = circuit.positions;
          // Remove orphaned part if no other device uses it
          const delPartId = delDev.partId;
          const otherUsesOfPart = remainingDevices.some((d: any) => d.partId === delPartId);
          const remainingParts = otherUsesOfPart ? circuit.parts : circuit.parts.filter((p: any) => p.id !== delPartId);
          circuit = {
            ...circuit,
            devices: remainingDevices,
            connections: remainingConns,
            nets: remainingNets,
            parts: remainingParts,
            positions: remainingPositions,
          };
          result = `Deleted ${input.tag} and its ${circuit.connections.length - remainingConns.length} connection(s)`;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'delete_wire': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const connIdx = circuit.connections.findIndex((c: any) =>
            (c.fromDevice === input.fromDevice && c.fromPin === input.fromPin &&
             c.toDevice === input.toDevice && c.toPin === input.toPin) ||
            (c.fromDevice === input.toDevice && c.fromPin === input.toPin &&
             c.toDevice === input.fromDevice && c.toPin === input.fromPin)
          );
          if (connIdx === -1) { result = `Error: Wire ${input.fromDevice}:${input.fromPin} → ${input.toDevice}:${input.toPin} not found`; break; }
          const removedConn = circuit.connections[connIdx];
          const updatedConns = [...circuit.connections];
          updatedConns.splice(connIdx, 1);
          // Remove orphaned net
          const netStillUsed = updatedConns.some((c: any) => c.netId === removedConn.netId);
          const updatedNets = netStillUsed ? circuit.nets : circuit.nets.filter((n: any) => n.id !== removedConn.netId);
          circuit = { ...circuit, connections: updatedConns, nets: updatedNets };
          result = `Deleted wire ${input.fromDevice}:${input.fromPin} → ${input.toDevice}:${input.toPin}`;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'create_wire': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = executeToolCreateWire(circuit, input);
          circuit = r.circuit;
          result = r.result;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'add_annotation': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = executeToolAddAnnotation(circuit, input);
          circuit = r.circuit;
          result = r.result;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'list_available_symbols': {
          result = executeToolListSymbols(input);
          break;
        }
        case 'add_sheet': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = executeToolAddSheet(circuit, input);
          circuit = r.circuit;
          result = r.result;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'generate_relay_bank': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = generateRelayBank(circuit, input);
          circuit = r.circuit;
          result = r.summary;
          const deviceCount = r.circuit.devices.length;
          const wireCount = r.circuit.connections.length;
          actionsPerformed += deviceCount;
          actionLog.push(`Relay bank: ${input.relayCount} relays (${deviceCount} devices, ${wireCount} wires)`);
          break;
        }
        case 'generate_power_section': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = generatePowerSection(circuit, input);
          circuit = r.circuit;
          result = r.summary;
          actionsPerformed += 3;
          actionLog.push(result);
          break;
        }
        case 'generate_relay_output': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const r = generateRelayOutput(circuit, input);
          circuit = r.circuit;
          result = r.summary;
          actionsPerformed += 5;
          actionLog.push(result);
          break;
        }
        case 'create_ladder_block': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          const sheetId = input.sheetName && circuit.sheets
            ? (circuit.sheets.find((s: any) => s.name === input.sheetName)?.id || circuit.sheets[0]?.id || 'sheet-1')
            : (circuit.sheets?.[0]?.id || 'sheet-1');
          const ladderConfig: Partial<LadderConfig> = {};
          if (input.voltage) ladderConfig.voltage = input.voltage;
          if (input.railLabelL1) ladderConfig.railLabelL1 = input.railLabelL1;
          if (input.railLabelL2) ladderConfig.railLabelL2 = input.railLabelL2;
          const blockId = generateId();
          const now = Date.now();
          const block: LadderBlock = {
            id: blockId, type: 'block', blockType: 'ladder', sheetId,
            name: `${input.sheetName || 'Sheet'} Ladder`,
            position: { x: 0, y: 0 },
            ladderConfig: { railL1X: 100, railL2X: 900, firstRungY: 100, rungSpacing: 120, railLabelL1: 'L1', railLabelL2: 'L2', ...ladderConfig },
            createdAt: now, modifiedAt: now,
          };
          circuit = { ...circuit, blocks: [...(circuit.blocks || []), block] };
          result = `Created ladder block "${block.name}" (blockId: ${blockId}) on sheet "${input.sheetName}"`;
          actionsPerformed++;
          actionLog.push(result);
          break;
        }
        case 'add_rung': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          try {
            // Find the block to get its sheetId
            const block = (circuit.blocks || []).find((b: any) => b.id === input.blockId);
            if (!block) { result = `Error: Block "${input.blockId}" not found`; break; }
            const sheetId = block.sheetId;
            // Resolve device tags to IDs
            const deviceIds: string[] = [];
            for (const tag of input.deviceTags) {
              const dev = circuit.devices.find((d: any) => d.tag === tag && d.sheetId === sheetId)
                || circuit.devices.find((d: any) => d.tag === tag);
              if (!dev) { result = `Error: Device "${tag}" not found`; break; }
              deviceIds.push(dev.id);
            }
            if (deviceIds.length !== input.deviceTags.length) { if (!result) result = 'Error: one or more device tags not found'; break; }
            const rungId = generateId();
            const newRung: Rung = {
              id: rungId, type: 'rung', number: input.rungNumber,
              sheetId, blockId: input.blockId, deviceIds,
              description: input.description,
              createdAt: Date.now(), modifiedAt: Date.now(),
            };
            circuit = { ...circuit, rungs: [...(circuit.rungs || []), newRung] };
            result = `Added rung ${input.rungNumber}: [${input.deviceTags.join(' → ')}]${input.description ? ` — ${input.description}` : ''}`;
            actionsPerformed++;
            actionLog.push(result);
          } catch (e: any) {
            result = `Error adding rung: ${e.message}`;
          }
          break;
        }
        case 'auto_layout_ladder': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          try {
            const block = (circuit.blocks || []).find((b: any) => b.id === input.blockId) as LadderBlock | undefined;
            if (!block) { result = `Error: Block "${input.blockId}" not found`; break; }
            const blockRungs = (circuit.rungs || []).filter((r: any) => r.blockId === input.blockId);
            const layoutResult = layoutLadder(blockRungs, circuit.devices, block.ladderConfig, block.position);
            // Merge computed positions into circuit
            const updatedPositions = { ...circuit.positions, ...layoutResult.positions };
            // Set rotation: -90 for single-rung devices, skip for multi-rung (PLC modules stay upright)
            const updatedTransforms: Record<string, any> = { ...(circuit.transforms || {}) };
            for (const deviceId of Object.keys(layoutResult.positions)) {
              if (layoutResult.multiRungDeviceIds.has(deviceId)) {
                delete updatedTransforms[deviceId];
              } else {
                updatedTransforms[deviceId] = { rotation: -90 };
              }
            }
            circuit = { ...circuit, positions: updatedPositions, transforms: updatedTransforms };
            result = `Auto-layout complete: ${blockRungs.length} rungs positioned`;
            actionsPerformed++;
            actionLog.push(result);
          } catch (e: any) {
            result = `Error in auto-layout: ${e.message}`;
          }
          break;
        }
        case 'instantiate_blueprint': {
          if (!circuit) { result = 'Error: No project loaded'; break; }
          try {
            const bp = getBlueprintById(input.blueprintId);
            if (!bp) { result = `Error: Blueprint "${input.blueprintId}" not found. Available: relay-bank, power-section, relay-output`; break; }
            const sheetId = circuit.sheets?.[0]?.id || 'sheet-1';
            const bpResult = instantiateBlueprint(bp, {
              params: input.params || {},
              circuit,
              sheetId,
            });
            circuit = bpResult.circuit;
            result = bpResult.summary;
            actionsPerformed += Object.keys(bpResult.deviceMap).length;
            actionLog.push(`Blueprint "${input.blueprintId}": ${result}`);
          } catch (e: any) {
            result = `Error instantiating blueprint: ${e.message}`;
          }
          break;
        }
        default:
          result = `Unknown tool: ${toolUse.name}`;
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
    }

    // Continue the conversation with tool results
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
  }

  // Save modified circuit back to database
  if (circuit && project && actionsPerformed > 0) {
    const projectRepo = AppDataSource.getRepository(Project);
    project.circuitData = circuit;
    await projectRepo.save(project);
  }

  // Extract final text response
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // P3: Post-generation ERC validation
  let ercSection = '';
  if (circuit && actionsPerformed > 0) {
    try {
      const ercReport: ERCReport = runERC({
        devices: circuit.devices,
        nets: circuit.nets,
        parts: circuit.parts,
        connections: circuit.connections,
      });
      if (ercReport.violations.length > 0) {
        const errors = ercReport.violations.filter(v => v.severity === 'error');
        const warnings = ercReport.violations.filter(v => v.severity === 'warning');
        const parts: string[] = [];
        if (errors.length > 0) {
          parts.push(`**${errors.length} error(s):**\n${errors.slice(0, 10).map(e => `  - ${e.message}`).join('\n')}`);
        }
        if (warnings.length > 0) {
          parts.push(`**${warnings.length} warning(s):**\n${warnings.slice(0, 10).map(w => `  - ${w.message}`).join('\n')}`);
        }
        ercSection = `\n\n---\n**ERC Check:**\n${parts.join('\n')}`;
      } else {
        ercSection = '\n\n---\n**ERC Check:** All clear — no violations found.';
      }
    } catch {
      // ERC failed — don't block the response
    }
  }

  const reply = actionsPerformed > 0
    ? `${text}\n\n---\n*${actionsPerformed} action(s) performed:*\n${actionLog.map(a => `- ${a}`).join('\n')}${ercSection}`
    : text;

  return { reply, actionsPerformed };
}

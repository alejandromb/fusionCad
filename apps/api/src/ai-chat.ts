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
import { runERC, type ERCReport } from '@fusion-cad/core-engine';

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
  pin "1" = top | pin "2" = bottom

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
    Wire: TB-xa pin 2 → CR_NO pin 1
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
WORKFLOW
═══════════════════════════════════════════════════

1. Create sheets FIRST with clear names ("Power Distribution", "DO0-DO7 Outputs", "DO8-DO15 Outputs", "Field Contacts").
2. ALWAYS specify sheetName when placing devices and annotations.
3. Build power supply section first (breaker → PSU → fuse → distribution).
4. Place ALL devices for a circuit pattern before wiring.
5. Wire in order: power source → protection → switching → load → return.
6. After placing relay coils, ALWAYS place their NO contacts + terminal blocks.
7. After ALL circuits are built, mentally trace every path from power to return. Fix any open circuits.
8. Add annotations for section titles, voltage labels, and wire references.

LAYOUT:
  - PLC modules: x=160, starting y=80
  - Relay coils: x=500, spaced 80px vertically
  - Contacts + terminals: x=700-900
  - Power supply devices: stacked vertically, 160px apart
  - Annotations: y=40 for sheet titles

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

  // Add current message with circuit context
  const userContent = circuitContext
    ? `[Current drawing state]\n${circuitContext}\n\n${message}`
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
      let result: string;
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

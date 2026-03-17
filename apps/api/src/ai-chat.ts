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

const SYSTEM_PROMPT = `You are an expert electrical controls engineer and the AI assistant built into fusionCad.

You have tools to DIRECTLY modify the user's drawing:
- place_device: Place symbols on the schematic
- create_wire: Connect device pins with wires
- add_annotation: Add text labels
- add_sheet: Add new pages
- list_available_symbols: Search for available symbol IDs

IMPORTANT WORKFLOW:
1. When the user asks you to create/build/draw something, USE YOUR TOOLS to do it. Don't just describe what to do.
2. Call list_available_symbols first if you're not sure which symbolId to use.
3. Place devices with enough spacing (80px minimum between devices vertically, 200px horizontally).
4. Use meaningful tags (K1-K16 for relays, CB1 for breakers, PS1 for power supplies, PLC1 for PLCs).
5. Wire devices together after placing them.
6. Add annotations for section labels and notes.
7. When using multiple sheets, ALWAYS specify sheetName in place_device and add_annotation to put devices on the correct sheet.

LAYOUT CONVENTIONS:
- PLC outputs on the left side (~200-300 x range)
- Relay coils to the right of PLC outputs (~500 x range)
- Power supply components at the top
- Vertical spacing: 60px per device row
- Use sheets to organize: Sheet 1 = Power, Sheet 2+ = Control outputs

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
    max_tokens: 4096,
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
      max_tokens: 4096,
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

  const reply = actionsPerformed > 0
    ? `${text}\n\n---\n*${actionsPerformed} action(s) performed:*\n${actionLog.map(a => `- ${a}`).join('\n')}`
    : text;

  return { reply, actionsPerformed };
}

/**
 * fusionCad MCP Server
 *
 * Exposes circuit manipulation as MCP tools so Claude Code,
 * Claude Desktop, or the Agent SDK can drive fusionCad through
 * natural language.
 *
 * Pattern: load project from API → mutate circuitData in memory → save back.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  registerBuiltinSymbols,
  getAllSymbols,
  getSymbolById,
  getSymbolsByCategory,
  ALL_MANUFACTURER_PARTS,
  getPartsByManufacturer,
  getPartsByCategory,
} from '@fusion-cad/core-model';
import { runERC } from '@fusion-cad/core-engine';
import { generateBom } from '@fusion-cad/reports';
import { ApiClient } from './api-client.js';
import {
  placeDevice,
  placeLinkedDevice,
  deleteDevice,
  updateDevice,
  createWire,
  deleteWire,
  assignPart,
  addSheet,
  addAnnotation,
  getDefaultSheetId,
  setSheetType,
  addRung,
  autoLayoutLadder,
} from './circuit-helpers.js';

// Register built-in symbols so getSymbolById works
registerBuiltinSymbols();

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function createServer(apiBase: string) {
  const server = new McpServer({
    name: 'fusionCad',
    version: '0.1.0',
  });

  const api = new ApiClient(apiBase);

  // ================================================================
  //  READ-ONLY TOOLS (9)
  // ================================================================

  server.tool(
    'list_projects',
    'List all fusionCad projects with their IDs, names, and timestamps',
    {},
    async () => {
      const projects = await api.listProjects();
      return textResult(projects);
    },
  );

  server.tool(
    'get_project_summary',
    'Get a summary of a project: device count, wire count, sheet count, and name',
    { projectId: z.string().describe('Project UUID') },
    async ({ projectId }) => {
      const project = await api.getProject(projectId);
      const cd = project.circuitData;
      return textResult({
        id: project.id,
        name: project.name,
        description: project.description,
        deviceCount: cd.devices.length,
        connectionCount: cd.connections.length,
        netCount: cd.nets.length,
        partCount: cd.parts.length,
        sheetCount: cd.sheets?.length ?? 1,
        annotationCount: cd.annotations?.length ?? 0,
      });
    },
  );

  server.tool(
    'list_devices',
    'List all devices in a project with their tags, positions, and part info. Optionally filter by sheet.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Filter by sheet ID'),
    },
    async ({ projectId, sheetId }) => {
      const project = await api.getProject(projectId);
      const cd = project.circuitData;
      let devices = cd.devices;
      if (sheetId) {
        devices = devices.filter(d => d.sheetId === sheetId);
      }

      const partMap = new Map(cd.parts.map(p => [p.id, p]));
      const result = devices.map(d => ({
        id: d.id,
        tag: d.tag,
        function: d.function,
        location: d.location,
        sheetId: d.sheetId,
        deviceGroupId: d.deviceGroupId,
        position: cd.positions[d.id] || cd.positions[d.tag],
        part: d.partId ? (() => {
          const p = partMap.get(d.partId!);
          return p ? { manufacturer: p.manufacturer, partNumber: p.partNumber, description: p.description } : null;
        })() : null,
      }));
      return textResult(result);
    },
  );

  server.tool(
    'list_connections',
    'List all wire connections in a project. Optionally filter by sheet.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Filter by sheet ID'),
    },
    async ({ projectId, sheetId }) => {
      const project = await api.getProject(projectId);
      let connections = project.circuitData.connections;
      if (sheetId) {
        connections = connections.filter(c => c.sheetId === sheetId);
      }
      return textResult(connections.map(c => ({
        fromDevice: c.fromDevice,
        fromPin: c.fromPin,
        toDevice: c.toDevice,
        toPin: c.toPin,
        netId: c.netId,
        wireNumber: c.wireNumber,
      })));
    },
  );

  server.tool(
    'list_symbols',
    'List all available electrical symbols from the built-in library. Optionally filter by category.',
    {
      category: z.string().optional().describe('Filter by symbol category (e.g., "contactor", "plc-module")'),
    },
    async ({ category }) => {
      const symbols = category
        ? getSymbolsByCategory(category)
        : getAllSymbols();
      return textResult(
        symbols.map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          tagPrefix: s.tagPrefix,
          pins: s.pins.map(p => ({ id: p.id, name: p.name, pinType: p.pinType, direction: p.direction })),
        })),
      );
    },
  );

  server.tool(
    'search_symbols',
    'Search for symbols by name or category (case-insensitive)',
    { query: z.string().describe('Search query (matches against name and category)') },
    async ({ query }) => {
      const lowerQuery = query.toLowerCase();
      const matches = getAllSymbols().filter(
        s =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.category.toLowerCase().includes(lowerQuery),
      );
      return textResult(
        matches.map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          tagPrefix: s.tagPrefix,
          pinCount: s.pins.length,
        })),
      );
    },
  );

  server.tool(
    'run_erc',
    'Run Electrical Rules Check on a project. Returns violations (errors, warnings, info).',
    { projectId: z.string().describe('Project UUID') },
    async ({ projectId }) => {
      const project = await api.getProject(projectId);
      const cd = project.circuitData;
      const report = runERC({
        devices: cd.devices,
        nets: cd.nets,
        parts: cd.parts,
        connections: cd.connections.map(c => ({
          fromDevice: c.fromDevice,
          fromPin: c.fromPin,
          toDevice: c.toDevice,
          toPin: c.toPin,
          netId: c.netId,
          sheetId: c.sheetId,
        })),
      });
      return textResult(report);
    },
  );

  server.tool(
    'generate_bom',
    'Generate a Bill of Materials for a project',
    { projectId: z.string().describe('Project UUID') },
    async ({ projectId }) => {
      const project = await api.getProject(projectId);
      const cd = project.circuitData;
      const bom = generateBom(cd.parts, cd.devices, cd.terminals);
      return textResult(bom);
    },
  );

  server.tool(
    'list_parts_catalog',
    'Browse the built-in parts catalog (Allen-Bradley, Phoenix Contact, Schneider Electric). Filter by manufacturer or category.',
    {
      manufacturer: z.string().optional().describe('Filter by manufacturer name'),
      category: z.string().optional().describe('Filter by part category'),
    },
    async ({ manufacturer, category }) => {
      let parts = ALL_MANUFACTURER_PARTS;
      if (manufacturer) {
        parts = getPartsByManufacturer(manufacturer) as typeof parts;
      }
      if (category) {
        const catParts = getPartsByCategory(category);
        const catSet = new Set(catParts.map(p => `${p.manufacturer}::${p.partNumber}`));
        parts = parts.filter(p => catSet.has(`${p.manufacturer}::${p.partNumber}`));
      }
      return textResult(
        parts.map(p => ({
          manufacturer: p.manufacturer,
          partNumber: p.partNumber,
          description: p.description,
          category: p.category,
          voltage: p.voltage,
          current: p.current,
        })),
      );
    },
  );

  // ================================================================
  //  WRITE TOOLS (9)
  // ================================================================

  server.tool(
    'create_project',
    'Create a new empty fusionCad project',
    {
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('Project description'),
    },
    async ({ name, description }) => {
      const project = await api.createProject(name, description);
      return textResult({ id: project.id, name: project.name });
    },
  );

  server.tool(
    'place_device',
    'Place an electrical symbol on the schematic. Auto-generates a tag (e.g., K1, S1) unless specified.',
    {
      projectId: z.string().describe('Project UUID'),
      symbolId: z.string().describe('Symbol ID from list_symbols (e.g., "iec-no-contact", "iec-motor-3ph")'),
      x: z.number().describe('X position in world coordinates (snapped to 20px grid)'),
      y: z.number().describe('Y position in world coordinates (snapped to 20px grid)'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
      tag: z.string().optional().describe('Manual device tag (auto-generated if omitted)'),
    },
    async ({ projectId, symbolId, x, y, sheetId, tag }) => {
      const project = await api.getProject(projectId);
      const targetSheet = sheetId || getDefaultSheetId(project.circuitData);
      const result = placeDevice(project.circuitData, symbolId, x, y, targetSheet, tag);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ placed: true, tag: result.tag, x, y, sheetId: targetSheet });
    },
  );

  server.tool(
    'place_linked_device',
    'Place a linked representation of an existing device (e.g., contactor coil, aux contacts). Shares the same tag and groups for BOM.',
    {
      projectId: z.string().describe('Project UUID'),
      existingDeviceTag: z.string().describe('Tag of the existing device to link (e.g., "K1")'),
      symbolId: z.string().describe('Symbol ID for the new representation (e.g., "iec-contactor-coil", "iec-no-contact")'),
      x: z.number().describe('X position in world coordinates (snapped to 20px grid)'),
      y: z.number().describe('Y position in world coordinates (snapped to 20px grid)'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
    },
    async ({ projectId, existingDeviceTag, symbolId, x, y, sheetId }) => {
      const project = await api.getProject(projectId);
      const targetSheet = sheetId || getDefaultSheetId(project.circuitData);
      const result = placeLinkedDevice(project.circuitData, existingDeviceTag, symbolId, x, y, targetSheet);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ placed: true, tag: existingDeviceTag, deviceId: result.deviceId, linked: true, x, y, sheetId: targetSheet });
    },
  );

  server.tool(
    'delete_device',
    'Remove a device from the project by its tag. Cascades: removes connections, positions, and orphaned parts/nets.',
    {
      projectId: z.string().describe('Project UUID'),
      deviceTag: z.string().describe('Device tag (e.g., "K1", "S1")'),
    },
    async ({ projectId, deviceTag }) => {
      const project = await api.getProject(projectId);
      const updated = deleteDevice(project.circuitData, deviceTag);
      await api.updateCircuitData(projectId, updated);
      return textResult({ deleted: true, deviceTag });
    },
  );

  server.tool(
    'update_device',
    'Edit device properties (tag, function, location). Tag renames cascade to connections and positions.',
    {
      projectId: z.string().describe('Project UUID'),
      deviceTag: z.string().describe('Current device tag'),
      tag: z.string().optional().describe('New tag (e.g., rename K1 to K5)'),
      function: z.string().optional().describe('New function description'),
      location: z.string().optional().describe('New location code'),
    },
    async ({ projectId, deviceTag, tag, function: fn, location }) => {
      const project = await api.getProject(projectId);
      const updates: { tag?: string; function?: string; location?: string } = {};
      if (tag !== undefined) updates.tag = tag;
      if (fn !== undefined) updates.function = fn;
      if (location !== undefined) updates.location = location;

      const updated = updateDevice(project.circuitData, deviceTag, updates);
      await api.updateCircuitData(projectId, updated);
      return textResult({ updated: true, deviceTag, newTag: tag || deviceTag });
    },
  );

  server.tool(
    'create_wire',
    'Connect two device pins with a wire. Creates a new signal net. Use deviceId params for linked devices sharing the same tag.',
    {
      projectId: z.string().describe('Project UUID'),
      fromDevice: z.string().describe('Source device tag (e.g., "K1")'),
      fromPin: z.string().describe('Source pin ID (e.g., "A1", "NO", "pin-left")'),
      toDevice: z.string().describe('Target device tag (e.g., "S1")'),
      toPin: z.string().describe('Target pin ID (e.g., "A2", "NC", "pin-right")'),
      fromDeviceId: z.string().optional().describe('Source device ULID (required when multiple devices share the same tag)'),
      toDeviceId: z.string().optional().describe('Target device ULID (required when multiple devices share the same tag)'),
    },
    async ({ projectId, fromDevice, fromPin, toDevice, toPin, fromDeviceId, toDeviceId }) => {
      const project = await api.getProject(projectId);
      const updated = createWire(project.circuitData, fromDevice, fromPin, toDevice, toPin, fromDeviceId, toDeviceId);
      await api.updateCircuitData(projectId, updated);
      return textResult({ created: true, fromDevice, fromPin, toDevice, toPin });
    },
  );

  server.tool(
    'delete_wire',
    'Remove a wire connection between two device pins. Use deviceId params for linked devices sharing the same tag.',
    {
      projectId: z.string().describe('Project UUID'),
      fromDevice: z.string().describe('Source device tag'),
      fromPin: z.string().describe('Source pin ID'),
      toDevice: z.string().describe('Target device tag'),
      toPin: z.string().describe('Target pin ID'),
      fromDeviceId: z.string().optional().describe('Source device ULID (for disambiguation)'),
      toDeviceId: z.string().optional().describe('Target device ULID (for disambiguation)'),
    },
    async ({ projectId, fromDevice, fromPin, toDevice, toPin, fromDeviceId, toDeviceId }) => {
      const project = await api.getProject(projectId);
      const updated = deleteWire(project.circuitData, fromDevice, fromPin, toDevice, toPin, fromDeviceId, toDeviceId);
      await api.updateCircuitData(projectId, updated);
      return textResult({ deleted: true, fromDevice, fromPin, toDevice, toPin });
    },
  );

  server.tool(
    'assign_part',
    'Assign a catalog part (manufacturer + part number) to a device',
    {
      projectId: z.string().describe('Project UUID'),
      deviceTag: z.string().describe('Device tag (e.g., "K1")'),
      manufacturer: z.string().describe('Manufacturer name (e.g., "Allen-Bradley")'),
      partNumber: z.string().describe('Part number (e.g., "100-C09D10")'),
      description: z.string().describe('Part description'),
      category: z.string().describe('Part category (e.g., "contactor", "relay")'),
    },
    async ({ projectId, deviceTag, manufacturer, partNumber, description, category }) => {
      const project = await api.getProject(projectId);
      const updated = assignPart(project.circuitData, deviceTag, manufacturer, partNumber, description, category);
      await api.updateCircuitData(projectId, updated);
      return textResult({ assigned: true, deviceTag, manufacturer, partNumber });
    },
  );

  server.tool(
    'add_sheet',
    'Add a new sheet (page) to the project',
    {
      projectId: z.string().describe('Project UUID'),
      name: z.string().optional().describe('Sheet name (defaults to "Sheet N")'),
    },
    async ({ projectId, name }) => {
      const project = await api.getProject(projectId);
      const result = addSheet(project.circuitData, name);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ added: true, sheetId: result.sheetId, name: name || `Sheet ${(project.circuitData.sheets?.length ?? 0) + 1}` });
    },
  );

  server.tool(
    'add_annotation',
    'Place a text annotation on the schematic canvas',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().describe('Sheet ID to place annotation on'),
      x: z.number().describe('X position in world coordinates'),
      y: z.number().describe('Y position in world coordinates'),
      content: z.string().describe('Text content of the annotation'),
    },
    async ({ projectId, sheetId, x, y, content }) => {
      const project = await api.getProject(projectId);
      const result = addAnnotation(project.circuitData, sheetId, x, y, content);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ added: true, annotationId: result.annotationId, content });
    },
  );

  // ================================================================
  //  LADDER DIAGRAM TOOLS (3)
  // ================================================================

  server.tool(
    'set_sheet_type',
    'Set a sheet\'s diagram type (ladder, schematic, single-line, wiring) and optionally configure ladder layout.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
      diagramType: z.enum(['ladder', 'single-line', 'schematic', 'wiring']).describe('Diagram type'),
      ladderConfig: z.object({
        railL1X: z.number().optional().describe('X position of L1 rail (default: 100)'),
        railL2X: z.number().optional().describe('X position of L2 rail (default: 900)'),
        firstRungY: z.number().optional().describe('Y of first rung (default: 100)'),
        rungSpacing: z.number().optional().describe('Y spacing between rungs (default: 120)'),
        railLabelL1: z.string().optional().describe('Label for left rail (default: "L1")'),
        railLabelL2: z.string().optional().describe('Label for right rail (default: "L2")'),
        voltage: z.string().optional().describe('Voltage label displayed at top (e.g., "24VDC", "120VAC")'),
      }).optional().describe('Ladder configuration (only for ladder type)'),
    },
    async ({ projectId, sheetId, diagramType, ladderConfig }) => {
      const project = await api.getProject(projectId);
      const targetSheet = sheetId || getDefaultSheetId(project.circuitData);
      const updated = setSheetType(project.circuitData, targetSheet, diagramType, ladderConfig);
      await api.updateCircuitData(projectId, updated);
      return textResult({ updated: true, sheetId: targetSheet, diagramType, ladderConfig });
    },
  );

  server.tool(
    'add_rung',
    'Add a rung to a ladder diagram sheet. Specify the ordered device tags from left (L1) to right (L2).',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
      rungNumber: z.number().describe('Rung number (1, 2, 3...)'),
      deviceTags: z.array(z.string()).describe('Ordered device tags left-to-right (e.g., ["S2", "S1", "K1"])'),
      description: z.string().optional().describe('Optional rung function description'),
    },
    async ({ projectId, sheetId, rungNumber, deviceTags, description }) => {
      const project = await api.getProject(projectId);
      const targetSheet = sheetId || getDefaultSheetId(project.circuitData);
      const result = addRung(project.circuitData, targetSheet, rungNumber, deviceTags, description);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ added: true, rungId: result.rungId, rungNumber, deviceTags, sheetId: targetSheet });
    },
  );

  server.tool(
    'auto_layout_ladder',
    'Recalculate all device positions for a ladder diagram sheet based on rung definitions.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
    },
    async ({ projectId, sheetId }) => {
      const project = await api.getProject(projectId);
      const targetSheet = sheetId || getDefaultSheetId(project.circuitData);
      const result = autoLayoutLadder(project.circuitData, targetSheet);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({ layoutComplete: true, ...result.layoutSummary, sheetId: targetSheet });
    },
  );

  // ================================================================
  //  HIGH-LEVEL GENERATION TOOLS (2)
  // ================================================================

  server.tool(
    'generate_motor_starter',
    'Generate a complete 3-wire motor starter ladder diagram in one call. Creates all devices, rungs, wires, and auto-layouts.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
      controlVoltage: z.enum(['24VDC', '120VAC']).optional().describe('Control circuit voltage (default: "120VAC")'),
      motorTag: z.string().optional().describe('Motor tag prefix (default: "M1")'),
    },
    async ({ projectId, sheetId: sheetIdParam, controlVoltage, motorTag }) => {
      const { generateMotorStarter } = await import('./circuit-templates.js');
      const project = await api.getProject(projectId);
      let circuit = project.circuitData;
      const targetSheet = sheetIdParam || getDefaultSheetId(circuit);
      const voltage = controlVoltage || '120VAC';
      const tag = motorTag || 'M1';

      const result = generateMotorStarter(circuit, targetSheet, voltage, tag);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({
        generated: true,
        sheetId: targetSheet,
        controlVoltage: voltage,
        motorTag: tag,
        summary: result.summary,
      });
    },
  );

  server.tool(
    'add_control_rung',
    'Add a standard control rung to an existing ladder diagram. Supports common rung types.',
    {
      projectId: z.string().describe('Project UUID'),
      sheetId: z.string().optional().describe('Sheet ID (defaults to first sheet)'),
      rungType: z.enum(['indicator', 'timer-on-delay', 'timer-off-delay']).describe('Type of control rung to add'),
      rungNumber: z.number().describe('Rung number for the new rung'),
      config: z.object({
        tag: z.string().optional().describe('Primary device tag (e.g., "PL1" for indicator, "T1" for timer)'),
        contactTag: z.string().optional().describe('Tag of the contact that drives this rung'),
        description: z.string().optional().describe('Rung description'),
      }).optional().describe('Rung configuration'),
    },
    async ({ projectId, sheetId: sheetIdParam, rungType, rungNumber, config }) => {
      const { addControlRung } = await import('./circuit-templates.js');
      const project = await api.getProject(projectId);
      const targetSheet = sheetIdParam || getDefaultSheetId(project.circuitData);

      const result = addControlRung(project.circuitData, targetSheet, rungType, rungNumber, config);
      await api.updateCircuitData(projectId, result.circuit);
      return textResult({
        added: true,
        rungType,
        rungNumber,
        sheetId: targetSheet,
        devices: result.deviceTags,
      });
    },
  );

  return server;
}

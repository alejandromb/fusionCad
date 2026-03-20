/**
 * Blueprint Engine — instantiates declarative blueprints into CircuitData
 *
 * Thin orchestration over circuit-helpers primitives. Zero new low-level logic.
 */

import type { Blueprint, BlueprintDevice, BlueprintPosition } from '@fusion-cad/core-model';
import { alignDeviceToPin, getPinOffsetY, generateId, getSymbolById } from '@fusion-cad/core-model';
import { getBlueprintById } from './registry.js';

const GRID_SIZE = 20;
function snap(v: number): number { return Math.round(v / GRID_SIZE) * GRID_SIZE; }

// ── Minimal CircuitData type (matches what all layers use) ──
interface CircuitData {
  devices: any[];
  nets: any[];
  parts: any[];
  connections: any[];
  positions: Record<string, { x: number; y: number }>;
  sheets?: any[];
  annotations?: any[];
  rungs?: any[];
  blocks?: any[];
  transforms?: Record<string, any>;
  [key: string]: any;
}

export interface BlueprintContext {
  params: Record<string, string | number | boolean>;
  circuit: CircuitData;
  sheetId: string;
  origin?: { x: number; y: number };
}

export interface BlueprintResult {
  circuit: CircuitData;
  summary: string;
  deviceMap: Record<string, string>;
  resolvedPorts: Record<string, { deviceId: string; pin: string }>;
}

// ── Template resolution ──

export function resolveTemplate(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    // _index + startIndex → arithmetic
    const addMatch = trimmed.match(/^(\w+)\s*\+\s*(\w+)$/);
    if (addMatch) {
      const left = params[addMatch[1]] ?? 0;
      const right = params[addMatch[2]] ?? 0;
      return String(Number(left) + Number(right));
    }
    if (trimmed in params) return String(params[trimmed]);
    return `{{${trimmed}}}`;
  });
}

// ── Inline circuit primitives (same logic as circuit-helpers, avoids cross-package import) ──

function addDevice(
  circuit: CircuitData, symbolId: string, tag: string,
  x: number, y: number, sheetId: string, func?: string,
): { circuit: CircuitData; deviceId: string } {
  const deviceId = generateId();
  const partId = generateId();
  const sym = getSymbolById(symbolId);

  const part = {
    id: partId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: func || sym?.name || symbolId,
    category: symbolId, attributes: {},
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  const device = {
    id: deviceId, type: 'device', tag, function: func || sym?.name || symbolId,
    partId, sheetId, createdAt: Date.now(), modifiedAt: Date.now(),
  };
  const positions = { ...circuit.positions, [deviceId]: { x: snap(x), y: snap(y) } };

  return {
    circuit: {
      ...circuit,
      devices: [...circuit.devices, device],
      parts: [...circuit.parts, part],
      positions,
    },
    deviceId,
  };
}

function addLinkedDevice(
  circuit: CircuitData, existingTag: string, symbolId: string,
  x: number, y: number, sheetId: string, func?: string,
): { circuit: CircuitData; deviceId: string } {
  const existing = circuit.devices.filter((d: any) => d.tag === existingTag);
  if (existing.length === 0) throw new Error(`No device with tag "${existingTag}" to link`);

  const groupId = existing[0].deviceGroupId || generateId();
  // Backfill deviceGroupId on existing devices
  let devices = circuit.devices.map((d: any) =>
    d.tag === existingTag && !d.deviceGroupId ? { ...d, deviceGroupId: groupId } : d
  );

  const deviceId = generateId();
  const partId = generateId();
  const sym = getSymbolById(symbolId);
  const part = {
    id: partId, type: 'part', manufacturer: 'Unassigned', partNumber: 'TBD',
    description: func || sym?.name || symbolId,
    category: symbolId, attributes: {},
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  const device = {
    id: deviceId, type: 'device', tag: existingTag, function: func || sym?.name || symbolId,
    partId, sheetId, deviceGroupId: groupId,
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  const positions = { ...circuit.positions, [deviceId]: { x: snap(x), y: snap(y) } };

  return {
    circuit: { ...circuit, devices: [...devices, device], parts: [...circuit.parts, part], positions },
    deviceId,
  };
}

function addWire(
  circuit: CircuitData, fromDeviceId: string, fromTag: string, fromPin: string,
  toDeviceId: string, toTag: string, toPin: string,
): CircuitData {
  const netId = generateId();
  const net = { id: netId, type: 'net', name: `NET_${circuit.nets.length + 1}`, netType: 'signal', createdAt: Date.now(), modifiedAt: Date.now() };
  const fromDevice = circuit.devices.find((d: any) => d.id === fromDeviceId);
  const conn = {
    fromDevice: fromTag, fromDeviceId, fromPin,
    toDevice: toTag, toDeviceId, toPin,
    netId, sheetId: fromDevice?.sheetId,
  };
  return { ...circuit, nets: [...circuit.nets, net], connections: [...circuit.connections, conn] };
}

function addSheetToCircuit(
  circuit: CircuitData, name: string, size = 'Tabloid',
): { circuit: CircuitData; sheetId: string } {
  const sheetId = generateId();
  const sheet = {
    id: sheetId, type: 'sheet', name, number: (circuit.sheets || []).length + 1,
    size, titleBlock: { title: name, date: new Date().toISOString().split('T')[0], revision: 'A', drawingNumber: `DWG-${String((circuit.sheets || []).length + 1).padStart(3, '0')}`, drawnBy: '' },
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  return { circuit: { ...circuit, sheets: [...(circuit.sheets || []), sheet] }, sheetId };
}

function addAnnotationToCircuit(
  circuit: CircuitData, sheetId: string, x: number, y: number, content: string,
): CircuitData {
  const ann = {
    id: generateId(), type: 'annotation', sheetId, annotationType: 'text',
    position: { x: snap(x), y: snap(y) }, content,
    style: { fontSize: 14, fontWeight: 'bold' },
    createdAt: Date.now(), modifiedAt: Date.now(),
  };
  return { ...circuit, annotations: [...(circuit.annotations || []), ann] };
}

// ── Pin position helpers ──

function getDevicePinWorldY(circuit: CircuitData, deviceId: string, pinId: string): number | null {
  const pos = circuit.positions[deviceId];
  if (!pos) return null;
  const device = circuit.devices.find((d: any) => d.id === deviceId);
  if (!device) return null;
  const part = circuit.parts.find((p: any) => p.id === device.partId);
  const symbolId = part?.category;
  if (!symbolId) return null;
  return pos.y + getPinOffsetY(symbolId, pinId);
}

function resolvePosition(
  pos: BlueprintPosition, deviceMap: Record<string, string>,
  circuit: CircuitData, origin: { x: number; y: number },
): { x: number; y: number } {
  if (pos.type === 'absolute') {
    return { x: origin.x + pos.x, y: origin.y + pos.y };
  }
  if (pos.type === 'relative') {
    const anchorId = deviceMap[pos.anchor];
    const anchorPos = anchorId ? circuit.positions[anchorId] : null;
    if (!anchorPos) return { x: origin.x + (pos.dx ?? 0), y: origin.y + (pos.dy ?? 0) };
    return { x: anchorPos.x + (pos.dx ?? 0), y: anchorPos.y + (pos.dy ?? 0) };
  }
  // align-pin handled separately after device placement
  return origin;
}

// ── Main engine ──

export function instantiateBlueprint(blueprint: Blueprint, ctx: BlueprintContext): BlueprintResult {
  // Resolve params
  const params: Record<string, any> = {};
  for (const p of blueprint.params) {
    params[p.name] = p.name in ctx.params ? ctx.params[p.name] : p.default;
  }

  let circuit = ctx.circuit;
  const origin = ctx.origin ?? { x: 0, y: 0 };
  const deviceMap: Record<string, string> = {};
  const tagMap: Record<string, string> = {};
  const sheetMap: Record<string, string> = {};
  const log: string[] = [];

  let primarySheetId = ctx.sheetId;
  sheetMap['_default'] = primarySheetId;

  // ── Create sheets ──
  if (blueprint.sheets) {
    for (const s of blueprint.sheets) {
      const name = resolveTemplate(s.name, params);
      const result = addSheetToCircuit(circuit, name, s.size);
      circuit = result.circuit;
      sheetMap[s.ref] = result.sheetId;
    }
    // Use first created sheet as primary if ctx.sheetId is empty
    if (!ctx.sheetId && blueprint.sheets.length > 0) {
      primarySheetId = sheetMap[blueprint.sheets[0].ref];
    }
  }

  // ── Instantiate children ──
  if (blueprint.children) {
    for (const child of blueprint.children) {
      if (child.condition && !params[child.condition]) continue;
      const childBp = getBlueprintById(child.blueprint);
      if (!childBp) { log.push(`Warning: blueprint "${child.blueprint}" not found`); continue; }

      const childParams: Record<string, any> = {};
      for (const [k, v] of Object.entries(child.params)) {
        childParams[k] = resolveTemplate(v, params);
      }
      const childSheetId = child.sheet ? (sheetMap[child.sheet] ?? primarySheetId) : primarySheetId;
      const childResult = instantiateBlueprint(childBp, { params: childParams, circuit, sheetId: childSheetId, origin });
      circuit = childResult.circuit;
      for (const [ref, id] of Object.entries(childResult.deviceMap)) {
        deviceMap[`${child.ref}.${ref}`] = id;
      }
      log.push(`${child.ref}: ${childResult.summary}`);
    }
  }

  // ── Place parent devices BEFORE repeats (repeats may wire to parent devices) ──
  for (const dev of blueprint.devices) {
    const tag = dev.tag ? resolveTemplate(dev.tag, params) : undefined;
    const func = dev.function ? resolveTemplate(dev.function, params) : undefined;
    const symbolId = resolveTemplate(dev.symbolId, params);
    const sheetId = dev.sheet ? (sheetMap[dev.sheet] ?? primarySheetId) : primarySheetId;

    let x = origin.x + 100, y = origin.y + 100;
    if (dev.position && dev.position.type !== 'align-pin') {
      const resolved = resolvePosition(dev.position, deviceMap, circuit, origin);
      x = resolved.x;
      y = resolved.y;
    }

    if (dev.linkedTo) {
      const linkedId = deviceMap[dev.linkedTo];
      const linkedTag = linkedId ? circuit.devices.find((d: any) => d.id === linkedId)?.tag : tag;
      if (!linkedTag) continue;
      const result = addLinkedDevice(circuit, linkedTag, symbolId, x, y, sheetId, func);
      circuit = result.circuit;
      deviceMap[dev.ref] = result.deviceId;
      tagMap[dev.ref] = linkedTag;
    } else {
      const result = addDevice(circuit, symbolId, tag || 'D1', x, y, sheetId, func);
      circuit = result.circuit;
      deviceMap[dev.ref] = result.deviceId;
      tagMap[dev.ref] = tag || 'D1';
    }
  }

  // ── Process repeats (parent devices already exist for port wiring) ──
  if (blueprint.repeats) {
    for (const repeat of blueprint.repeats) {
      const count = parseInt(resolveTemplate(repeat.count, params), 10) || 0;
      for (let i = 0; i < count; i++) {
        const childBp = getBlueprintById(repeat.blueprint);
        if (!childBp) { log.push(`Warning: blueprint "${repeat.blueprint}" not found`); break; }

        const instanceParams: Record<string, any> = { ...params, _index: i };
        if (repeat.params) {
          for (const [k, v] of Object.entries(repeat.params)) {
            instanceParams[k] = resolveTemplate(v, instanceParams);
          }
        }

        const childSheetId = sheetMap['outputs'] ?? primarySheetId;
        const childResult = instantiateBlueprint(childBp, {
          params: instanceParams, circuit, sheetId: childSheetId, origin,
        });
        circuit = childResult.circuit;

        for (const [ref, id] of Object.entries(childResult.deviceMap)) {
          deviceMap[`${repeat.ref}_${i}.${ref}`] = id;
        }

        // Wire repeat ports to parent devices
        if (repeat.wiring) {
          for (const w of repeat.wiring) {
            const portDef = childBp.ports.find((p: any) => p.name === w.port);
            if (!portDef) continue;
            const fromId = childResult.deviceMap[portDef.ref];
            const toId = deviceMap[w.toRef];
            if (!fromId || !toId) continue;
            const fromTag = circuit.devices.find((d: any) => d.id === fromId)?.tag;
            const toTag = circuit.devices.find((d: any) => d.id === toId)?.tag;
            const toPin = resolveTemplate(w.toPin, instanceParams);
            if (fromTag && toTag) {
              circuit = addWire(circuit, fromId, fromTag, portDef.pin, toId, toTag, toPin);
            }
          }
        }
      }
      log.push(`${repeat.ref}: ${count} instances`);
    }
  }

  // ── Resolve align-pin positions (needs devices to exist first) ──
  for (const dev of blueprint.devices) {
    if (!dev.position || dev.position.type !== 'align-pin') continue;
    const deviceId = deviceMap[dev.ref];
    const anchorId = deviceMap[dev.position.anchor];
    if (!deviceId || !anchorId) continue;

    const anchorPinY = getDevicePinWorldY(circuit, anchorId, dev.position.anchorPin);
    if (anchorPinY === null) continue;
    const anchorPos = circuit.positions[anchorId];
    if (!anchorPos) continue;

    const device = circuit.devices.find((d: any) => d.id === deviceId);
    const part = device ? circuit.parts.find((p: any) => p.id === device.partId) : null;
    const selfSymbol = part?.category;
    if (!selfSymbol) continue;

    const y = alignDeviceToPin(selfSymbol, dev.position.selfPin, anchorPinY);
    const x = anchorPos.x + (dev.position.dx ?? 0);
    circuit = { ...circuit, positions: { ...circuit.positions, [deviceId]: { x: snap(x), y: snap(y) } } };
  }

  // ── Create wires ──
  for (const w of blueprint.wires) {
    const fromId = deviceMap[w.from.ref];
    const toId = deviceMap[w.to.ref];
    if (!fromId || !toId) continue;
    const fromTag = circuit.devices.find((d: any) => d.id === fromId)?.tag;
    const toTag = circuit.devices.find((d: any) => d.id === toId)?.tag;
    if (!fromTag || !toTag) continue;
    circuit = addWire(circuit, fromId, fromTag, w.from.pin, toId, toTag, w.to.pin);
  }

  // ── Annotations ──
  if (blueprint.annotations) {
    for (const ann of blueprint.annotations) {
      const content = resolveTemplate(ann.content, params);
      const pos = resolvePosition(ann.position, deviceMap, circuit, origin);
      circuit = addAnnotationToCircuit(circuit, primarySheetId, pos.x, pos.y, content);
    }
  }

  // ── Build result ──
  const resolvedPorts: Record<string, { deviceId: string; pin: string }> = {};
  for (const port of blueprint.ports) {
    const deviceId = deviceMap[port.ref];
    if (deviceId) resolvedPorts[port.name] = { deviceId, pin: port.pin };
  }

  return {
    circuit,
    summary: `${blueprint.name}: ${Object.keys(deviceMap).length} devices, ${blueprint.wires.length} wires`,
    deviceMap,
    resolvedPorts,
  };
}

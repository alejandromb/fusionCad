/**
 * Electrical Rules Check (ERC) Validation System
 *
 * Validates a circuit for common errors and warnings:
 * - Unconnected pins
 * - Duplicate device tags
 * - Missing part assignments
 * - Unconnected nets
 * - Power net validation
 * - Short circuit detection (device-level)
 * - Hot-to-neutral short circuit detection (circuit-level path analysis)
 * - Orphan parts
 * - Wire without net
 */

import type { Device, Part, Net, SymbolDefinition } from '@fusion-cad/core-model';
import { getSymbolDefinition } from '@fusion-cad/core-model';
import { classifyDevice } from './device-classifier.js';
import { buildCircuitGraph, findPathsBetweenRails } from './circuit-graph.js';

export type ERCSeverity = 'error' | 'warning' | 'info';

export interface ERCViolation {
  id: string;
  severity: ERCSeverity;
  rule: string;
  message: string;
  deviceTags?: string[];
  sheetId?: string;
  pinIds?: string[];
  netId?: string;
}

export interface ERCReport {
  violations: ERCViolation[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  checkedAt: number;
}

export interface ERCConnection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
  sheetId?: string;
}

export interface ERCCircuitData {
  devices: Device[];
  nets: Net[];
  parts: Part[];
  connections: ERCConnection[];
}

type AddViolationFn = (
  severity: ERCSeverity,
  rule: string,
  message: string,
  extra?: Partial<ERCViolation>
) => void;

/**
 * Run all ERC checks against a circuit and return a report.
 */
export function runERC(circuit: ERCCircuitData): ERCReport {
  const violations: ERCViolation[] = [];
  let nextId = 1;

  const addViolation: AddViolationFn = (severity, rule, message, extra) => {
    violations.push({
      id: `ERC-${String(nextId++).padStart(3, '0')}`,
      severity,
      rule,
      message,
      ...extra,
    });
  };

  // Run each check
  checkDuplicateTags(circuit, addViolation);
  checkUnconnectedPins(circuit, addViolation);
  checkMissingParts(circuit, addViolation);
  checkUnconnectedNets(circuit, addViolation);
  checkPowerNetValidation(circuit, addViolation);
  checkShortCircuit(circuit, addViolation);
  checkHotToNeutralShort(circuit, addViolation);
  checkOrphanParts(circuit, addViolation);
  checkWireWithoutNet(circuit, addViolation);

  return {
    violations,
    errorCount: violations.filter(v => v.severity === 'error').length,
    warningCount: violations.filter(v => v.severity === 'warning').length,
    infoCount: violations.filter(v => v.severity === 'info').length,
    checkedAt: Date.now(),
  };
}

/**
 * Rule: Duplicate Device Tags (error)
 * Two devices with the same tag on the same sheet — unless they share
 * a deviceGroupId (linked representations of the same physical device).
 */
function checkDuplicateTags(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Group devices by sheet+tag
  const seen = new Map<string, Device[]>();

  for (const device of circuit.devices) {
    const key = `${device.sheetId}::${device.tag}`;
    const group = seen.get(key) || [];
    group.push(device);
    seen.set(key, group);
  }

  for (const [, group] of seen) {
    if (group.length > 1) {
      // If all devices in the group share the same deviceGroupId, they're
      // linked representations and NOT duplicates.
      const allLinked = group.every(
        d => d.deviceGroupId && d.deviceGroupId === group[0].deviceGroupId,
      );
      if (allLinked) continue;

      addViolation(
        'error',
        'duplicate-tag',
        `Duplicate device tag "${group[0].tag}" on the same sheet (${group.length} instances)`,
        {
          deviceTags: [group[0].tag],
          sheetId: group[0].sheetId,
        }
      );
    }
  }
}

/**
 * Rule: Unconnected Pins (warning)
 * Detect devices that have pins not connected to any wire.
 */
function checkUnconnectedPins(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Build a set of connected device+pin pairs
  const connectedPins = new Set<string>();

  for (const conn of circuit.connections) {
    connectedPins.add(`${conn.fromDevice}::${conn.fromPin}`);
    connectedPins.add(`${conn.toDevice}::${conn.toPin}`);
  }

  // Build a part lookup
  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) {
    partMap.set(part.id, part);
  }

  // Build set of pins suppressed by no-connect flags
  const noConnectSuppressed = buildNoConnectSuppressedPins(circuit, partMap);

  for (const device of circuit.devices) {
    // Determine the symbol category for this device
    const part = device.partId ? partMap.get(device.partId) : undefined;
    const category = part?.category || part?.symbolCategory;
    if (!category) continue;

    // Skip no-connect flags themselves
    if (isNoConnectCategory(category)) continue;

    // Get the symbol definition to know what pins this device has
    const symbolDef = getSymbolDefinition(category);
    if (!symbolDef) continue;

    const unconnectedPinNames: string[] = [];
    const unconnectedPinIds: string[] = [];

    for (const pin of symbolDef.pins) {
      const key = `${device.tag}::${pin.id}`;
      if (!connectedPins.has(key) && !noConnectSuppressed.has(key)) {
        unconnectedPinNames.push(pin.name || pin.id);
        unconnectedPinIds.push(pin.id);
      }
    }

    if (unconnectedPinNames.length > 0) {
      addViolation(
        'warning',
        'unconnected-pins',
        `Device "${device.tag}" has ${unconnectedPinNames.length} unconnected pin(s): ${unconnectedPinNames.join(', ')}`,
        {
          deviceTags: [device.tag],
          sheetId: device.sheetId,
          pinIds: unconnectedPinIds,
        }
      );
    }
  }
}

/**
 * Rule: Missing Part Assignment (warning)
 * Devices without a partId assigned.
 * Skips junction devices (internal wiring nodes, not physical parts).
 */
function checkMissingParts(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Build part map for junction detection
  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) {
    partMap.set(part.id, part);
  }

  for (const device of circuit.devices) {
    // Skip junction devices — they're internal wiring nodes
    if (device.partId) {
      const part = partMap.get(device.partId);
      if (part && part.category.toLowerCase() === 'junction') continue;
      // Skip no-connect flag devices — they're ERC markers, not physical parts
      if (part && isNoConnectCategory(part.category)) continue;
    }
    // Skip devices whose tag starts with J followed by L or R (ladder junctions: JL1, JR1)
    if (/^J[LR]\d+$/.test(device.tag)) continue;
    // Skip no-connect flag devices by tag pattern
    if (/^NC\d+$/.test(device.tag)) continue;

    if (!device.partId) {
      addViolation(
        'warning',
        'missing-part',
        `Device "${device.tag}" has no part assigned`,
        {
          deviceTags: [device.tag],
          sheetId: device.sheetId,
        }
      );
    }
  }
}

/**
 * Rule: Unconnected Nets (info)
 * Nets with fewer than 2 connections (a net with only 1 connection is floating).
 */
function checkUnconnectedNets(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Count connections per net
  const netConnectionCount = new Map<string, number>();

  for (const conn of circuit.connections) {
    netConnectionCount.set(conn.netId, (netConnectionCount.get(conn.netId) || 0) + 1);
  }

  // Build a net lookup for names
  const netMap = new Map<string, Net>();
  for (const net of circuit.nets) {
    netMap.set(net.id, net);
  }

  for (const net of circuit.nets) {
    const count = netConnectionCount.get(net.id) || 0;
    if (count < 2) {
      const netLabel = net.name || net.id;
      if (count === 0) {
        addViolation(
          'info',
          'unconnected-net',
          `Net "${netLabel}" has no connections (unused net)`,
          { netId: net.id }
        );
      } else {
        addViolation(
          'info',
          'unconnected-net',
          `Net "${netLabel}" has only 1 connection (floating wire)`,
          { netId: net.id }
        );
      }
    }
  }
}

/**
 * Rule: Power Net Validation (warning)
 * Power-type pins not connected to a power-type net.
 */
function checkPowerNetValidation(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Build net map
  const netMap = new Map<string, Net>();
  for (const net of circuit.nets) {
    netMap.set(net.id, net);
  }

  // Build part map
  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) {
    partMap.set(part.id, part);
  }

  // For each connection, check if the pins are power pins connected to non-power nets
  for (const conn of circuit.connections) {
    const net = netMap.get(conn.netId);
    if (!net) continue;

    // Check both endpoints
    const endpoints = [
      { deviceTag: conn.fromDevice, pinId: conn.fromPin },
      { deviceTag: conn.toDevice, pinId: conn.toPin },
    ];

    for (const endpoint of endpoints) {
      const device = circuit.devices.find(d => d.tag === endpoint.deviceTag);
      if (!device) continue;

      const part = device.partId ? partMap.get(device.partId) : undefined;
      const category = part?.category || part?.symbolCategory;
      if (!category) continue;

      const symbolDef = getSymbolDefinition(category);
      if (!symbolDef) continue;

      const pin = symbolDef.pins.find(p => p.id === endpoint.pinId);
      if (!pin) continue;

      if (pin.pinType === 'power' && net.netType !== 'power') {
        addViolation(
          'warning',
          'power-net-mismatch',
          `Power pin "${pin.name || pin.id}" on "${device.tag}" is connected to non-power net "${net.name || net.id}" (${net.netType})`,
          {
            deviceTags: [device.tag],
            pinIds: [endpoint.pinId],
            netId: net.id,
            sheetId: device.sheetId,
          }
        );
      }
    }
  }
}

/**
 * Rule: Short Circuit Detection (error)
 * Check if any device has two power pins connected to different power nets.
 * This indicates a potential short between different potentials.
 */
function checkShortCircuit(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // Build net map
  const netMap = new Map<string, Net>();
  for (const net of circuit.nets) {
    netMap.set(net.id, net);
  }

  // Build part map
  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) {
    partMap.set(part.id, part);
  }

  // For each device, collect power nets connected to it
  // Map: deviceTag -> Set of power net IDs
  const devicePowerNets = new Map<string, Map<string, { netName: string; pinId: string }>>();

  for (const conn of circuit.connections) {
    const net = netMap.get(conn.netId);
    if (!net || net.netType !== 'power') continue;

    const endpoints = [
      { deviceTag: conn.fromDevice, pinId: conn.fromPin },
      { deviceTag: conn.toDevice, pinId: conn.toPin },
    ];

    for (const endpoint of endpoints) {
      const device = circuit.devices.find(d => d.tag === endpoint.deviceTag);
      if (!device) continue;

      const part = device.partId ? partMap.get(device.partId) : undefined;
      const category = part?.category || part?.symbolCategory;
      if (!category) continue;

      const symbolDef = getSymbolDefinition(category);
      if (!symbolDef) continue;

      const pin = symbolDef.pins.find(p => p.id === endpoint.pinId);
      if (!pin || pin.pinType !== 'power') continue;

      if (!devicePowerNets.has(endpoint.deviceTag)) {
        devicePowerNets.set(endpoint.deviceTag, new Map());
      }
      const netInfo = devicePowerNets.get(endpoint.deviceTag)!;
      netInfo.set(conn.netId, {
        netName: net.name || net.id,
        pinId: endpoint.pinId,
      });
    }
  }

  // Check if any device bridges two different power nets
  for (const [deviceTag, nets] of devicePowerNets) {
    if (nets.size > 1) {
      const netNames = Array.from(nets.values()).map(n => n.netName);
      const pinIds = Array.from(nets.values()).map(n => n.pinId);
      const device = circuit.devices.find(d => d.tag === deviceTag);

      addViolation(
        'error',
        'short-circuit',
        `Potential short circuit: device "${deviceTag}" bridges power nets: ${netNames.join(' <-> ')}`,
        {
          deviceTags: [deviceTag],
          pinIds,
          sheetId: device?.sheetId,
        }
      );
    }
  }
}

/**
 * Rule: Hot-to-Neutral Short Circuit (error)
 *
 * Traces paths from hot rail (L1) to neutral rail (L2/N) through the circuit graph.
 * If any path has no load AND no protection device, it's a short circuit.
 *
 * Device roles:
 * - load: dissipates power (motor, heater, light) — makes path legitimate
 * - protection: interrupts fault current (breaker, fuse, overload) — makes path legitimate
 * - switching: may be open/closed (contactor, relay, button) — transparent to analysis
 * - passive: doesn't affect power flow (terminal, junction) — transparent to analysis
 */
function checkHotToNeutralShort(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  // 1. Identify hot vs neutral power nets by name
  const hotNetIds = new Set<string>();
  const neutralNetIds = new Set<string>();

  for (const net of circuit.nets) {
    if (net.netType !== 'power') continue;
    const name = (net.name || '').toUpperCase();
    if (name.includes('L1') || name === 'HOT' || name === '+' || name === '+24V' || name === '+24VDC') {
      hotNetIds.add(net.id);
    } else if (name.includes('L2') || name === 'N' || name === 'NEUTRAL' || name === '-' || name === '0V' || name === 'COM') {
      neutralNetIds.add(net.id);
    }
  }

  // Can't run this check without identifying both rails
  if (hotNetIds.size === 0 || neutralNetIds.size === 0) return;

  // 2. Build circuit graph
  const graph = buildCircuitGraph(circuit.connections);

  // 3. Classify all devices
  const deviceRoles = new Map<string, ReturnType<typeof classifyDevice>>();
  for (const device of circuit.devices) {
    deviceRoles.set(device.tag, classifyDevice(device, circuit.parts));
  }

  // 4. Find devices connected to each rail
  const hotDevices = new Set<string>();
  const neutralDevices = new Set<string>();

  for (const netId of hotNetIds) {
    const devices = graph.netDevices.get(netId);
    if (devices) devices.forEach(d => hotDevices.add(d));
  }
  for (const netId of neutralNetIds) {
    const devices = graph.netDevices.get(netId);
    if (devices) devices.forEach(d => neutralDevices.add(d));
  }

  // 5. Find paths and flag those with no load or protection
  const paths = findPathsBetweenRails(graph, hotDevices, neutralDevices, deviceRoles);

  for (const result of paths) {
    if (!result.hasLoad && !result.hasProtection) {
      addViolation(
        'error',
        'hot-to-neutral-short',
        `Potential short circuit: path from hot to neutral with no load or protection device: ${result.path.join(' \u2192 ')}`,
        { deviceTags: result.path }
      );
    }
  }
}

/**
 * Rule: Orphan Parts (info)
 * Parts defined but not referenced by any device.
 */
function checkOrphanParts(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  const referencedPartIds = new Set<string>();
  for (const device of circuit.devices) {
    if (device.partId) {
      referencedPartIds.add(device.partId);
    }
  }

  for (const part of circuit.parts) {
    if (!referencedPartIds.has(part.id)) {
      addViolation(
        'info',
        'orphan-part',
        `Part "${part.manufacturer} ${part.partNumber}" (${part.description}) is not used by any device`,
        {}
      );
    }
  }
}

/**
 * Rule: Wire Without Net (warning)
 * Connections that reference a netId that doesn't exist in the nets array.
 */
/**
 * Check if a category represents a no-connect flag.
 */
function isNoConnectCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return lower === 'no-connect' || lower === 'noconnect' || lower === 'no_connect';
}

/**
 * Build set of device::pin keys that are suppressed by no-connect flags.
 * A pin is suppressed if it's wired to a no-connect flag device.
 */
function buildNoConnectSuppressedPins(
  circuit: ERCCircuitData,
  partMap: Map<string, Part>,
): Set<string> {
  // Find all no-connect device tags
  const noConnectTags = new Set<string>();
  for (const device of circuit.devices) {
    const part = device.partId ? partMap.get(device.partId) : undefined;
    const category = part?.category || part?.symbolCategory;
    if (category && isNoConnectCategory(category)) {
      noConnectTags.add(device.tag);
    }
    // Also detect by tag pattern (NC1, NC2, etc.) when no part assigned
    if (!device.partId && /^NC\d+$/.test(device.tag)) {
      noConnectTags.add(device.tag);
    }
  }

  // For each connection involving a no-connect device, suppress the OTHER endpoint's pin
  const suppressed = new Set<string>();
  for (const conn of circuit.connections) {
    if (noConnectTags.has(conn.fromDevice)) {
      suppressed.add(`${conn.toDevice}::${conn.toPin}`);
    }
    if (noConnectTags.has(conn.toDevice)) {
      suppressed.add(`${conn.fromDevice}::${conn.fromPin}`);
    }
  }
  return suppressed;
}

function checkWireWithoutNet(circuit: ERCCircuitData, addViolation: AddViolationFn): void {
  const netIds = new Set<string>();
  for (const net of circuit.nets) {
    netIds.add(net.id);
  }

  for (const conn of circuit.connections) {
    if (!netIds.has(conn.netId)) {
      addViolation(
        'warning',
        'wire-without-net',
        `Wire from "${conn.fromDevice}:${conn.fromPin}" to "${conn.toDevice}:${conn.toPin}" references non-existent net "${conn.netId}"`,
        {
          deviceTags: [conn.fromDevice, conn.toDevice],
          netId: conn.netId,
          sheetId: conn.sheetId,
        }
      );
    }
  }
}

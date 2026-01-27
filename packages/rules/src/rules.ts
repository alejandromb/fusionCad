/**
 * Validation rules
 *
 * Rules are pure functions that analyze the circuit model
 * and return validation results.
 */

import type { Device, Net } from '@fusion-cad/core-model';
import type { RuleResult, ValidationReport } from './types.js';

/**
 * Connection data (simplified for Phase 1)
 */
export interface Connection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
}

/**
 * Rule 1: Check for duplicate device tags
 */
export function checkDuplicateTags(devices: Device[]): RuleResult[] {
  const results: RuleResult[] = [];
  const tagCounts = new Map<string, number>();

  // Count tag occurrences
  for (const device of devices) {
    const count = tagCounts.get(device.tag) || 0;
    tagCounts.set(device.tag, count + 1);
  }

  // Report duplicates
  for (const [tag, count] of tagCounts.entries()) {
    if (count > 1) {
      results.push({
        ruleCode: 'DUP_TAG',
        severity: 'error',
        message: `Device tag "${tag}" is used ${count} times. Each device must have a unique tag.`,
        deviceTag: tag,
        suggestedFix: `Rename duplicate instances to ${tag}-1, ${tag}-2, etc.`,
      });
    }
  }

  return results;
}

/**
 * Rule 2: Check for unconnected devices
 */
export function checkUnconnectedDevices(
  devices: Device[],
  connections: Connection[]
): RuleResult[] {
  const results: RuleResult[] = [];

  // Get set of connected device tags
  const connectedTags = new Set<string>();
  for (const conn of connections) {
    connectedTags.add(conn.fromDevice);
    connectedTags.add(conn.toDevice);
  }

  // Check each device
  for (const device of devices) {
    if (!connectedTags.has(device.tag)) {
      results.push({
        ruleCode: 'UNCONNECTED_DEVICE',
        severity: 'warning',
        message: `Device "${device.tag}" has no connections. This may indicate an incomplete circuit.`,
        deviceTag: device.tag,
        suggestedFix: 'Connect this device to the circuit or remove it.',
      });
    }
  }

  return results;
}

/**
 * Rule 3: Check for nets with only one connection (dead ends)
 */
export function checkDeadEndNets(
  nets: Net[],
  connections: Connection[]
): RuleResult[] {
  const results: RuleResult[] = [];

  // Count connections per net
  const netConnectionCounts = new Map<string, number>();
  for (const conn of connections) {
    const count = netConnectionCounts.get(conn.netId) || 0;
    netConnectionCounts.set(conn.netId, count + 1);
  }

  // Check each net
  for (const net of nets) {
    const count = netConnectionCounts.get(net.id) || 0;
    if (count === 1) {
      results.push({
        ruleCode: 'DEAD_END_NET',
        severity: 'warning',
        message: `Net "${net.name || 'UNNAMED'}" has only one connection. This may indicate an incomplete circuit.`,
        netId: net.id,
        suggestedFix: 'Complete the circuit by connecting this net to another device.',
      });
    } else if (count === 0) {
      results.push({
        ruleCode: 'UNUSED_NET',
        severity: 'info',
        message: `Net "${net.name || 'UNNAMED'}" is defined but not used.`,
        netId: net.id,
        suggestedFix: 'Remove this net or connect devices to it.',
      });
    }
  }

  return results;
}

/**
 * Run all validation rules
 */
export function validateCircuit(
  devices: Device[],
  nets: Net[],
  connections: Connection[]
): ValidationReport {
  const results: RuleResult[] = [];

  // Run all rules
  results.push(...checkDuplicateTags(devices));
  results.push(...checkUnconnectedDevices(devices, connections));
  results.push(...checkDeadEndNets(nets, connections));

  // Count by severity
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const result of results) {
    if (result.severity === 'error') errorCount++;
    else if (result.severity === 'warning') warningCount++;
    else if (result.severity === 'info') infoCount++;
  }

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    results,
    generatedAt: Date.now(),
  };
}

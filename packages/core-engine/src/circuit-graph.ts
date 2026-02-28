/**
 * Circuit graph for ERC power flow analysis.
 *
 * Builds a device-level adjacency graph from connections and finds
 * paths between power rails to detect short circuits.
 */

import type { DeviceRole } from './device-classifier.js';
import type { ERCConnection } from './erc.js';

export interface CircuitGraph {
  /** device tag → set of connected device tags */
  adjacency: Map<string, Set<string>>;
  /** device tag → set of connected net IDs */
  deviceNets: Map<string, Set<string>>;
  /** net ID → set of connected device tags */
  netDevices: Map<string, Set<string>>;
}

export interface PathAnalysisResult {
  /** Whether the path passes through a load device */
  hasLoad: boolean;
  /** Whether the path passes through a protection device */
  hasProtection: boolean;
  /** Device tags along the path, in order */
  path: string[];
}

/**
 * Build a device-level adjacency graph from connections.
 * Each connection links two devices — we track which devices connect
 * to which other devices, and through which nets.
 */
export function buildCircuitGraph(connections: ERCConnection[]): CircuitGraph {
  const adjacency = new Map<string, Set<string>>();
  const deviceNets = new Map<string, Set<string>>();
  const netDevices = new Map<string, Set<string>>();

  for (const conn of connections) {
    // Bidirectional adjacency
    getOrCreate(adjacency, conn.fromDevice).add(conn.toDevice);
    getOrCreate(adjacency, conn.toDevice).add(conn.fromDevice);

    // Device ↔ Net mappings
    getOrCreate(deviceNets, conn.fromDevice).add(conn.netId);
    getOrCreate(deviceNets, conn.toDevice).add(conn.netId);
    getOrCreate(netDevices, conn.netId).add(conn.fromDevice);
    getOrCreate(netDevices, conn.netId).add(conn.toDevice);
  }

  return { adjacency, deviceNets, netDevices };
}

/**
 * Find all device-level paths from hot rail devices to neutral rail devices.
 *
 * Uses BFS with path tracking. Tracks whether each path passes through
 * a load or protection device. Switching and passive devices are treated
 * as transparent (current can flow through them).
 *
 * Returns one result per unique path found.
 */
export function findPathsBetweenRails(
  graph: CircuitGraph,
  hotDevices: Set<string>,
  neutralDevices: Set<string>,
  deviceRoles: Map<string, DeviceRole>,
): PathAnalysisResult[] {
  const results: PathAnalysisResult[] = [];

  for (const startDevice of hotDevices) {
    // BFS with path + role tracking
    const queue: Array<{
      device: string;
      path: string[];
      hasLoad: boolean;
      hasProtection: boolean;
    }> = [];

    const startRole = deviceRoles.get(startDevice) || 'unknown';
    queue.push({
      device: startDevice,
      path: [startDevice],
      hasLoad: startRole === 'load',
      hasProtection: startRole === 'protection',
    });

    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { device, path, hasLoad, hasProtection } = current;

      if (visited.has(device)) continue;
      visited.add(device);

      // If we've reached a neutral-connected device, record the path
      if (neutralDevices.has(device) && path.length > 1) {
        results.push({ hasLoad, hasProtection, path });
        continue; // Don't explore beyond neutral rail
      }

      // Explore neighbors
      const neighbors = graph.adjacency.get(device);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const neighborRole = deviceRoles.get(neighbor) || 'unknown';
        queue.push({
          device: neighbor,
          path: [...path, neighbor],
          hasLoad: hasLoad || neighborRole === 'load',
          hasProtection: hasProtection || neighborRole === 'protection',
        });
      }
    }
  }

  return results;
}

function getOrCreate<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
}

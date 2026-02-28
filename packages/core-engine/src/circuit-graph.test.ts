import { describe, it, expect } from 'vitest';
import { buildCircuitGraph, findPathsBetweenRails } from './circuit-graph.js';
import type { ERCConnection } from './erc.js';
import type { DeviceRole } from './device-classifier.js';

function conn(from: string, fromPin: string, to: string, toPin: string, netId: string): ERCConnection {
  return { fromDevice: from, fromPin, toDevice: to, toPin, netId };
}

describe('buildCircuitGraph', () => {
  it('builds adjacency from connections', () => {
    const connections = [
      conn('S1', '1', 'K1', 'A1', 'net-1'),
      conn('K1', 'A2', 'M1', '1', 'net-2'),
    ];
    const graph = buildCircuitGraph(connections);

    expect(graph.adjacency.get('S1')?.has('K1')).toBe(true);
    expect(graph.adjacency.get('K1')?.has('S1')).toBe(true);
    expect(graph.adjacency.get('K1')?.has('M1')).toBe(true);
    expect(graph.adjacency.get('M1')?.has('K1')).toBe(true);
  });

  it('handles empty connections', () => {
    const graph = buildCircuitGraph([]);
    expect(graph.adjacency.size).toBe(0);
    expect(graph.deviceNets.size).toBe(0);
    expect(graph.netDevices.size).toBe(0);
  });

  it('tracks device-net relationships', () => {
    const connections = [
      conn('S1', '1', 'K1', 'A1', 'net-hot'),
      conn('K1', 'A2', 'M1', '1', 'net-load'),
    ];
    const graph = buildCircuitGraph(connections);

    expect(graph.deviceNets.get('K1')?.has('net-hot')).toBe(true);
    expect(graph.deviceNets.get('K1')?.has('net-load')).toBe(true);
    expect(graph.netDevices.get('net-hot')?.has('S1')).toBe(true);
    expect(graph.netDevices.get('net-hot')?.has('K1')).toBe(true);
  });
});

describe('findPathsBetweenRails', () => {
  it('finds direct short path (no load, no protection)', () => {
    // S1 (switch) connected directly from hot device to neutral device
    const connections = [
      conn('JL1', 'pin-right', 'S1', '1', 'net-1'),
      conn('S1', '2', 'JR1', 'pin-left', 'net-2'),
    ];
    const graph = buildCircuitGraph(connections);

    const roles = new Map<string, DeviceRole>([
      ['JL1', 'passive'],
      ['S1', 'switching'],
      ['JR1', 'passive'],
    ]);

    const results = findPathsBetweenRails(
      graph,
      new Set(['JL1']),   // hot
      new Set(['JR1']),   // neutral
      roles,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].hasLoad).toBe(false);
    expect(results[0].hasProtection).toBe(false);
    expect(results[0].path).toContain('JL1');
    expect(results[0].path).toContain('JR1');
  });

  it('does NOT flag legitimate motor circuit', () => {
    // L1 junction → CB1 (protection) → K1 (switching) → M1 (load) → L2 junction
    const connections = [
      conn('JL1', 'r', 'CB1', '1', 'net-1'),
      conn('CB1', '2', 'K1', 'L1', 'net-2'),
      conn('K1', 'T1', 'M1', '1', 'net-3'),
      conn('M1', '2', 'JR1', 'l', 'net-4'),
    ];
    const graph = buildCircuitGraph(connections);

    const roles = new Map<string, DeviceRole>([
      ['JL1', 'passive'],
      ['CB1', 'protection'],
      ['K1', 'switching'],
      ['M1', 'load'],
      ['JR1', 'passive'],
    ]);

    const results = findPathsBetweenRails(
      graph,
      new Set(['JL1']),
      new Set(['JR1']),
      roles,
    );

    expect(results.length).toBeGreaterThan(0);
    // Path has both load and protection — should not be flagged
    expect(results[0].hasLoad).toBe(true);
    expect(results[0].hasProtection).toBe(true);
  });

  it('returns hasProtection when only protection in path', () => {
    // Fuse between rails with no load (protection-only path)
    const connections = [
      conn('JL1', 'r', 'FU1', '1', 'net-1'),
      conn('FU1', '2', 'JR1', 'l', 'net-2'),
    ];
    const graph = buildCircuitGraph(connections);

    const roles = new Map<string, DeviceRole>([
      ['JL1', 'passive'],
      ['FU1', 'protection'],
      ['JR1', 'passive'],
    ]);

    const results = findPathsBetweenRails(
      graph,
      new Set(['JL1']),
      new Set(['JR1']),
      roles,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].hasProtection).toBe(true);
    expect(results[0].hasLoad).toBe(false);
  });

  it('returns empty when no path exists', () => {
    // Two disconnected devices
    const graph = buildCircuitGraph([]);

    const results = findPathsBetweenRails(
      graph,
      new Set(['JL1']),
      new Set(['JR1']),
      new Map(),
    );

    expect(results.length).toBe(0);
  });
});

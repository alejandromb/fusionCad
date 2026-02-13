/**
 * Ladder Diagram Layout Engine
 *
 * Pure function: given rungs + ladder config, computes device positions
 * and rail connection points for standard ladder diagram format.
 *
 * Layout conventions:
 * - L1 (hot) vertical rail on the LEFT
 * - L2 (neutral/return) vertical rail on the RIGHT
 * - Horizontal rungs numbered sequentially, read left-to-right
 * - Input devices (contacts, switches) on the left side of each rung
 * - Output devices (coils, lights) on the right side
 */

import type { Device, LadderConfig, Rung } from '@fusion-cad/core-model';

export interface RailConnection {
  deviceId: string;
  pin: string;
  rail: 'L1' | 'L2';
  point: { x: number; y: number };
}

export interface LadderLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  railConnections: RailConnection[];
}

/** Default ladder configuration values */
export const DEFAULT_LADDER_CONFIG: LadderConfig = {
  railL1X: 100,
  railL2X: 900,
  firstRungY: 100,
  rungSpacing: 120,
  railLabelL1: 'L1',
  railLabelL2: 'L2',
};

/**
 * Compute device positions and rail connections for a ladder diagram.
 *
 * For each rung:
 * 1. Calculate rung Y from config
 * 2. Distribute devices evenly between L1 and L2 rails
 * 3. Generate rail connection points for leftmost and rightmost devices
 */
export function layoutLadder(
  rungs: Rung[],
  devices: Device[],
  config: LadderConfig,
  blockOffset?: { x: number; y: number },
): LadderLayoutResult {
  const positions: Record<string, { x: number; y: number }> = {};
  const railConnections: RailConnection[] = [];

  // Block offset for absolute world-coordinate positioning
  const ox = blockOffset?.x ?? 0;
  const oy = blockOffset?.y ?? 0;

  // Build device lookup by ID
  const deviceMap = new Map(devices.map(d => [d.id, d]));

  // Sort rungs by number for consistent layout
  const sortedRungs = [...rungs].sort((a, b) => a.number - b.number);

  for (const rung of sortedRungs) {
    const rungY = config.firstRungY + (rung.number - 1) * config.rungSpacing + oy;

    // Filter to devices that actually exist
    const rungDeviceIds = rung.deviceIds.filter(id => deviceMap.has(id));
    const deviceCount = rungDeviceIds.length;

    if (deviceCount === 0) continue;

    // Distribute devices evenly between the two rails
    const availableWidth = config.railL2X - config.railL1X;
    const spacing = availableWidth / (deviceCount + 1);

    for (let i = 0; i < deviceCount; i++) {
      const deviceId = rungDeviceIds[i];
      const x = config.railL1X + spacing * (i + 1) + ox;
      positions[deviceId] = { x: Math.round(x / 20) * 20, y: rungY };
    }

    // Rail connections: leftmost device connects to L1, rightmost to L2
    const leftmostId = rungDeviceIds[0];
    const rightmostId = rungDeviceIds[rungDeviceIds.length - 1];

    // Left device's left pin → L1
    railConnections.push({
      deviceId: leftmostId,
      pin: 'pin-left',
      rail: 'L1',
      point: { x: config.railL1X + ox, y: rungY },
    });

    // Right device's right pin → L2
    railConnections.push({
      deviceId: rightmostId,
      pin: 'pin-right',
      rail: 'L2',
      point: { x: config.railL2X + ox, y: rungY },
    });
  }

  return { positions, railConnections };
}

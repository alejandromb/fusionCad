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
  /** Device IDs that span multiple rungs (e.g., PLC modules) — should NOT be rotated -90° */
  multiRungDeviceIds: Set<string>;
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
 * Handles two device types:
 * - **Single-rung devices** (coils, contacts): rotated -90°, distributed horizontally on their rung
 * - **Multi-rung devices** (PLC modules): stay upright, positioned on the L1 side,
 *   vertically centered across the rungs they span so their output pins align with rung Y positions
 *
 * For each rung:
 * 1. Calculate rung Y from config
 * 2. Exclude multi-rung devices from horizontal distribution
 * 3. Distribute remaining single-rung devices evenly between L1 and L2 rails
 * 4. Generate rail connection points for leftmost and rightmost devices
 */
export function layoutLadder(
  rungs: Rung[],
  devices: Device[],
  config: LadderConfig,
  blockOffset?: { x: number; y: number },
  symbolHeights?: Record<string, number>,
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

  // ── Detect multi-rung devices ──
  // Count how many rungs each device appears in
  const deviceRungCount = new Map<string, number>();
  const deviceRungNumbers = new Map<string, number[]>();
  for (const rung of sortedRungs) {
    for (const id of rung.deviceIds) {
      if (!deviceMap.has(id)) continue;
      deviceRungCount.set(id, (deviceRungCount.get(id) || 0) + 1);
      if (!deviceRungNumbers.has(id)) deviceRungNumbers.set(id, []);
      deviceRungNumbers.get(id)!.push(rung.number);
    }
  }
  const multiRungDeviceIds = new Set<string>();
  for (const [id, count] of deviceRungCount) {
    if (count > 1) multiRungDeviceIds.add(id);
  }

  // ── Position multi-rung devices (e.g., PLC modules) ──
  // Place on L1 side, vertically centered across their rung range.
  // These devices stay upright (no rotation) so their pins face right toward the coils.
  const MULTI_RUNG_X_MARGIN = 60; // px inset from L1 rail
  for (const deviceId of multiRungDeviceIds) {
    const rungNums = deviceRungNumbers.get(deviceId)!;
    const minRung = Math.min(...rungNums);
    const maxRung = Math.max(...rungNums);
    const firstRungY = config.firstRungY + (minRung - 1) * config.rungSpacing + oy;
    const lastRungY = config.firstRungY + (maxRung - 1) * config.rungSpacing + oy;
    const centerY = (firstRungY + lastRungY) / 2;

    const symbolHeight = symbolHeights?.[deviceId] ?? 60;
    const x = config.railL1X + MULTI_RUNG_X_MARGIN + ox;
    positions[deviceId] = {
      x: Math.round(x / 20) * 20,
      y: Math.round((centerY - symbolHeight / 2) / 20) * 20,
    };
  }

  // ── Position single-rung devices per rung ──
  const DEFAULT_SYMBOL_HEIGHT = 60;

  for (const rung of sortedRungs) {
    const rungY = config.firstRungY + (rung.number - 1) * config.rungSpacing + oy;

    // Filter to existing devices, EXCLUDING multi-rung devices from horizontal distribution
    const singleRungIds = rung.deviceIds.filter(id => deviceMap.has(id) && !multiRungDeviceIds.has(id));
    const deviceCount = singleRungIds.length;

    if (deviceCount === 0) {
      // Even with no single-rung devices, generate rail connections for multi-rung device on this rung
      const multiOnRung = rung.deviceIds.filter(id => multiRungDeviceIds.has(id));
      if (multiOnRung.length > 0) {
        railConnections.push({
          deviceId: multiOnRung[0],
          pin: 'pin-left',
          rail: 'L1',
          point: { x: config.railL1X + ox, y: rungY },
        });
      }
      continue;
    }

    // For single-rung devices: distribute in the RIGHT portion of the rung
    // (leave left portion for multi-rung device if present)
    const hasMultiOnRung = rung.deviceIds.some(id => multiRungDeviceIds.has(id));
    const leftBound = hasMultiOnRung
      ? config.railL1X + (config.railL2X - config.railL1X) * 0.35  // Start at 35% — past the PLC
      : config.railL1X;
    const availableWidth = config.railL2X - leftBound;
    const spacing = availableWidth / (deviceCount + 1);

    for (let i = 0; i < deviceCount; i++) {
      const deviceId = singleRungIds[i];
      const pinCenterOffset = (symbolHeights?.[deviceId] ?? DEFAULT_SYMBOL_HEIGHT) / 2;
      const x = leftBound + spacing * (i + 1) + ox;
      positions[deviceId] = { x: Math.round(x / 20) * 20, y: rungY - pinCenterOffset };
    }

    // Rail connections: leftmost → L1, rightmost → L2
    // If a multi-rung device is on this rung, IT is the leftmost (L1 connection)
    const multiOnRung = rung.deviceIds.filter(id => multiRungDeviceIds.has(id));
    const leftmostId = multiOnRung.length > 0 ? multiOnRung[0] : singleRungIds[0];
    const rightmostId = singleRungIds[singleRungIds.length - 1];

    railConnections.push({
      deviceId: leftmostId,
      pin: 'pin-left',
      rail: 'L1',
      point: { x: config.railL1X + ox, y: rungY },
    });

    railConnections.push({
      deviceId: rightmostId,
      pin: 'pin-right',
      rail: 'L2',
      point: { x: config.railL2X + ox, y: rungY },
    });
  }

  return { positions, railConnections, multiRungDeviceIds };
}

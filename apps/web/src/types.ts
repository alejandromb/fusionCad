/**
 * Shared application types and constants
 */

import type { Device, Part } from '@fusion-cad/core-model';
import { getAllSymbolCategories, findCategoryDef } from '@fusion-cad/core-model';
import type { CircuitData } from './renderer/circuit-renderer';
import { getSymbolGeometry } from './renderer/symbols';
import type { Point } from './renderer/types';

export type SymbolCategory = string;
export type InteractionMode = 'select' | 'place' | 'wire' | 'text';

// Dynamic categories from the core-model registry
export const SYMBOL_CATEGORIES = getAllSymbolCategories();

export { findCategoryDef };

export const GRID_SIZE = 20;
export const AUTO_SAVE_DELAY = 1000;
export const MAX_HISTORY_SIZE = 50;

export interface PinHit {
  device: string;  // device ID (ULID)
  pin: string;
}

export interface HistorySnapshot {
  circuit: CircuitData;
  positions: Map<string, Point>;
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Get pin at world coordinates (8px hit radius)
 * Positions map is keyed by device ID.
 * Returns device ID in PinHit.device.
 */
export function getPinAtPoint(
  worldX: number,
  worldY: number,
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>
): PinHit | null {
  const HIT_RADIUS = 8;
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const pos = positions.get(device.id);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.category || 'unknown');

    for (const pin of geometry.pins) {
      const pinX = pos.x + pin.position.x;
      const pinY = pos.y + pin.position.y;
      const dist = Math.hypot(worldX - pinX, worldY - pinY);

      if (dist <= HIT_RADIUS) {
        return { device: device.id, pin: pin.id };
      }
    }
  }

  return null;
}

/**
 * Get symbol at world coordinates (bounding box check)
 * Positions map is keyed by device ID.
 * Returns device ID (not tag).
 */
export function getSymbolAtPoint(
  worldX: number,
  worldY: number,
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>
): string | null {
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const pos = positions.get(device.id);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.category || 'unknown');

    if (
      worldX >= pos.x &&
      worldX <= pos.x + geometry.width &&
      worldY >= pos.y &&
      worldY <= pos.y + geometry.height
    ) {
      return device.id;
    }
  }

  return null;
}

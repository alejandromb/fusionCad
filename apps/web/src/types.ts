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

/** Compute a pin's world position accounting for device rotation. */
function applyPinTransform(
  devicePos: Point,
  pinPos: Point,
  geometry: { width: number; height: number },
  transform?: { rotation: number; mirrorH?: boolean },
): Point {
  let px = pinPos.x;
  let py = pinPos.y;

  const rotation = transform?.rotation || 0;
  if (rotation !== 0) {
    const cx = geometry.width / 2;
    const cy = geometry.height / 2;
    const rad = (rotation * Math.PI) / 180;
    const dx = pinPos.x - cx;
    const dy = pinPos.y - cy;
    px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }

  return { x: devicePos.x + px, y: devicePos.y + py };
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
  positions: Map<string, Point>,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
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
    const transform = transforms?.[device.id];

    for (const pin of geometry.pins) {
      const pinWorld = applyPinTransform(pos, pin.position, geometry, transform);
      const dist = Math.hypot(worldX - pinWorld.x, worldY - pinWorld.y);

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
  positions: Map<string, Point>,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
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
    const transform = transforms?.[device.id];
    const rotation = transform?.rotation || 0;

    // For rotated devices, swap width/height for bounding box check
    const effectiveWidth = (rotation % 180 !== 0) ? geometry.height : geometry.width;
    const effectiveHeight = (rotation % 180 !== 0) ? geometry.width : geometry.height;

    // Center stays the same, but bounds shift with swapped dimensions
    const cx = pos.x + geometry.width / 2;
    const cy = pos.y + geometry.height / 2;
    const minX = cx - effectiveWidth / 2;
    const minY = cy - effectiveHeight / 2;

    if (
      worldX >= minX &&
      worldX <= minX + effectiveWidth &&
      worldY >= minY &&
      worldY <= minY + effectiveHeight
    ) {
      return device.id;
    }
  }

  return null;
}

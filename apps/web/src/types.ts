/**
 * Shared application types and constants
 */

import type { Device, Part } from '@fusion-cad/core-model';
import { getAllSymbolCategories, findCategoryDef, GRID_MM, MM_TO_PX } from '@fusion-cad/core-model';
import type { CircuitData } from './renderer/circuit-renderer';
import { getSymbolGeometry } from './renderer/symbols';
import type { Point } from './renderer/types';

export type SymbolCategory = string;
export type InteractionMode = 'select' | 'place' | 'wire' | 'text' | 'shape' | 'pan';
export type ShapeToolType = 'rectangle' | 'circle' | 'line' | 'arrow';

// Dynamic categories from the core-model registry
export const SYMBOL_CATEGORIES = getAllSymbolCategories();

export { findCategoryDef };

/**
 * Grid size in mm. All coordinates are in mm.
 * Screen rendering multiplies by MM_TO_PX (4px/mm at 1x zoom).
 * @deprecated Use GRID_MM from @fusion-cad/core-model directly.
 */
export const GRID_SIZE = GRID_MM;
export const AUTO_SAVE_DELAY = 1000;
export const MAX_HISTORY_SIZE = 50;

/** Global snap-to-grid enabled flag. Toggled from UI, persisted to localStorage. */
let _snapEnabled = localStorage.getItem('snapToGridEnabled') !== 'false'; // default ON
export function isSnapEnabled(): boolean { return _snapEnabled; }
export function setSnapEnabled(v: boolean): void {
  _snapEnabled = v;
  localStorage.setItem('snapToGridEnabled', v ? 'true' : 'false');
}

export interface PinHit {
  device: string;  // device ID (ULID)
  pin: string;
}

export interface HistorySnapshot {
  circuit: CircuitData;
  positions: Map<string, Point>;
}

export function snapToGrid(value: number): number {
  if (!_snapEnabled) return value;
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
  viewportScale = 1,
): PinHit | null {
  const HIT_RADIUS = 8 / (viewportScale * MM_TO_PX);
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const pos = positions.get(device.id);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
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
  viewportScale = 1,
  panelScale = 1,
): string | null {
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const rawPos = positions.get(device.id);
    if (!rawPos) continue;

    // Panel scale: device renders at pos/panelScale, so scale hit box to match
    const ps = panelScale > 1 ? panelScale : 1;
    const pos = { x: rawPos.x / ps, y: rawPos.y / ps };

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
    const transform = transforms?.[device.id];
    const rotation = transform?.rotation || 0;

    // For rotated devices, swap width/height for bounding box check
    const effectiveWidth = ((rotation % 180 !== 0) ? geometry.height : geometry.width) / ps;
    const effectiveHeight = ((rotation % 180 !== 0) ? geometry.width : geometry.height) / ps;

    // Shrink hit box by an inset to exclude pin stub areas at symbol edges.
    const rawInset = 10 / (viewportScale * MM_TO_PX);
    const insetX = Math.min(rawInset, effectiveWidth * 0.25);
    const insetY = Math.min(rawInset, effectiveHeight * 0.25);
    const insetW = effectiveWidth - insetX * 2;
    const insetH = effectiveHeight - insetY * 2;

    // Center stays the same, but bounds shift with swapped dimensions
    const cx = pos.x + (geometry.width / ps) / 2;
    const cy = pos.y + (geometry.height / ps) / 2;
    const minX = cx - insetW / 2;
    const minY = cy - insetH / 2;

    if (
      worldX >= minX &&
      worldX <= minX + insetW &&
      worldY >= minY &&
      worldY <= minY + insetH
    ) {
      return device.id;
    }
  }

  return null;
}

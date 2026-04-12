/**
 * Pure math utilities for pin position transforms.
 * No DOM, no React, no state — just geometry.
 * Extracted so it can be unit-tested without jsdom.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Compute a pin's world position accounting for device rotation and mirror.
 *
 * Mirror is applied FIRST (flip X around symbol center), then rotation.
 * This matches the canvas rendering order in drawSymbol().
 */
export function applyPinTransform(
  devicePos: Point,
  pinPos: Point,
  geometry: { width: number; height: number },
  transform?: { rotation: number; mirrorH?: boolean },
): Point {
  let px = pinPos.x;
  let py = pinPos.y;

  // Apply mirror first (flip X around symbol center)
  if (transform?.mirrorH) {
    px = geometry.width - px;
  }

  const rotation = transform?.rotation || 0;
  if (rotation !== 0) {
    const cx = geometry.width / 2;
    const cy = geometry.height / 2;
    const rad = (rotation * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }

  return { x: devicePos.x + px, y: devicePos.y + py };
}

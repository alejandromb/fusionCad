/**
 * Pin transform tests — verifies that pin world positions are computed
 * correctly for rotated and mirrored devices.
 *
 * Regression: Session 39 found that applyPinTransform and getPinWorldPosition
 * completely ignored the mirrorH flag, so mirrored devices had pins at wrong
 * positions causing disconnected wires. The fix flips pin.x around the symbol
 * center when mirrorH is true.
 */

import { describe, it, expect } from 'vitest';
import { applyPinTransform } from '../utils/pin-math';

const GEO_10x20 = { width: 10, height: 20 };
const DEVICE_POS = { x: 100, y: 200 };

describe('applyPinTransform', () => {
  it('returns raw position when no transform', () => {
    const result = applyPinTransform(DEVICE_POS, { x: 5, y: 0 }, GEO_10x20);
    expect(result).toEqual({ x: 105, y: 200 });
  });

  it('returns raw position when transform is zero rotation, no mirror', () => {
    const result = applyPinTransform(DEVICE_POS, { x: 5, y: 0 }, GEO_10x20, { rotation: 0 });
    expect(result).toEqual({ x: 105, y: 200 });
  });

  // ── Mirror ──

  it('mirrors pin X around symbol center', () => {
    // Pin at x=2 on a 10mm wide symbol → mirrored to x=8
    const result = applyPinTransform(DEVICE_POS, { x: 2, y: 5 }, GEO_10x20, { rotation: 0, mirrorH: true });
    expect(result.x).toBeCloseTo(108); // 100 + (10 - 2) = 108
    expect(result.y).toBeCloseTo(205); // unchanged
  });

  it('mirrors pin at symbol edge (x=0 → x=width)', () => {
    // Left-edge pin → right edge after mirror
    const result = applyPinTransform(DEVICE_POS, { x: 0, y: 10 }, GEO_10x20, { rotation: 0, mirrorH: true });
    expect(result.x).toBeCloseTo(110); // 100 + 10
    expect(result.y).toBeCloseTo(210);
  });

  it('mirrors pin at symbol center (stays in place)', () => {
    // Center pin doesn't move when mirrored
    const result = applyPinTransform(DEVICE_POS, { x: 5, y: 10 }, GEO_10x20, { rotation: 0, mirrorH: true });
    expect(result.x).toBeCloseTo(105); // 100 + 5
    expect(result.y).toBeCloseTo(210);
  });

  // ── Rotation ──

  it('rotates pin 90° clockwise', () => {
    // Pin at top-center (5, 0) of a 10x20 symbol
    // After 90° CW: should be at right-center-ish
    const result = applyPinTransform(DEVICE_POS, { x: 5, y: 0 }, GEO_10x20, { rotation: 90 });
    // cx=5, cy=10. dx=0, dy=-10. After 90° CW: px = cx + dy*sin(-90) = ...
    // Actually: px = cx + dx*cos(90) - dy*sin(90) = 5 + 0*0 - (-10)*1 = 15
    //           py = cy + dx*sin(90) + dy*cos(90) = 10 + 0*1 + (-10)*0 = 10
    expect(result.x).toBeCloseTo(115);
    expect(result.y).toBeCloseTo(210);
  });

  it('rotates pin 180°', () => {
    // Pin at (2, 0) → after 180° → should be at (8, 20)
    const result = applyPinTransform(DEVICE_POS, { x: 2, y: 0 }, GEO_10x20, { rotation: 180 });
    expect(result.x).toBeCloseTo(108);
    expect(result.y).toBeCloseTo(220);
  });

  // ── Mirror + Rotation combined ──

  it('applies mirror THEN rotation (order matters)', () => {
    // Pin at left edge (0, 10) of 10x20 symbol
    // Mirror first: x = 10-0 = 10, y = 10
    // Rotate 90°: cx=5, cy=10. dx=10-5=5, dy=10-10=0
    //   px = 5 + 5*cos(90) - 0*sin(90) = 5 + 0 - 0 = 5
    //   py = 10 + 5*sin(90) + 0*cos(90) = 10 + 5 + 0 = 15
    const result = applyPinTransform(DEVICE_POS, { x: 0, y: 10 }, GEO_10x20, { rotation: 90, mirrorH: true });
    expect(result.x).toBeCloseTo(105);
    expect(result.y).toBeCloseTo(215);
  });

  it('mirror + rotation is different from rotation alone', () => {
    const pin = { x: 2, y: 5 };
    const rotOnly = applyPinTransform(DEVICE_POS, pin, GEO_10x20, { rotation: 90 });
    const mirrorAndRot = applyPinTransform(DEVICE_POS, pin, GEO_10x20, { rotation: 90, mirrorH: true });
    // These should NOT be equal — mirror changes the outcome
    expect(rotOnly.x !== mirrorAndRot.x || rotOnly.y !== mirrorAndRot.y).toBe(true);
  });

  // ── Regression: mirrorH was completely ignored before Session 39 fix ──

  it('REGRESSION: mirror actually changes pin position (not no-op)', () => {
    const pin = { x: 2, y: 5 };
    const noMirror = applyPinTransform(DEVICE_POS, pin, GEO_10x20, { rotation: 0, mirrorH: false });
    const withMirror = applyPinTransform(DEVICE_POS, pin, GEO_10x20, { rotation: 0, mirrorH: true });
    expect(noMirror.x).not.toBe(withMirror.x);
    expect(noMirror.y).toBe(withMirror.y); // Y stays the same
  });
});

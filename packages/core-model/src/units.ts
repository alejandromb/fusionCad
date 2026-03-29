/**
 * fusionCad Coordinate System — Metric (millimeters)
 *
 * All internal coordinates are in millimeters (mm).
 * Based on IEC 60617 module system: M = 2.5mm.
 *
 * The canvas renderer converts mm to screen pixels via MM_TO_PX.
 * Print/PDF output maps mm directly to paper mm (1:1 at 100% scale).
 */

/** IEC 60617 base module in mm */
export const M = 2.5;

/** Snap grid size in mm (2M) */
export const GRID_MM = 5;

/** Pin-to-pin pitch in mm (2M) */
export const PIN_PITCH_MM = 5;

/**
 * Rendering scale: screen pixels per mm at 1x zoom.
 * At this scale, the 5mm grid = 20px on screen (matching old behavior).
 */
export const MM_TO_PX = 4;

/**
 * Standard sheet sizes in mm (width × height, landscape orientation).
 */
export const SHEET_SIZES_MM: Record<string, { width: number; height: number }> = {
  'A4':      { width: 297, height: 210 },
  'A3':      { width: 420, height: 297 },
  'A2':      { width: 594, height: 420 },
  'A1':      { width: 841, height: 594 },
  'A0':      { width: 1189, height: 841 },
  'Letter':  { width: 279, height: 216 },
  'Tabloid': { width: 432, height: 279 },
  'ANSI-D':  { width: 864, height: 559 },
};

/**
 * Default ladder diagram configuration in mm.
 */
export const DEFAULT_LADDER_MM = {
  railL1X: 20,        // Left rail X (mm) — leaves 15mm for rung numbers
  railL2X: 395,       // Right rail X (mm) — 375mm ladder width, fills Tabloid page
  firstRungY: 20,     // First rung Y (mm)
  rungSpacing: 15,    // Vertical spacing between rungs (mm) — matches PLC pin spacing (15mm)
};

/**
 * Standard symbol sizes in mm (IEC proportions).
 * Height is pin-to-pin (for vertical symbols with top/bottom pins).
 */
export const SYMBOL_SIZES_MM = {
  terminal:       { width: 10, height: 10 },    // 2M × 2M hexagon
  contact:        { width: 10, height: 20 },    // 2M × 4M
  coilCircle:     { width: 10, height: 10 },    // 2M × 2M (ANSI circle)
  coilRect:       { width: 15, height: 10 },    // 3M × 2M (IEC rectangle)
  circuitBreaker: { width: 10, height: 25 },    // 2M × 5M
  fuse:           { width: 10, height: 20 },    // 2M × 4M
  overload:       { width: 10, height: 20 },    // 2M × 4M
  motor:          { width: 15, height: 15 },    // 3M × 3M circle
  pushButton:     { width: 10, height: 20 },    // 2M × 4M
  pilotLight:     { width: 10, height: 20 },    // 2M × 4M
  timer:          { width: 15, height: 10 },    // 3M × 2M (horizontal)
};

/**
 * Sheet ladder layout presets.
 * Single-column: one set of L1/L2 rails (standard).
 * Dual-column: two sets of L1/L2 rails side by side (for dense control pages).
 * Each preset defines the rail positions for a Tabloid (432×279mm) sheet.
 * For other sheet sizes, scale railL2X proportionally.
 */
export type SheetLadderLayout = 'single-column' | 'dual-column' | 'no-rungs' | 'panel-layout';

export const LADDER_LAYOUT_PRESETS: Record<Exclude<SheetLadderLayout, 'no-rungs' | 'panel-layout'>, {
  columns: Array<{ railL1X: number; railL2X: number; blockOffsetX: number }>;
}> = {
  'single-column': {
    columns: [
      { railL1X: 20, railL2X: 395, blockOffsetX: 0 },
    ],
  },
  'dual-column': {
    columns: [
      { railL1X: 15, railL2X: 195, blockOffsetX: 0 },
      { railL1X: 15, railL2X: 195, blockOffsetX: 215 },
    ],
  },
};

/**
 * Layout constants in mm.
 */
export const LAYOUT_MM = {
  borderMargin: 5,         // Sheet border inset (mm)
  titleBlockHeight: 20,    // Title block height (mm)
  titleBlockWidth: 100,    // Title block width (mm)
  rungLabelOffset: 5,      // Rung number offset left of L1 (mm)
  deviceGap: 5,            // Minimum gap between devices (mm) = 1M
};

/**
 * Convert mm to screen pixels (at 1x zoom).
 */
export function mmToPx(mm: number): number {
  return mm * MM_TO_PX;
}

/**
 * Convert screen pixels to mm (at 1x zoom).
 */
export function pxToMm(px: number): number {
  return px / MM_TO_PX;
}

/**
 * Snap a value to the mm grid.
 */
export function snapToGridMm(value: number): number {
  return Math.round(value / GRID_MM) * GRID_MM;
}

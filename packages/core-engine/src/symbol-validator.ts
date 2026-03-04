/**
 * Symbol Validation System
 *
 * Validates symbol definitions for structural issues:
 * - No geometry (empty primitives and paths)
 * - Duplicate pin IDs
 * - Empty pin ID or name
 * - Pins outside symbol bounding box
 * - Pin direction mismatches
 * - Geometry overflow (primitives outside bounds)
 * - Bounds mismatch (declared vs actual dimensions)
 * - Missing pins (informational)
 * - Large symbols (informational)
 */

import type { SymbolDefinition, SymbolPrimitive } from '@fusion-cad/core-model';

export type SymbolIssueSeverity = 'error' | 'warning' | 'info';

export interface SymbolIssue {
  id: string;
  severity: SymbolIssueSeverity;
  rule: string;
  message: string;
  pinId?: string;
  primitiveIndex?: number;
}

export interface SymbolValidationReport {
  symbolId: string;
  symbolName: string;
  issues: SymbolIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  valid: boolean; // true if errorCount === 0
}

export interface PrimitiveBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type AddIssueFn = (
  severity: SymbolIssueSeverity,
  rule: string,
  message: string,
  extra?: Partial<SymbolIssue>,
) => void;

// --- Tolerance constants ---
const PIN_BOUNDS_TOLERANCE = 5;
const GEOMETRY_OVERFLOW_TOLERANCE = 10;
const BOUNDS_MISMATCH_THRESHOLD = 0.20; // 20%
const LARGE_SYMBOL_THRESHOLD = 200;
const PIN_DIRECTION_THRESHOLD = 0.30; // 30% of dimension

/**
 * Validate a single symbol definition and return a report.
 */
export function validateSymbol(symbol: SymbolDefinition): SymbolValidationReport {
  const issues: SymbolIssue[] = [];
  let nextId = 1;

  const addIssue: AddIssueFn = (severity, rule, message, extra) => {
    issues.push({
      id: `SV-${String(nextId++).padStart(3, '0')}`,
      severity,
      rule,
      message,
      ...extra,
    });
  };

  checkNoGeometry(symbol, addIssue);
  checkDuplicatePinIds(symbol, addIssue);
  checkEmptyPinIds(symbol, addIssue);
  checkEmptyPinNames(symbol, addIssue);
  checkPinsOutsideBounds(symbol, addIssue);
  checkPinDirectionMismatch(symbol, addIssue);
  checkGeometryOverflow(symbol, addIssue);
  checkBoundsMismatch(symbol, addIssue);
  checkNoPins(symbol, addIssue);
  checkLargeSymbol(symbol, addIssue);

  return {
    symbolId: symbol.id,
    symbolName: symbol.name,
    issues,
    errorCount: issues.filter(i => i.severity === 'error').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    infoCount: issues.filter(i => i.severity === 'info').length,
    valid: issues.filter(i => i.severity === 'error').length === 0,
  };
}

/**
 * Validate an array of symbol definitions.
 */
export function validateAllSymbols(symbols: SymbolDefinition[]): SymbolValidationReport[] {
  return symbols.map(validateSymbol);
}

// --- Individual check functions ---

/**
 * Rule: no-geometry (error)
 * Symbol has no visual representation — no primitives and no SVG paths.
 */
function checkNoGeometry(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const hasPrimitives = symbol.primitives && symbol.primitives.length > 0;
  const hasPaths = symbol.paths && symbol.paths.length > 0 &&
    symbol.paths.some(p => p.d && p.d.trim().length > 0);

  if (!hasPrimitives && !hasPaths) {
    addIssue('error', 'no-geometry', `Symbol "${symbol.name}" has no geometry (no primitives or SVG paths)`);
  }
}

/**
 * Rule: duplicate-pin-id (error)
 * Two or more pins share the same ID.
 */
function checkDuplicatePinIds(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const seen = new Map<string, number>();
  for (const pin of symbol.pins) {
    if (!pin.id) continue; // handled by empty-pin-id check
    const count = (seen.get(pin.id) || 0) + 1;
    seen.set(pin.id, count);
  }

  for (const [pinId, count] of seen) {
    if (count > 1) {
      addIssue('error', 'duplicate-pin-id',
        `Pin ID "${pinId}" appears ${count} times in "${symbol.name}"`,
        { pinId });
    }
  }
}

/**
 * Rule: empty-pin-id (error)
 * Pin has missing or empty ID.
 */
function checkEmptyPinIds(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  for (let i = 0; i < symbol.pins.length; i++) {
    const pin = symbol.pins[i];
    if (!pin.id || pin.id.trim() === '') {
      addIssue('error', 'empty-pin-id',
        `Pin at index ${i} in "${symbol.name}" has an empty or missing ID`);
    }
  }
}

/**
 * Rule: empty-pin-name (error)
 * Pin has missing or empty name.
 */
function checkEmptyPinNames(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  for (const pin of symbol.pins) {
    if (!pin.name || pin.name.trim() === '') {
      addIssue('error', 'empty-pin-name',
        `Pin "${pin.id || '(no id)'}" in "${symbol.name}" has an empty or missing name`,
        { pinId: pin.id });
    }
  }
}

/**
 * Rule: pin-outside-bounds (warning)
 * Pin position is outside the symbol's declared bounding box.
 */
function checkPinsOutsideBounds(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const { width, height } = symbol.geometry;
  const tol = PIN_BOUNDS_TOLERANCE;

  for (const pin of symbol.pins) {
    const { x, y } = pin.position;
    if (x < -tol || x > width + tol || y < -tol || y > height + tol) {
      addIssue('warning', 'pin-outside-bounds',
        `Pin "${pin.id}" at (${x}, ${y}) is outside bounds (${width}x${height}) in "${symbol.name}"`,
        { pinId: pin.id });
    }
  }
}

/**
 * Rule: pin-direction-mismatch (warning)
 * Pin's declared direction doesn't match its edge position.
 * E.g., a pin marked "top" should be in the top portion of the symbol.
 */
function checkPinDirectionMismatch(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const { width, height } = symbol.geometry;
  const threshold = PIN_DIRECTION_THRESHOLD;

  for (const pin of symbol.pins) {
    const { x, y } = pin.position;
    let mismatch = false;

    switch (pin.direction) {
      case 'top':
        mismatch = y > height * threshold;
        break;
      case 'bottom':
        mismatch = y < height * (1 - threshold);
        break;
      case 'left':
        mismatch = x > width * threshold;
        break;
      case 'right':
        mismatch = x < width * (1 - threshold);
        break;
    }

    if (mismatch) {
      addIssue('warning', 'pin-direction-mismatch',
        `Pin "${pin.id}" direction is "${pin.direction}" but position (${x}, ${y}) suggests otherwise in "${symbol.name}"`,
        { pinId: pin.id });
    }
  }
}

/**
 * Rule: geometry-overflow (warning)
 * Primitives extend significantly outside the declared bounding box.
 */
function checkGeometryOverflow(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const bounds = computePrimitiveBounds(symbol.primitives || []);
  if (!bounds) return;

  const { width, height } = symbol.geometry;
  const tol = GEOMETRY_OVERFLOW_TOLERANCE;

  if (bounds.minX < -tol || bounds.minY < -tol ||
      bounds.maxX > width + tol || bounds.maxY > height + tol) {
    addIssue('warning', 'geometry-overflow',
      `Primitives extend outside declared bounds (${width}x${height}) in "${symbol.name}": ` +
      `actual range x=[${bounds.minX.toFixed(1)}, ${bounds.maxX.toFixed(1)}] y=[${bounds.minY.toFixed(1)}, ${bounds.maxY.toFixed(1)}]`);
  }
}

/**
 * Rule: bounds-mismatch (warning)
 * Declared width/height significantly differs from actual geometry bounds.
 */
function checkBoundsMismatch(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const bounds = computePrimitiveBounds(symbol.primitives || []);
  if (!bounds) return;

  const { width, height } = symbol.geometry;
  const actualWidth = bounds.maxX - Math.min(0, bounds.minX);
  const actualHeight = bounds.maxY - Math.min(0, bounds.minY);

  // Only flag if the declared dimension differs by more than threshold
  if (width > 0 && Math.abs(actualWidth - width) / width > BOUNDS_MISMATCH_THRESHOLD) {
    addIssue('warning', 'bounds-mismatch',
      `Declared width ${width} but actual geometry width is ~${actualWidth.toFixed(1)} in "${symbol.name}"`);
  }
  if (height > 0 && Math.abs(actualHeight - height) / height > BOUNDS_MISMATCH_THRESHOLD) {
    addIssue('warning', 'bounds-mismatch',
      `Declared height ${height} but actual geometry height is ~${actualHeight.toFixed(1)} in "${symbol.name}"`);
  }
}

/**
 * Rule: no-pins (info)
 * Symbol has zero pins. May be intentional for annotations/decorative elements.
 */
function checkNoPins(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  if (symbol.pins.length === 0) {
    addIssue('info', 'no-pins', `Symbol "${symbol.name}" has no pins`);
  }
}

/**
 * Rule: large-symbol (info)
 * Symbol exceeds 200px in any dimension.
 */
function checkLargeSymbol(symbol: SymbolDefinition, addIssue: AddIssueFn): void {
  const { width, height } = symbol.geometry;
  if (width > LARGE_SYMBOL_THRESHOLD || height > LARGE_SYMBOL_THRESHOLD) {
    addIssue('info', 'large-symbol',
      `Symbol "${symbol.name}" is large (${width}x${height}px)`);
  }
}

// --- Helpers ---

/**
 * Compute the actual bounding box of all primitives.
 * Skips text primitives (font metrics unavailable) and path primitives
 * (SVG path parsing out of scope).
 * Returns null if no computable primitives exist.
 */
export function computePrimitiveBounds(primitives: SymbolPrimitive[]): PrimitiveBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasData = false;

  for (const p of primitives) {
    switch (p.type) {
      case 'line': {
        minX = Math.min(minX, p.x1, p.x2);
        minY = Math.min(minY, p.y1, p.y2);
        maxX = Math.max(maxX, p.x1, p.x2);
        maxY = Math.max(maxY, p.y1, p.y2);
        hasData = true;
        break;
      }
      case 'rect': {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.width);
        maxY = Math.max(maxY, p.y + p.height);
        hasData = true;
        break;
      }
      case 'circle': {
        minX = Math.min(minX, p.cx - p.r);
        minY = Math.min(minY, p.cy - p.r);
        maxX = Math.max(maxX, p.cx + p.r);
        maxY = Math.max(maxY, p.cy + p.r);
        hasData = true;
        break;
      }
      case 'arc': {
        // Conservative: use full circle bounds
        minX = Math.min(minX, p.cx - p.r);
        minY = Math.min(minY, p.cy - p.r);
        maxX = Math.max(maxX, p.cx + p.r);
        maxY = Math.max(maxY, p.cy + p.r);
        hasData = true;
        break;
      }
      case 'ellipse': {
        minX = Math.min(minX, p.cx - p.rx);
        minY = Math.min(minY, p.cy - p.ry);
        maxX = Math.max(maxX, p.cx + p.rx);
        maxY = Math.max(maxY, p.cy + p.ry);
        hasData = true;
        break;
      }
      case 'polyline': {
        for (const pt of p.points) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
        if (p.points.length > 0) hasData = true;
        break;
      }
      // text: skip — font metrics unavailable in Node
      // path: skip — SVG path parsing out of scope
    }
  }

  return hasData ? { minX, minY, maxX, maxY } : null;
}

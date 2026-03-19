/**
 * Fix all symbol pin positions to be grid-aligned (multiples of 20px).
 *
 * Strategy:
 * - Round each pin position to nearest multiple of GRID (20)
 * - Scale all primitives proportionally to fit the new pin bounds
 * - Preserve visual centering by using the pin positions as anchor points
 */

import { readFileSync, writeFileSync } from 'fs';

const GRID = 20;
const INPUT_FILE = 'packages/core-model/src/symbols/builtin-symbols.json';

const data = JSON.parse(readFileSync(INPUT_FILE, 'utf8'));
const symbols = data.symbols;

function roundToGrid(val) {
  return Math.round(val / GRID) * GRID;
}

function transformSymbol(sym) {
  // Skip panel symbols and symbols with no pins
  if (sym.id.startsWith('panel-') || sym.pins.length === 0) return sym;

  const oldPins = sym.pins.map(p => ({ id: p.id, x: p.x, y: p.y }));

  // Check if already grid-aligned
  const allAligned = oldPins.every(p => p.x % GRID === 0 && p.y % GRID === 0);
  if (allAligned) return sym;

  // Compute new pin positions (round to nearest grid)
  const newPins = oldPins.map(p => ({
    id: p.id,
    x: roundToGrid(p.x),
    y: roundToGrid(p.y),
  }));

  // Compute old and new bounding boxes from pins
  const oldMinX = Math.min(...oldPins.map(p => p.x));
  const oldMaxX = Math.max(...oldPins.map(p => p.x));
  const oldMinY = Math.min(...oldPins.map(p => p.y));
  const oldMaxY = Math.max(...oldPins.map(p => p.y));

  const newMinX = Math.min(...newPins.map(p => p.x));
  const newMaxX = Math.max(...newPins.map(p => p.x));
  const newMinY = Math.min(...newPins.map(p => p.y));
  const newMaxY = Math.max(...newPins.map(p => p.y));

  // For symbols where all pins are at same X or Y (e.g., motors with all pins at y=0),
  // only transform the axis that has pin spread
  const oldRangeX = oldMaxX - oldMinX;
  const oldRangeY = oldMaxY - oldMinY;
  const newRangeX = newMaxX - newMinX;
  const newRangeY = newMaxY - newMinY;

  // Transform function: maps old coordinate to new coordinate
  // Uses pin positions as anchor points, scales everything else proportionally
  function transformX(x) {
    if (oldRangeX === 0) {
      // All pins at same X — just shift by the difference
      const dx = newPins[0].x - oldPins[0].x;
      return x + dx;
    }
    // Linear interpolation from old range to new range
    const t = (x - oldMinX) / oldRangeX;
    return newMinX + t * newRangeX;
  }

  function transformY(y) {
    if (oldRangeY === 0) {
      const dy = newPins[0].y - oldPins[0].y;
      return y + dy;
    }
    const t = (y - oldMinY) / oldRangeY;
    return newMinY + t * newRangeY;
  }

  // Round to 1 decimal for clean JSON
  function r(v) { return Math.round(v * 10) / 10; }

  // Update pin positions
  const updatedPins = sym.pins.map((p, i) => ({
    ...p,
    x: newPins[i].x,
    y: newPins[i].y,
    position: p.position ? { x: newPins[i].x, y: newPins[i].y } : undefined,
  }));

  // Transform primitives
  const updatedPrimitives = (sym.primitives || []).map(prim => {
    const p = { ...prim };
    switch (p.type) {
      case 'line':
        p.x1 = r(transformX(prim.x1));
        p.y1 = r(transformY(prim.y1));
        p.x2 = r(transformX(prim.x2));
        p.y2 = r(transformY(prim.y2));
        break;
      case 'rect':
        p.x = r(transformX(prim.x));
        p.y = r(transformY(prim.y));
        // Width and height scale proportionally
        if (oldRangeX > 0) {
          p.width = r(prim.width * (newRangeX / oldRangeX));
        }
        if (oldRangeY > 0) {
          p.height = r(prim.height * (newRangeY / oldRangeY));
        }
        break;
      case 'circle':
        p.cx = r(transformX(prim.cx));
        p.cy = r(transformY(prim.cy));
        // Scale radius by average of X and Y scale
        const scaleX = oldRangeX > 0 ? newRangeX / oldRangeX : 1;
        const scaleY = oldRangeY > 0 ? newRangeY / oldRangeY : 1;
        p.r = r(prim.r * Math.min(scaleX, scaleY));
        break;
      case 'polyline':
        p.points = prim.points.map(pt => ({
          x: r(transformX(pt.x)),
          y: r(transformY(pt.y)),
        }));
        break;
      case 'arc':
        p.cx = r(transformX(prim.cx));
        p.cy = r(transformY(prim.cy));
        const arcScaleX = oldRangeX > 0 ? newRangeX / oldRangeX : 1;
        const arcScaleY = oldRangeY > 0 ? newRangeY / oldRangeY : 1;
        p.r = r(prim.r * Math.min(arcScaleX, arcScaleY));
        break;
      case 'text':
        p.x = r(transformX(prim.x));
        p.y = r(transformY(prim.y));
        break;
    }
    return p;
  });

  // Compute new width/height from all coordinates
  const allXs = [];
  const allYs = [];
  for (const p of updatedPins) {
    allXs.push(p.x);
    allYs.push(p.y);
  }
  for (const prim of updatedPrimitives) {
    switch (prim.type) {
      case 'line':
        allXs.push(prim.x1, prim.x2);
        allYs.push(prim.y1, prim.y2);
        break;
      case 'rect':
        allXs.push(prim.x, prim.x + prim.width);
        allYs.push(prim.y, prim.y + prim.height);
        break;
      case 'circle':
        allXs.push(prim.cx - prim.r, prim.cx + prim.r);
        allYs.push(prim.cy - prim.r, prim.cy + prim.r);
        break;
      case 'polyline':
        for (const pt of prim.points) {
          allXs.push(pt.x);
          allYs.push(pt.y);
        }
        break;
      case 'arc':
        allXs.push(prim.cx - prim.r, prim.cx + prim.r);
        allYs.push(prim.cy - prim.r, prim.cy + prim.r);
        break;
      case 'text':
        allXs.push(prim.x);
        allYs.push(prim.y);
        break;
    }
  }

  const minX = Math.min(...allXs);
  const maxX = Math.max(...allXs);
  const minY = Math.min(...allYs);
  const maxY = Math.max(...allYs);

  // New width/height: ensure pins are within bounds
  const newWidth = Math.max(roundToGrid(Math.ceil(maxX)), ...updatedPins.map(p => p.x));
  const newHeight = Math.max(roundToGrid(Math.ceil(maxY)), ...updatedPins.map(p => p.y));

  return {
    ...sym,
    width: newWidth,
    height: newHeight,
    pins: updatedPins,
    primitives: updatedPrimitives,
  };
}

// Special handling for junction (needs pin at center, grid-aligned)
function fixJunction(sym) {
  if (sym.id !== 'junction') return sym;
  // Make junction 12x12 with pin at (0, 0)
  // The renderer draws a dot at the pin position
  return {
    ...sym,
    width: 12,
    height: 12,
    pins: [{
      ...sym.pins[0],
      x: 0,
      y: 0,
      position: { x: 0, y: 0 },
    }],
    primitives: sym.primitives.map(p => {
      if (p.type === 'circle') {
        return { ...p, cx: 0, cy: 0, r: 6 };
      }
      return p;
    }),
  };
}

// Process all symbols
let fixedCount = 0;
const results = [];

for (let i = 0; i < symbols.length; i++) {
  let sym = symbols[i];

  if (sym.id === 'junction') {
    sym = fixJunction(sym);
  } else {
    const before = JSON.stringify(sym.pins);
    sym = transformSymbol(sym);
    if (JSON.stringify(sym.pins) !== before) {
      fixedCount++;
      const oldPins = JSON.parse(before);
      console.log(`Fixed: ${sym.id} (${symbols[i].width}x${symbols[i].height} → ${sym.width}x${sym.height})`);
      for (let j = 0; j < sym.pins.length; j++) {
        const op = oldPins[j];
        const np = sym.pins[j];
        if (op.x !== np.x || op.y !== np.y) {
          console.log(`  pin ${np.id}: (${op.x},${op.y}) → (${np.x},${np.y})`);
        }
      }
    }
  }
  results.push(sym);
}

// Verify all pins are now grid-aligned
let remainingIssues = 0;
for (const sym of results) {
  for (const pin of sym.pins) {
    if (pin.x % GRID !== 0 || pin.y % GRID !== 0) {
      console.log(`STILL OFF-GRID: ${sym.id} pin ${pin.id}: (${pin.x}, ${pin.y})`);
      remainingIssues++;
    }
  }
}

console.log(`\nFixed ${fixedCount} symbols. Remaining issues: ${remainingIssues}`);

// Write output
data.symbols = results;
writeFileSync(INPUT_FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nWritten to ${INPUT_FILE}`);

/**
 * Scale all symbols in builtin-symbols.json by a given factor.
 *
 * What gets scaled (spatial coordinates):
 *   - Symbol geometry: width, height
 *   - Pin positions: x, y
 *   - Primitive coordinates: all x, y, x1, y1, x2, y2, cx, cy, width, height
 *   - Circle/arc radius: r
 *   - Polyline points: x, y
 *
 * What does NOT get scaled (visual properties):
 *   - Stroke widths (strokeWidth)
 *   - Dash patterns (strokeDash)
 *   - Arc angles (startAngle, endAngle)
 *   - Text content
 *   - Fill colors
 *   - Font weight
 *   - Text anchor
 *   - Boolean flags (closed, dashed)
 *
 * What gets scaled carefully:
 *   - fontSize: scaled proportionally
 *   - All coordinates rounded to nearest integer (avoids sub-pixel rendering)
 *
 * Usage: node scripts/scale-symbols.mjs [scale-factor]
 *   Default scale factor: 1.5
 *   Creates a backup before modifying.
 */

import fs from 'fs';
import path from 'path';

const SCALE = parseFloat(process.argv[2]) || 1.5;
const SYMBOLS_PATH = 'packages/core-model/src/symbols/builtin-symbols.json';
const BACKUP_PATH = SYMBOLS_PATH.replace('.json', `.backup-${Date.now()}.json`);

console.log(`Scaling all symbols by ${SCALE}x`);
console.log(`Source: ${SYMBOLS_PATH}`);
console.log(`Backup: ${BACKUP_PATH}`);

// Read and backup
const raw = fs.readFileSync(SYMBOLS_PATH, 'utf8');
fs.writeFileSync(BACKUP_PATH, raw);
console.log('Backup created.');

const data = JSON.parse(raw);

function round(n) {
  return Math.round(n);
}

function scaleCoord(n) {
  return round(n * SCALE);
}

function scalePrimitive(p) {
  const scaled = { ...p };

  switch (p.type) {
    case 'line':
      scaled.x1 = scaleCoord(p.x1);
      scaled.y1 = scaleCoord(p.y1);
      scaled.x2 = scaleCoord(p.x2);
      scaled.y2 = scaleCoord(p.y2);
      break;

    case 'rect':
      scaled.x = scaleCoord(p.x);
      scaled.y = scaleCoord(p.y);
      scaled.width = scaleCoord(p.width);
      scaled.height = scaleCoord(p.height);
      if (p.rx !== undefined) scaled.rx = scaleCoord(p.rx);
      break;

    case 'circle':
      scaled.cx = scaleCoord(p.cx);
      scaled.cy = scaleCoord(p.cy);
      scaled.r = scaleCoord(p.r);
      break;

    case 'arc':
      scaled.cx = scaleCoord(p.cx);
      scaled.cy = scaleCoord(p.cy);
      scaled.r = scaleCoord(p.r);
      // Angles do NOT scale — they're in radians, not spatial
      break;

    case 'polyline':
      scaled.points = p.points.map(pt => ({
        x: scaleCoord(pt.x),
        y: scaleCoord(pt.y),
      }));
      break;

    case 'text':
      scaled.x = scaleCoord(p.x);
      scaled.y = scaleCoord(p.y);
      if (p.fontSize !== undefined) {
        scaled.fontSize = round(p.fontSize * SCALE);
      }
      break;

    default:
      console.warn(`  Unknown primitive type: ${p.type} — copying as-is`);
  }

  return scaled;
}

let symbolCount = 0;
let pinCount = 0;
let primitiveCount = 0;

for (const sym of data.symbols) {
  // Scale geometry
  sym.width = scaleCoord(sym.width);
  sym.height = scaleCoord(sym.height);

  // Scale pins
  for (const pin of sym.pins) {
    pin.x = scaleCoord(pin.x);
    pin.y = scaleCoord(pin.y);
    pinCount++;
  }

  // Scale primitives
  if (sym.primitives) {
    sym.primitives = sym.primitives.map(p => {
      primitiveCount++;
      return scalePrimitive(p);
    });
  }

  symbolCount++;
}

// Write back
fs.writeFileSync(SYMBOLS_PATH, JSON.stringify(data, null, 2) + '\n');

console.log(`\nDone!`);
console.log(`  Symbols scaled: ${symbolCount}`);
console.log(`  Pins scaled: ${pinCount}`);
console.log(`  Primitives scaled: ${primitiveCount}`);
console.log(`  Scale factor: ${SCALE}x`);
console.log(`\nVerify with: npm run symbols:refresh`);
console.log(`Revert with: cp ${BACKUP_PATH} ${SYMBOLS_PATH}`);

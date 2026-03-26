#!/usr/bin/env node
/**
 * Convert builtin-symbols.json from px coordinates to mm.
 *
 * All symbol geometry (width, height, pin positions, primitives) was originally
 * authored in pixel units. The canvas renderer applies ctx.scale(zoom * MM_TO_PX)
 * treating everything as mm, so px values were being interpreted as mm — making
 * symbols ~4x too large in world space.
 *
 * This script divides all geometric values by MM_TO_PX (4) to produce correct mm values.
 *
 * Panel-category symbols are skipped — they use physical mm for layout.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MM_TO_PX = 4;
const INPUT = resolve(__dirname, '../packages/core-model/src/symbols/builtin-symbols.json');

const round = (v, decimals = 2) => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

const s = (v) => round(v / MM_TO_PX);

function scalePrimitive(p) {
  const scaled = { ...p };
  switch (p.type) {
    case 'line':
      scaled.x1 = s(p.x1);
      scaled.y1 = s(p.y1);
      scaled.x2 = s(p.x2);
      scaled.y2 = s(p.y2);
      break;
    case 'rect':
      scaled.x = s(p.x);
      scaled.y = s(p.y);
      scaled.width = s(p.width);
      scaled.height = s(p.height);
      if (p.rx != null) scaled.rx = s(p.rx);
      break;
    case 'circle':
      scaled.cx = s(p.cx);
      scaled.cy = s(p.cy);
      scaled.r = s(p.r);
      break;
    case 'arc':
      scaled.cx = s(p.cx);
      scaled.cy = s(p.cy);
      scaled.r = s(p.r);
      // startAngle/endAngle are radians — don't scale
      break;
    case 'ellipse':
      scaled.cx = s(p.cx);
      scaled.cy = s(p.cy);
      scaled.rx = s(p.rx);
      scaled.ry = s(p.ry);
      break;
    case 'polyline':
      scaled.points = p.points.map(pt => ({ x: s(pt.x), y: s(pt.y) }));
      break;
    case 'text':
      scaled.x = s(p.x);
      scaled.y = s(p.y);
      if (p.fontSize != null) scaled.fontSize = s(p.fontSize);
      break;
    case 'path':
      // SVG path data needs special parsing — skip for now (none exist in current data)
      break;
  }
  // Scale strokeWidth and dash patterns
  if (p.strokeWidth != null) scaled.strokeWidth = s(p.strokeWidth);
  if (p.strokeDash != null) scaled.strokeDash = p.strokeDash.map(v => s(v));
  return scaled;
}

function scaleSymbol(sym) {
  const scaled = { ...sym };
  scaled.width = s(sym.width);
  scaled.height = s(sym.height);

  // Scale pins
  scaled.pins = sym.pins.map(pin => ({
    ...pin,
    x: s(pin.x),
    y: s(pin.y),
  }));

  // Scale primitives
  if (sym.primitives) {
    scaled.primitives = sym.primitives.map(scalePrimitive);
  }

  // Scale texts
  if (sym.texts) {
    scaled.texts = sym.texts.map(t => ({
      ...t,
      x: s(t.x),
      y: s(t.y),
      fontSize: t.fontSize != null ? s(t.fontSize) : undefined,
    }));
  }

  return scaled;
}

// --- Main ---
const data = JSON.parse(readFileSync(INPUT, 'utf-8'));
console.log(`Loaded ${data.symbols.length} symbols`);

let converted = 0;
let skipped = 0;

const SKIP_CATEGORIES = new Set(['Panel']);

data.symbols = data.symbols.map(sym => {
  if (SKIP_CATEGORIES.has(sym.category)) {
    skipped++;
    console.log(`  SKIP (${sym.category}): ${sym.id} — ${sym.width}x${sym.height}`);
    return sym;
  }
  const scaled = scaleSymbol(sym);
  converted++;
  console.log(`  ${sym.id}: ${sym.width}x${sym.height} px → ${scaled.width}x${scaled.height} mm`);
  return scaled;
});

// Bump version to indicate mm units
data.version = '3.0-mm';

writeFileSync(INPUT, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`\nDone: ${converted} converted, ${skipped} skipped (Panel)`);
console.log(`Output: ${INPUT}`);

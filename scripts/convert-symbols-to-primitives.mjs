#!/usr/bin/env node
/**
 * One-time conversion script: adds `primitives` arrays to builtin-symbols.json
 *
 * Strategy:
 * 1. Parse each symbol's svgPath string
 * 2. Convert each sub-path (separated by M commands) into a primitive:
 *    - 4-point closed path with only H/V moves → rect
 *    - Full-circle arc (two A commands) → circle
 *    - Sequence of L/H/V commands → polyline
 *    - Anything with curves (C, Q, A partial) → { type: 'path', d: ... } fallback
 * 3. Write primitives array into each symbol JSON entry
 * 4. Keep svgPath for backward compat
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYMBOLS_PATH = resolve(__dirname, '../packages/core-model/src/symbols/builtin-symbols.json');

// ---------------------------------------------------------------------------
// SVG Path Tokenizer
// ---------------------------------------------------------------------------

function tokenizePath(d) {
  const tokens = [];
  const re = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = re.exec(d)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

function isCommand(token) {
  return /^[a-zA-Z]$/.test(token) && token !== 'e' && token !== 'E';
}

// ---------------------------------------------------------------------------
// Parse SVG path into sub-paths (each starting with M/m)
// ---------------------------------------------------------------------------

/**
 * Parse an SVG path string into an array of sub-path objects.
 * Each sub-path has: { commands: [{cmd, args}], startX, startY }
 */
function parseSubPaths(d) {
  const tokens = tokenizePath(d);
  const subPaths = [];
  let currentSub = null;
  let cmd = '';
  let currentX = 0, currentY = 0;
  let startX = 0, startY = 0;
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (isCommand(tok)) {
      cmd = tok;
      const upper = cmd.toUpperCase();

      if (upper === 'M') {
        // Start new sub-path
        if (currentSub && currentSub.commands.length > 0) {
          subPaths.push(currentSub);
        }
        currentSub = { commands: [], points: [], closed: false, hasArcs: false, hasCurves: false };
        i++;

        // Read the moveto coordinates
        if (i < tokens.length && !isCommand(tokens[i])) {
          const x = parseFloat(tokens[i]);
          const y = parseFloat(tokens[i + 1] || '0');
          if (cmd === 'm' && subPaths.length > 0) {
            currentX += x;
            currentY += y;
          } else {
            currentX = x;
            currentY = y;
          }
          startX = currentX;
          startY = currentY;
          currentSub.startX = currentX;
          currentSub.startY = currentY;
          currentSub.points.push({ x: currentX, y: currentY });
          currentSub.commands.push({ cmd: 'M', x: currentX, y: currentY });
          i += 2;

          // Implicit L commands after M
          while (i < tokens.length && !isCommand(tokens[i])) {
            const lx = parseFloat(tokens[i]);
            const ly = parseFloat(tokens[i + 1] || '0');
            if (cmd === 'm') {
              currentX += lx;
              currentY += ly;
            } else {
              currentX = lx;
              currentY = ly;
            }
            currentSub.points.push({ x: currentX, y: currentY });
            currentSub.commands.push({ cmd: 'L', x: currentX, y: currentY });
            i += 2;
          }
        }
        continue;
      }

      if (upper === 'Z') {
        if (currentSub) {
          currentSub.closed = true;
          currentSub.commands.push({ cmd: 'Z' });
        }
        currentX = startX;
        currentY = startY;
        i++;
        continue;
      }

      i++;
      continue;
    }

    // Numeric value - interpret based on current command
    if (!currentSub) {
      currentSub = { commands: [], points: [], closed: false, hasArcs: false, hasCurves: false };
    }

    const upper = cmd.toUpperCase();
    const isRel = cmd === cmd.toLowerCase();

    switch (upper) {
      case 'L': {
        const x = parseFloat(tok);
        const y = parseFloat(tokens[i + 1] || '0');
        if (isRel) { currentX += x; currentY += y; }
        else { currentX = x; currentY = y; }
        currentSub.points.push({ x: currentX, y: currentY });
        currentSub.commands.push({ cmd: 'L', x: currentX, y: currentY });
        i += 2;
        break;
      }
      case 'H': {
        const x = parseFloat(tok);
        if (isRel) { currentX += x; } else { currentX = x; }
        currentSub.points.push({ x: currentX, y: currentY });
        currentSub.commands.push({ cmd: 'L', x: currentX, y: currentY });
        i++;
        break;
      }
      case 'V': {
        const y = parseFloat(tok);
        if (isRel) { currentY += y; } else { currentY = y; }
        currentSub.points.push({ x: currentX, y: currentY });
        currentSub.commands.push({ cmd: 'L', x: currentX, y: currentY });
        i++;
        break;
      }
      case 'A': {
        currentSub.hasArcs = true;
        // Skip arc - 7 values: rx ry rot largeArc sweep x y
        const rx = parseFloat(tok);
        const ry = parseFloat(tokens[i + 1] || '0');
        // skip rot, largeArc, sweep
        let endX = parseFloat(tokens[i + 5] || '0');
        let endY = parseFloat(tokens[i + 6] || '0');
        if (isRel) { endX += currentX; endY += currentY; }
        currentX = endX;
        currentY = endY;
        currentSub.commands.push({ cmd: 'A', rx, ry, x: currentX, y: currentY });
        i += 7;
        break;
      }
      case 'C': {
        currentSub.hasCurves = true;
        let x1 = parseFloat(tok);
        let y1 = parseFloat(tokens[i+1]||'0');
        let x2 = parseFloat(tokens[i+2]||'0');
        let y2 = parseFloat(tokens[i+3]||'0');
        let x = parseFloat(tokens[i+4]||'0');
        let y = parseFloat(tokens[i+5]||'0');
        if (isRel) { x1+=currentX; y1+=currentY; x2+=currentX; y2+=currentY; x+=currentX; y+=currentY; }
        currentX = x; currentY = y;
        currentSub.commands.push({ cmd: 'C', x: currentX, y: currentY });
        i += 6;
        break;
      }
      case 'Q': {
        currentSub.hasCurves = true;
        let x1 = parseFloat(tok);
        let y1 = parseFloat(tokens[i+1]||'0');
        let x = parseFloat(tokens[i+2]||'0');
        let y = parseFloat(tokens[i+3]||'0');
        if (isRel) { x1+=currentX; y1+=currentY; x+=currentX; y+=currentY; }
        currentX = x; currentY = y;
        currentSub.commands.push({ cmd: 'Q', x: currentX, y: currentY });
        i += 4;
        break;
      }
      default: {
        i++;
        break;
      }
    }
  }

  if (currentSub && currentSub.commands.length > 0) {
    subPaths.push(currentSub);
  }

  return subPaths;
}

// ---------------------------------------------------------------------------
// Sub-path → Primitive conversion
// ---------------------------------------------------------------------------

function r(n) {
  return Math.round(n * 100) / 100;
}

function subPathToPrimitive(sub) {
  // If it has curves or arcs, fall back to path
  if (sub.hasCurves || sub.hasArcs) {
    return null; // Will use fallback
  }

  const pts = sub.points;
  if (pts.length < 2) return null;

  // Check if it's a rectangle (4 points, closed, only axis-aligned moves)
  if (sub.closed && pts.length === 4) {
    const isAxisAligned = pts.every((p, idx) => {
      if (idx === 0) return true;
      const prev = pts[idx - 1];
      return p.x === prev.x || p.y === prev.y;
    });
    // Also check the closing edge
    const closingAligned = pts[3].x === pts[0].x || pts[3].y === pts[0].y;

    if (isAxisAligned && closingAligned) {
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const w = maxX - minX;
      const h = maxY - minY;
      if (w > 0 && h > 0) {
        return { type: 'rect', x: r(minX), y: r(minY), width: r(w), height: r(h) };
      }
    }
  }

  // Simple 2-point line
  if (pts.length === 2 && !sub.closed) {
    return {
      type: 'line',
      x1: r(pts[0].x), y1: r(pts[0].y),
      x2: r(pts[1].x), y2: r(pts[1].y),
    };
  }

  // Polyline (3+ points or 2 points closed)
  return {
    type: 'polyline',
    points: pts.map(p => ({ x: r(p.x), y: r(p.y) })),
    ...(sub.closed ? { closed: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Convert a full svgPath to primitives
// ---------------------------------------------------------------------------

function svgPathToPrimitives(svgPath) {
  if (!svgPath || !svgPath.trim()) return [];

  const subPaths = parseSubPaths(svgPath);
  const primitives = [];

  for (const sub of subPaths) {
    const prim = subPathToPrimitive(sub);
    if (prim) {
      primitives.push(prim);
    } else {
      // Rebuild the sub-path d string from the original
      // For complex sub-paths (curves, arcs), use path fallback
      // We extract the relevant portion from the original string
      primitives.push({ type: 'path', d: svgPath });
      // If any sub-path can't be converted, fall back the whole path
      return [{ type: 'path', d: svgPath }];
    }
  }

  return primitives;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const json = JSON.parse(readFileSync(SYMBOLS_PATH, 'utf-8'));

let converted = 0;
let fallback = 0;

for (const symbol of json.symbols) {
  const primitives = svgPathToPrimitives(symbol.svgPath);
  symbol.primitives = primitives;

  const hasFallback = primitives.some(p => p.type === 'path');
  if (hasFallback) {
    fallback++;
  } else {
    converted++;
  }
}

writeFileSync(SYMBOLS_PATH, JSON.stringify(json, null, 2) + '\n');

console.log(`Done! ${json.symbols.length} symbols processed.`);
console.log(`  ${converted} fully converted to typed primitives`);
console.log(`  ${fallback} using path fallback (curves/arcs)`);

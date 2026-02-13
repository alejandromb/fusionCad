/**
 * Symbol rendering system
 *
 * Draw functions are registered per category. Symbol metadata (dimensions, pins)
 * comes from the core-model symbol library. Adding a new symbol requires:
 *   1. A SymbolDefinition in core-model (iec-symbols.ts or user-defined)
 *   2. Optionally, a draw function registered here (falls back to generic rectangle)
 *
 * TODO: Polish symbols to match IEC 60617 standards (Phase 4 - Symbol Library)
 * - Contactor: proper coil rectangle with diagonal line
 * - Pushbutton: contact lines with actuator symbol (NO vs NC distinction)
 * - Overload: thermal element per IEC standard
 * - Terminal: cleaner connection point representation
 * - Power supply: standardized DC supply symbol
 * Reference: https://library.iec.ch/iec60617
 */

import type { SymbolDefinition, SymbolPath, SymbolText, SymbolPrimitive } from '@fusion-cad/core-model';
import { getSymbolDefinition, getSymbolById } from '@fusion-cad/core-model';
import type { SymbolGeometry, DeviceTransform } from './types';
import { transformPinPosition } from './types';
import { getTheme } from './theme';

/**
 * Look up a symbol by ID first, then fall back to category lookup.
 * This allows using symbol IDs (e.g., 'iec-power-supply') directly.
 */
function lookupSymbol(idOrCategory: string): SymbolDefinition | undefined {
  // Try by ID first (new behavior)
  const byId = getSymbolById(idOrCategory);
  if (byId) return byId;
  // Fall back to category lookup (backward compat)
  return getSymbolDefinition(idOrCategory);
}

// ---------------------------------------------------------------------------
// SVG Path Parser and Renderer
// ---------------------------------------------------------------------------

interface PathCommand {
  type: string;
  args: number[];
}

/**
 * Parse SVG path data string into commands.
 * Supports: M, L, H, V, A, C, Q, Z (uppercase = absolute, lowercase = relative)
 */
function parseSVGPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // Match command letter followed by optional numbers (with commas/spaces)
  const regex = /([MmLlHhVvAaCcQqZz])([^MmLlHhVvAaCcQqZz]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();

    let args: number[] = [];
    if (argsStr) {
      // Parse numbers, handling negative signs and decimals
      args = argsStr
        .replace(/,/g, ' ')
        .replace(/-/g, ' -')
        .split(/\s+/)
        .filter((s) => s.length > 0)
        .map(parseFloat);
    }

    commands.push({ type, args });
  }

  return commands;
}

/**
 * Render parsed SVG path commands to canvas context.
 */
function renderPathCommands(
  ctx: CanvasRenderingContext2D,
  commands: PathCommand[],
  offsetX: number,
  offsetY: number
): void {
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  ctx.beginPath();

  for (const cmd of commands) {
    const { type, args } = cmd;
    const isRelative = type === type.toLowerCase();
    const cmdUpper = type.toUpperCase();

    switch (cmdUpper) {
      case 'M': {
        // Move to
        if (isRelative) {
          currentX += args[0];
          currentY += args[1];
        } else {
          currentX = args[0];
          currentY = args[1];
        }
        startX = currentX;
        startY = currentY;
        ctx.moveTo(offsetX + currentX, offsetY + currentY);

        // Subsequent pairs are implicit line-to commands
        for (let i = 2; i < args.length; i += 2) {
          if (isRelative) {
            currentX += args[i];
            currentY += args[i + 1];
          } else {
            currentX = args[i];
            currentY = args[i + 1];
          }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }

      case 'L': {
        // Line to
        for (let i = 0; i < args.length; i += 2) {
          if (isRelative) {
            currentX += args[i];
            currentY += args[i + 1];
          } else {
            currentX = args[i];
            currentY = args[i + 1];
          }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }

      case 'H': {
        // Horizontal line
        for (const arg of args) {
          if (isRelative) {
            currentX += arg;
          } else {
            currentX = arg;
          }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }

      case 'V': {
        // Vertical line
        for (const arg of args) {
          if (isRelative) {
            currentY += arg;
          } else {
            currentY = arg;
          }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }

      case 'A': {
        // Arc: rx ry x-axis-rotation large-arc-flag sweep-flag x y
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          // const rotation = args[i + 2]; // x-axis rotation (not used for circles)
          const largeArc = args[i + 3];
          const sweep = args[i + 4];
          let endX = args[i + 5];
          let endY = args[i + 6];

          if (isRelative) {
            endX = currentX + endX;
            endY = currentY + endY;
          }

          // Convert SVG arc to canvas arc
          // For circles (rx === ry), we can use ctx.arc
          if (rx === ry) {
            const radius = rx;
            // Calculate center of the arc
            const { cx, cy, startAngle, endAngle } = svgArcToCanvasArc(
              currentX,
              currentY,
              endX,
              endY,
              radius,
              largeArc === 1,
              sweep === 1
            );
            const anticlockwise = sweep === 0;
            ctx.arc(
              offsetX + cx,
              offsetY + cy,
              radius,
              startAngle,
              endAngle,
              anticlockwise
            );
          } else {
            // Elliptical arc - use ellipse or approximate with beziers
            // For now, just draw a line (simplified)
            ctx.lineTo(offsetX + endX, offsetY + endY);
          }

          currentX = endX;
          currentY = endY;
        }
        break;
      }

      case 'C': {
        // Cubic bezier: x1 y1 x2 y2 x y
        for (let i = 0; i < args.length; i += 6) {
          let x1 = args[i];
          let y1 = args[i + 1];
          let x2 = args[i + 2];
          let y2 = args[i + 3];
          let x = args[i + 4];
          let y = args[i + 5];

          if (isRelative) {
            x1 += currentX;
            y1 += currentY;
            x2 += currentX;
            y2 += currentY;
            x += currentX;
            y += currentY;
          }

          ctx.bezierCurveTo(
            offsetX + x1,
            offsetY + y1,
            offsetX + x2,
            offsetY + y2,
            offsetX + x,
            offsetY + y
          );

          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'Q': {
        // Quadratic bezier: x1 y1 x y
        for (let i = 0; i < args.length; i += 4) {
          let x1 = args[i];
          let y1 = args[i + 1];
          let x = args[i + 2];
          let y = args[i + 3];

          if (isRelative) {
            x1 += currentX;
            y1 += currentY;
            x += currentX;
            y += currentY;
          }

          ctx.quadraticCurveTo(
            offsetX + x1,
            offsetY + y1,
            offsetX + x,
            offsetY + y
          );

          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'Z': {
        // Close path
        ctx.closePath();
        currentX = startX;
        currentY = startY;
        break;
      }
    }
  }
}

/**
 * Convert SVG arc parameters to Canvas arc parameters.
 * Returns center and angles for ctx.arc()
 */
function svgArcToCanvasArc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  largeArc: boolean,
  sweep: boolean
): { cx: number; cy: number; startAngle: number; endAngle: number } {
  // Midpoint
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Distance from midpoint to endpoints
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy) / 2;

  // Handle edge case where radius is too small
  const rAdjusted = Math.max(r, d);

  // Distance from midpoint to center
  const h = Math.sqrt(Math.max(0, rAdjusted * rAdjusted - d * d));

  // Perpendicular direction
  const px = -dy / (2 * d);
  const py = dx / (2 * d);

  // Choose center based on largeArc and sweep flags
  const sign = largeArc !== sweep ? 1 : -1;
  const cx = mx + sign * h * px;
  const cy = my + sign * h * py;

  // Calculate angles
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const endAngle = Math.atan2(y2 - cy, x2 - cx);

  return { cx, cy, startAngle, endAngle };
}

/**
 * Render symbol paths to canvas.
 */
function renderPaths(
  ctx: CanvasRenderingContext2D,
  paths: SymbolPath[],
  x: number,
  y: number
): void {
  const t = getTheme();
  for (const path of paths) {
    const commands = parseSVGPath(path.d);
    const shouldStroke = path.stroke !== false; // default true
    const shouldFill = path.fill === true; // default false
    const strokeWidth = path.strokeWidth ?? t.symbolStrokeWidth;

    ctx.strokeStyle = t.symbolStroke;
    ctx.fillStyle = t.symbolStroke;
    ctx.lineWidth = strokeWidth;

    renderPathCommands(ctx, commands, x, y);

    if (shouldFill) {
      ctx.fill();
    }
    if (shouldStroke) {
      ctx.stroke();
    }
  }
}

/**
 * Render symbol text elements to canvas.
 */
function renderTexts(
  ctx: CanvasRenderingContext2D,
  texts: SymbolText[],
  x: number,
  y: number
): void {
  const t = getTheme();
  for (const text of texts) {
    const fontSize = text.fontSize ?? 20;
    const fontWeight = text.fontWeight ?? 'bold';

    ctx.fillStyle = t.symbolTextFill;
    ctx.font = `${fontWeight} ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.content, x + text.x, y + text.y);
  }
}

// ---------------------------------------------------------------------------
// Typed Primitive Renderer
// ---------------------------------------------------------------------------

/**
 * Render typed geometric primitives to canvas.
 * Each primitive carries its own type (rect, circle, line, etc.)
 * enabling native canvas calls instead of parsing SVG path strings.
 */
function renderPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: SymbolPrimitive[],
  x: number,
  y: number
): void {
  const t = getTheme();
  for (const p of primitives) {
    const strokeColor = ('stroke' in p && p.stroke) || t.symbolStroke;
    const fillColor = ('fill' in p && p.fill) || 'none';
    const lineWidth = ('strokeWidth' in p && p.strokeWidth) || t.symbolStrokeWidth;

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor !== 'none' ? fillColor : t.symbolStroke;
    ctx.lineWidth = lineWidth;

    switch (p.type) {
      case 'rect': {
        ctx.beginPath();
        if (p.rx && p.rx > 0) {
          ctx.roundRect(x + p.x, y + p.y, p.width, p.height, p.rx);
        } else {
          ctx.rect(x + p.x, y + p.y, p.width, p.height);
        }
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.arc(x + p.cx, y + p.cy, p.r, 0, Math.PI * 2);
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(x + p.x1, y + p.y1);
        ctx.lineTo(x + p.x2, y + p.y2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        ctx.beginPath();
        ctx.arc(x + p.cx, y + p.cy, p.r, p.startAngle, p.endAngle);
        ctx.stroke();
        break;
      }
      case 'ellipse': {
        ctx.beginPath();
        ctx.ellipse(x + p.cx, y + p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'polyline': {
        if (p.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(x + p.points[0].x, y + p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
          ctx.lineTo(x + p.points[i].x, y + p.points[i].y);
        }
        if (p.closed) ctx.closePath();
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'text': {
        const fontSize = p.fontSize ?? 20;
        const fontWeight = p.fontWeight ?? 'bold';
        ctx.fillStyle = t.symbolTextFill;
        ctx.font = `${fontWeight} ${fontSize}px monospace`;
        ctx.textAlign = (p.textAnchor as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.content, x + p.x, y + p.y);
        break;
      }
      case 'path': {
        // Fallback: delegate to existing SVG path parser
        const commands = parseSVGPath(p.d);
        const shouldStroke = p.stroke !== 'none';
        const shouldFill = p.fill != null && p.fill !== 'none';
        ctx.strokeStyle = (p.stroke && p.stroke !== 'none') ? p.stroke : t.symbolStroke;
        ctx.fillStyle = (p.fill && p.fill !== 'none') ? p.fill : t.symbolStroke;
        ctx.lineWidth = p.strokeWidth ?? t.symbolStrokeWidth;
        renderPathCommands(ctx, commands, x, y);
        if (shouldFill) ctx.fill();
        if (shouldStroke) ctx.stroke();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Draw function registry
// ---------------------------------------------------------------------------

type SymbolDrawFn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition,
  tag: string
) => void;

const drawFunctions: Map<string, SymbolDrawFn> = new Map();

/**
 * Register a custom draw function for a symbol category.
 */
export function registerDrawFunction(
  category: string,
  fn: SymbolDrawFn
): void {
  drawFunctions.set(category, fn);
}

// ---------------------------------------------------------------------------
// Backward-compat shim: getSymbolGeometry
// ---------------------------------------------------------------------------

/**
 * Get symbol geometry by ID or category.
 * Tries ID lookup first, then falls back to category for backward compatibility.
 * Results are cached since symbol definitions don't change at runtime.
 */
const geometryCache = new Map<string, SymbolGeometry>();
const UNKNOWN_GEOMETRY: SymbolGeometry = { width: 40, height: 40, pins: [] };

export function getSymbolGeometry(idOrCategory: string): SymbolGeometry {
  const cached = geometryCache.get(idOrCategory);
  if (cached) return cached;

  const def = lookupSymbol(idOrCategory);
  if (!def) {
    return UNKNOWN_GEOMETRY;
  }
  const geometry: SymbolGeometry = {
    width: def.geometry.width,
    height: def.geometry.height,
    pins: def.pins.map((p) => ({
      id: p.id,
      position: p.position,
      direction: p.direction,
    })),
  };
  geometryCache.set(idOrCategory, geometry);
  return geometry;
}

// ---------------------------------------------------------------------------
// Generic fallback renderer
// ---------------------------------------------------------------------------

function drawGenericSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition,
  tag: string
): void {
  const t = getTheme();
  ctx.strokeStyle = t.symbolStroke;
  ctx.lineWidth = t.symbolStrokeWidth;
  ctx.strokeRect(x, y, def.geometry.width, def.geometry.height);

  ctx.fillStyle = t.tagColor;
  ctx.font = t.tagFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(tag, x + 2, y + 2);
}

// ---------------------------------------------------------------------------
// Shared drawing helpers
// ---------------------------------------------------------------------------

function drawPins(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const t = getTheme();
  ctx.fillStyle = t.pinDotColor;
  ctx.font = '10px monospace';

  for (const pin of def.pins) {
    const pinX = x + pin.position.x;
    const pinY = y + pin.position.y;

    // Draw pin dot
    ctx.beginPath();
    ctx.arc(pinX, pinY, t.pinDotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw pin label
    ctx.fillStyle = t.pinLabelColor;
    ctx.textBaseline = 'middle';

    switch (pin.direction) {
      case 'left':
        ctx.textAlign = 'right';
        ctx.fillText(pin.id, pinX - 8, pinY);
        break;
      case 'right':
        ctx.textAlign = 'left';
        ctx.fillText(pin.id, pinX + 8, pinY);
        break;
      case 'top':
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pin.id, pinX, pinY - 8);
        break;
      case 'bottom':
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(pin.id, pinX, pinY + 8);
        break;
    }

    // Reset fill for next pin dot
    ctx.fillStyle = t.pinDotColor;
  }
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition,
  tag: string,
  category: string
): void {
  const t = getTheme();
  if (category === 'motor') {
    // Motor shows tag below the symbol
    ctx.fillStyle = t.tagColor;
    ctx.font = t.tagFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(tag, x + def.geometry.width / 2, y + def.geometry.height + 15);
  } else {
    ctx.fillStyle = t.tagColor;
    ctx.font = t.tagFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tag, x + 2, y + 2);
  }
}

// ---------------------------------------------------------------------------
// Main draw entry point
// ---------------------------------------------------------------------------

/**
 * Draw a symbol on the canvas.
 * Supports rotation (0/90/180/270) and horizontal mirror via optional transform.
 * The idOrCategory parameter can be a symbol ID (e.g., 'iec-power-supply') or category.
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  idOrCategory: string,
  x: number,
  y: number,
  tag: string,
  transform?: DeviceTransform
): void {
  const def = lookupSymbol(idOrCategory);
  const t = getTheme();

  ctx.save();

  if (!def) {
    // No definition at all -- draw a placeholder rectangle
    ctx.strokeStyle = t.symbolStroke;
    ctx.lineWidth = t.symbolStrokeWidth;
    ctx.strokeRect(x, y, 40, 40);
    ctx.fillStyle = t.tagColor;
    ctx.font = t.tagFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tag, x + 2, y + 2);
    ctx.restore();
    return;
  }

  const { width, height } = def.geometry;
  const rotation = transform?.rotation || 0;
  const mirrorH = transform?.mirrorH || false;

  // Apply rotation and mirror transforms around symbol center
  if (rotation !== 0 || mirrorH) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    if (mirrorH) {
      ctx.scale(-1, 1);
    }
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }
    ctx.translate(-cx, -cy);
  }

  // Priority: 1. primitives, 2. paths array, 3. custom draw function, 4. generic fallback
  if (def.primitives && def.primitives.length > 0) {
    // Use typed primitive rendering (preferred)
    renderPrimitives(ctx, def.primitives, x, y);
  } else if (def.paths && def.paths.length > 0) {
    // Use SVG path-based rendering (legacy)
    renderPaths(ctx, def.paths, x, y);
    if (def.texts && def.texts.length > 0) {
      renderTexts(ctx, def.texts, x, y);
    }
  } else {
    // Use custom draw function or generic fallback
    const drawFn = drawFunctions.get(idOrCategory);
    if (drawFn) {
      drawFn(ctx, x, y, def, tag);
    } else {
      drawGenericSymbol(ctx, x, y, def, tag);
    }
  }

  ctx.restore();

  // Junction symbols: just draw the filled dot, skip tag and pins
  if (def.category?.toLowerCase() === 'junction') {
    return;
  }

  // Draw tag label (outside rotation transform so text stays readable)
  drawTag(ctx, x, y, def, tag, idOrCategory);

  // Draw pins at their transformed positions
  if (rotation !== 0 || mirrorH) {
    drawTransformedPins(ctx, x, y, def, rotation, mirrorH);
  } else {
    drawPins(ctx, x, y, def);
  }
}

/**
 * Get symbol geometry with transforms applied to pins.
 */
export function getTransformedSymbolGeometry(
  category: string,
  transform?: DeviceTransform
): SymbolGeometry {
  const base = getSymbolGeometry(category);
  if (!transform || (transform.rotation === 0 && !transform.mirrorH)) {
    return base;
  }

  return {
    width: base.width,
    height: base.height,
    pins: base.pins.map(pin =>
      transformPinPosition(pin, base.width, base.height, transform.rotation, transform.mirrorH)
    ),
  };
}

/**
 * Draw pins at transformed positions.
 */
function drawTransformedPins(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition,
  rotation: number,
  mirrorH: boolean
): void {
  const t = getTheme();
  const { width, height } = def.geometry;
  ctx.fillStyle = t.pinDotColor;
  ctx.font = '10px monospace';

  for (const pin of def.pins) {
    const transformed = transformPinPosition(
      { id: pin.id, position: pin.position, direction: pin.direction },
      width,
      height,
      rotation,
      mirrorH
    );
    const pinX = x + transformed.position.x;
    const pinY = y + transformed.position.y;

    ctx.fillStyle = t.pinDotColor;
    ctx.beginPath();
    ctx.arc(pinX, pinY, t.pinDotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = t.pinLabelColor;
    ctx.textBaseline = 'middle';

    switch (transformed.direction) {
      case 'left':
        ctx.textAlign = 'right';
        ctx.fillText(pin.id, pinX - 8, pinY);
        break;
      case 'right':
        ctx.textAlign = 'left';
        ctx.fillText(pin.id, pinX + 8, pinY);
        break;
      case 'top':
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pin.id, pinX, pinY - 8);
        break;
      case 'bottom':
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(pin.id, pinX, pinY + 8);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Built-in draw functions (only junction needs special handling)
// ---------------------------------------------------------------------------

function drawJunction(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const t = getTheme();
  const cx = x + def.geometry.width / 2;
  const cy = y + def.geometry.height / 2;
  ctx.fillStyle = t.junctionFill;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

export function registerBuiltinDrawFunctions(): void {
  registerDrawFunction('junction', drawJunction);
  registerDrawFunction('Junction', drawJunction);
}

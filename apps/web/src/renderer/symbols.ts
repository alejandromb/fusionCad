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

import type { SymbolDefinition, SymbolPath, SymbolText } from '@fusion-cad/core-model';
import { getSymbolDefinition } from '@fusion-cad/core-model';
import type { SymbolGeometry } from './types';

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
  for (const path of paths) {
    const commands = parseSVGPath(path.d);
    const shouldStroke = path.stroke !== false; // default true
    const shouldFill = path.fill === true; // default false
    const strokeWidth = path.strokeWidth ?? 2;

    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#00ff00';
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
  for (const text of texts) {
    const fontSize = text.fontSize ?? 20;
    const fontWeight = text.fontWeight ?? 'bold';

    ctx.fillStyle = '#00ff00';
    ctx.font = `${fontWeight} ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.content, x + text.x, y + text.y);
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
 * Get symbol geometry by category.
 * Reads from the core-model symbol library and maps to the renderer SymbolGeometry type.
 */
export function getSymbolGeometry(category: string): SymbolGeometry {
  const def = getSymbolDefinition(category);
  if (!def) {
    return { width: 40, height: 40, pins: [] };
  }
  return {
    width: def.geometry.width,
    height: def.geometry.height,
    pins: def.pins.map((p) => ({
      id: p.id,
      position: p.position,
      direction: p.direction,
    })),
  };
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
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, def.geometry.width, def.geometry.height);

  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 12px monospace';
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
  ctx.fillStyle = '#00ffff'; // Cyan for pin dots
  ctx.font = '10px monospace';

  for (const pin of def.pins) {
    const pinX = x + pin.position.x;
    const pinY = y + pin.position.y;

    // Draw pin dot
    ctx.beginPath();
    ctx.arc(pinX, pinY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw pin label
    ctx.fillStyle = '#ffff00'; // Yellow for pin labels
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
    ctx.fillStyle = '#00ffff';
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
  if (category === 'motor') {
    // Motor shows tag below the symbol
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(tag, x + def.geometry.width / 2, y + def.geometry.height + 15);
  } else {
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
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
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  category: string,
  x: number,
  y: number,
  tag: string
): void {
  const def = getSymbolDefinition(category);

  ctx.save();

  if (!def) {
    // No definition at all -- draw a placeholder rectangle
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 40, 40);
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tag, x + 2, y + 2);
    ctx.restore();
    return;
  }

  // Priority: 1. paths array, 2. custom draw function, 3. generic fallback
  if (def.paths && def.paths.length > 0) {
    // Use SVG path-based rendering
    renderPaths(ctx, def.paths, x, y);
    if (def.texts && def.texts.length > 0) {
      renderTexts(ctx, def.texts, x, y);
    }
  } else {
    // Use custom draw function or generic fallback
    const drawFn = drawFunctions.get(category);
    if (drawFn) {
      drawFn(ctx, x, y, def, tag);
    } else {
      drawGenericSymbol(ctx, x, y, def, tag);
    }
  }

  // Draw tag label
  drawTag(ctx, x, y, def, tag, category);

  ctx.restore();

  // Draw pins (outside save/restore so pin styles are clean)
  drawPins(ctx, x, y, def);
}

// ---------------------------------------------------------------------------
// Built-in draw functions (IEC 60617 visual representations)
// ---------------------------------------------------------------------------

function drawContactor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  // Draw coil rectangle (left side)
  const coilWidth = 20;
  ctx.strokeRect(x + 5, y + 15, coilWidth, height - 30);

  // Draw contact blocks (right side)
  const contactX = x + width - 15;
  const contactSpacing = (height - 20) / 7;
  ctx.fillStyle = '#00ff00';
  for (let i = 0; i < 6; i++) {
    const contactY = y + 15 + i * contactSpacing;
    ctx.fillRect(contactX - 8, contactY - 2, 16, 4);
  }

  // Draw aux contact (top)
  ctx.strokeRect(x + width / 2 - 8, y + 2, 16, 8);
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Draw contact line (horizontal)
  ctx.beginPath();
  ctx.moveTo(x + 5, centerY);
  ctx.lineTo(x + width - 5, centerY);
  ctx.stroke();

  // Draw actuator (angled line above)
  ctx.beginPath();
  ctx.moveTo(centerX - 8, centerY - 10);
  ctx.lineTo(centerX + 8, centerY - 5);
  ctx.stroke();

  // Draw circle around
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.min(width, height) / 2 - 5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawOverload(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  // Draw thermal element (zigzag)
  const centerX = x + width / 2;
  const segments = 5;
  const segmentHeight = height / segments;

  ctx.beginPath();
  ctx.moveTo(centerX - 10, y + 10);
  for (let i = 0; i < segments; i++) {
    const yPos = y + 10 + i * segmentHeight;
    ctx.lineTo(centerX + (i % 2 === 0 ? 10 : -10), yPos);
  }
  ctx.stroke();

  // Draw bounding box
  ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
}

function drawMotor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.min(width, height) / 2 - 5;

  // Draw circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Draw M
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', centerX, centerY);
}

function drawTerminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  // Draw base rectangle
  ctx.strokeRect(x, y, width, height);

  // Draw terminal points (5 vertical bars at top)
  const spacing = width / 6;
  for (let i = 1; i <= 5; i++) {
    const termX = x + i * spacing;
    ctx.beginPath();
    ctx.moveTo(termX, y);
    ctx.lineTo(termX, y + 15);
    ctx.stroke();

    // Terminal screw
    ctx.beginPath();
    ctx.arc(termX, y + 10, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPowerSupply(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: SymbolDefinition
): void {
  const { width, height } = def.geometry;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  // Draw rectangle
  ctx.strokeRect(x, y, width, height);

  // Draw +/- symbols
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ff00';
  ctx.fillText('+', x + width - 15, y + 20);
  ctx.fillText('-', x + width - 15, y + 40);

  // Draw AC wave on left
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 25);
  ctx.quadraticCurveTo(x + 15, y + 15, x + 20, y + 25);
  ctx.quadraticCurveTo(x + 25, y + 35, x + 30, y + 25);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Register built-in draw functions
// ---------------------------------------------------------------------------

export function registerBuiltinDrawFunctions(): void {
  registerDrawFunction('contactor', drawContactor);
  registerDrawFunction('button', drawButton);
  registerDrawFunction('overload', drawOverload);
  registerDrawFunction('motor', drawMotor);
  registerDrawFunction('terminal', drawTerminal);
  registerDrawFunction('power-supply', drawPowerSupply);
}

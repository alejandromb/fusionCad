/**
 * Hardcoded symbol library
 *
 * Phase 2.1: Simple rectangular symbols with pins
 */

import type { SymbolGeometry } from './types';

/**
 * Get symbol geometry by category
 */
export function getSymbolGeometry(category: string): SymbolGeometry {
  switch (category) {
    case 'contactor':
      return {
        width: 60,
        height: 80,
        pins: [
          { id: 'A1', position: { x: 0, y: 20 }, direction: 'left' },
          { id: 'A2', position: { x: 0, y: 60 }, direction: 'left' },
          { id: '1', position: { x: 60, y: 10 }, direction: 'right' },
          { id: '2', position: { x: 60, y: 30 }, direction: 'right' },
          { id: '3', position: { x: 60, y: 40 }, direction: 'right' },
          { id: '4', position: { x: 60, y: 50 }, direction: 'right' },
          { id: '5', position: { x: 60, y: 60 }, direction: 'right' },
          { id: '6', position: { x: 60, y: 70 }, direction: 'right' },
          { id: '13', position: { x: 30, y: 0 }, direction: 'top' },
          { id: '14', position: { x: 30, y: 80 }, direction: 'bottom' },
        ],
      };

    case 'button':
      return {
        width: 40,
        height: 40,
        pins: [
          { id: '1', position: { x: 0, y: 20 }, direction: 'left' },
          { id: '2', position: { x: 40, y: 20 }, direction: 'right' },
        ],
      };

    case 'overload':
      return {
        width: 50,
        height: 60,
        pins: [
          { id: '95', position: { x: 0, y: 20 }, direction: 'left' },
          { id: '96', position: { x: 0, y: 40 }, direction: 'left' },
        ],
      };

    case 'motor':
      return {
        width: 60,
        height: 60,
        pins: [
          { id: 'U', position: { x: 10, y: 0 }, direction: 'top' },
          { id: 'V', position: { x: 30, y: 0 }, direction: 'top' },
          { id: 'W', position: { x: 50, y: 0 }, direction: 'top' },
        ],
      };

    case 'terminal':
      return {
        width: 100,
        height: 100,
        pins: [
          { id: '1', position: { x: 10, y: 0 }, direction: 'top' },
          { id: '2', position: { x: 30, y: 0 }, direction: 'top' },
          { id: '3', position: { x: 50, y: 0 }, direction: 'top' },
          { id: '4', position: { x: 70, y: 0 }, direction: 'top' },
          { id: '5', position: { x: 90, y: 0 }, direction: 'top' },
        ],
      };

    case 'power-supply':
      return {
        width: 50,
        height: 60,
        pins: [
          { id: '+', position: { x: 50, y: 20 }, direction: 'right' },
          { id: '-', position: { x: 50, y: 40 }, direction: 'right' },
        ],
      };

    default:
      return {
        width: 40,
        height: 40,
        pins: [],
      };
  }
}

/**
 * Draw contactor symbol (rectangular coil)
 */
function drawContactor(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;

  // Draw coil rectangle (left side)
  const coilWidth = 20;
  ctx.strokeRect(x + 5, y + 15, coilWidth, height - 30);

  // Draw contact blocks (right side)
  const contactX = x + width - 15;
  const contactSpacing = (height - 20) / 7;
  for (let i = 0; i < 6; i++) {
    const contactY = y + 15 + i * contactSpacing;
    ctx.fillRect(contactX - 8, contactY - 2, 16, 4);
  }

  // Draw aux contact (top)
  ctx.strokeRect(x + width / 2 - 8, y + 2, 16, 8);
}

/**
 * Draw button symbol (contact)
 */
function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
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

/**
 * Draw overload relay symbol (thermal element)
 */
function drawOverload(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
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

/**
 * Draw motor symbol (circle with M)
 */
function drawMotor(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, tag: string): void {
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

/**
 * Draw terminal strip symbol
 */
function drawTerminal(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
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

/**
 * Draw power supply symbol
 */
function drawPowerSupply(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
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

/**
 * Draw a symbol on the canvas
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  category: string,
  x: number,
  y: number,
  tag: string
): void {
  const geometry = getSymbolGeometry(category);

  // Draw category-specific symbol
  ctx.save();

  switch (category) {
    case 'contactor':
      drawContactor(ctx, x, y, geometry.width, geometry.height);
      break;
    case 'button':
      drawButton(ctx, x, y, geometry.width, geometry.height);
      break;
    case 'overload':
      drawOverload(ctx, x, y, geometry.width, geometry.height);
      break;
    case 'motor':
      drawMotor(ctx, x, y, geometry.width, geometry.height, tag);
      break;
    case 'terminal':
      drawTerminal(ctx, x, y, geometry.width, geometry.height);
      break;
    case 'power-supply':
      drawPowerSupply(ctx, x, y, geometry.width, geometry.height);
      break;
    default:
      // Fallback: simple rectangle
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, geometry.width, geometry.height);
  }

  // Draw tag (except for motor which already shows M)
  if (category !== 'motor') {
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tag, x + 2, y + 2);
  } else {
    // For motor, show tag below the symbol
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(tag, x + geometry.width / 2, y + geometry.height + 15);
  }

  ctx.restore();

  // Draw pins with labels
  ctx.fillStyle = '#00ffff'; // Cyan for pin dots
  ctx.font = '10px monospace';

  for (const pin of geometry.pins) {
    const pinX = x + pin.position.x;
    const pinY = y + pin.position.y;

    // Draw pin dot
    ctx.beginPath();
    ctx.arc(pinX, pinY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw pin label
    ctx.fillStyle = '#ffff00'; // Yellow for pin labels
    ctx.textBaseline = 'middle';

    // Position label based on pin direction
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
  }
}

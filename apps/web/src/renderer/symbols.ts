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

  // Draw body
  ctx.fillStyle = '#2a2a2a';
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, geometry.width, geometry.height);
  ctx.strokeRect(x, y, geometry.width, geometry.height);

  // Draw tag
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, x + geometry.width / 2, y + geometry.height / 2);

  // Draw pins with labels
  ctx.fillStyle = '#ff0000';
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

/**
 * Circuit Renderer
 *
 * Renders the golden circuit on canvas
 */

import type { Device, Net, Part } from '@fusion-cad/core-model';
import { drawSymbol, getSymbolGeometry } from './symbols';
import type { Point, Viewport } from './types';

export interface Connection {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
}

export interface CircuitData {
  devices: Device[];
  nets: Net[];
  parts: Part[];
  connections: Connection[];
}

/**
 * Layout devices based on circuit topology
 *
 * Manual layout for the motor starter circuit:
 * - Power supply (PS1) at top-left
 * - Terminal strip (X1) below power
 * - Control buttons (S2, S1) in middle
 * - Contactor (K1) center-right
 * - Overload (F1) below contactor
 * - Motor (M1) at bottom
 */
function layoutDevices(devices: Device[], parts: Part[]): Map<string, Point> {
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  const positions = new Map<string, Point>();

  // Manual positions for better schematic layout
  const layouts: Record<string, Point> = {
    'PS1': { x: 50, y: 50 },      // Power supply top-left
    'X1': { x: 150, y: 50 },      // Terminal strip top-center
    'S2': { x: 300, y: 150 },     // Stop button (E-stop)
    'S1': { x: 400, y: 150 },     // Start button
    'K1': { x: 500, y: 200 },     // Contactor
    'F1': { x: 500, y: 350 },     // Overload relay
    'M1': { x: 500, y: 500 },     // Motor at bottom
  };

  for (const device of devices) {
    const pos = layouts[device.tag];
    if (pos) {
      positions.set(device.tag, pos);
    } else {
      // Fallback for unknown devices
      positions.set(device.tag, { x: 100, y: 100 });
    }
  }

  return positions;
}

/**
 * Render the circuit on canvas
 */
export function renderCircuit(
  ctx: CanvasRenderingContext2D,
  circuit: CircuitData,
  viewport: Viewport
): void {
  const { devices, nets, parts, connections } = circuit;

  // Create part lookup
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Layout devices
  const positions = layoutDevices(devices, parts);

  // Clear canvas
  ctx.save();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Apply viewport transform
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  // Render connections (wires) - connect actual pins
  ctx.strokeStyle = '#0088ff';
  ctx.lineWidth = 2;

  for (const conn of connections) {
    const fromPos = positions.get(conn.fromDevice);
    const toPos = positions.get(conn.toDevice);

    if (!fromPos || !toPos) continue;

    const fromDevice = devices.find(d => d.tag === conn.fromDevice);
    const toDevice = devices.find(d => d.tag === conn.toDevice);

    if (!fromDevice || !toDevice) continue;

    const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
    const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;

    const fromGeometry = getSymbolGeometry(fromPart?.category || 'unknown');
    const toGeometry = getSymbolGeometry(toPart?.category || 'unknown');

    // Find pin positions
    const fromPin = fromGeometry.pins.find(p => p.id === conn.fromPin);
    const toPin = toGeometry.pins.find(p => p.id === conn.toPin);

    // Default to center if pin not found
    const fromX = fromPos.x + (fromPin?.position.x ?? fromGeometry.width / 2);
    const fromY = fromPos.y + (fromPin?.position.y ?? fromGeometry.height / 2);
    const toX = toPos.x + (toPin?.position.x ?? toGeometry.width / 2);
    const toY = toPos.y + (toPin?.position.y ?? toGeometry.height / 2);

    // Draw wire with orthogonal routing (90-degree angles)
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);

    // Simple orthogonal routing: horizontal then vertical
    const midX = (fromX + toX) / 2;
    ctx.lineTo(midX, fromY);
    ctx.lineTo(midX, toY);
    ctx.lineTo(toX, toY);

    ctx.stroke();
  }

  // Render devices (symbols)
  for (const device of devices) {
    const position = positions.get(device.tag);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const category = part?.category || 'unknown';

    drawSymbol(ctx, category, position.x, position.y, device.tag);
  }

  // Draw info text
  ctx.restore();
  ctx.fillStyle = '#00ff00';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Devices: ${devices.length}`, 10, 20);
  ctx.fillText(`Connections: ${connections.length}`, 10, 40);
  ctx.fillText(`Nets: ${nets.length}`, 10, 60);
  ctx.fillText('Phase 2: Canvas Rendering', 10, 80);
}

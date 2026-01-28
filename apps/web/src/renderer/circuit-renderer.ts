/**
 * Circuit Renderer
 *
 * Renders the golden circuit on canvas
 */

import type { Device, Net, Part } from '@fusion-cad/core-model';
import { drawSymbol, getSymbolGeometry } from './symbols';
import type { Point, Viewport } from './types';
import { routeWires, type Obstacle, type RouteRequest } from '@fusion-cad/core-engine';

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
  // Left column: power distribution
  // Center: control circuit (buttons + coil)
  // Right: power circuit (main contacts)
  const layouts: Record<string, Point> = {
    'PS1': { x: 50, y: 80 },       // Power supply top-left
    'X1': { x: 50, y: 280 },       // Terminal strip - moved down for wire clearance
    'S2': { x: 250, y: 250 },      // Stop button (E-stop) center
    'S1': { x: 400, y: 250 },      // Start button center-right
    'K1': { x: 550, y: 250 },      // Contactor right side
    'F1': { x: 550, y: 400 },      // Overload relay below contactor
    'M1': { x: 550, y: 550 },      // Motor at bottom-right
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
 * Create obstacles from device positions
 */
function createObstacles(
  devices: Device[],
  positions: Map<string, Point>,
  parts: Part[],
  partMap: Map<string, Part>
): Obstacle[] {
  const obstacles: Obstacle[] = [];

  for (const device of devices) {
    const position = positions.get(device.tag);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.category || 'unknown');

    obstacles.push({
      id: device.tag,
      bounds: {
        x: position.x,
        y: position.y,
        width: geometry.width,
        height: geometry.height,
      },
    });
  }

  return obstacles;
}

/**
 * Render the circuit on canvas
 */
export function renderCircuit(
  ctx: CanvasRenderingContext2D,
  circuit: CircuitData,
  viewport: Viewport,
  debugMode = false
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

  // FIRST: Render devices (symbols) - draw these first so wires appear on top
  for (const device of devices) {
    const position = positions.get(device.tag);
    if (!position) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const category = part?.category || 'unknown';

    drawSymbol(ctx, category, position.x, position.y, device.tag);
  }

  // Create obstacles from devices for routing
  const obstacles = createObstacles(devices, positions, parts, partMap);

  // Build all route requests first
  const routeRequests: RouteRequest[] = [];
  const connectionMetadata: Array<{
    index: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    conn: Connection;
  }> = [];

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
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

    routeRequests.push({
      id: `wire_${i}`,
      start: { x: fromX, y: fromY },
      end: { x: toX, y: toY },
      netId: conn.netId,
    });

    connectionMetadata.push({
      index: i,
      fromX,
      fromY,
      toX,
      toY,
      conn,
    });
  }

  // Route all wires together with nudging
  const routeResults = routeWires(routeRequests, obstacles, 5, 8); // 5px padding, 8px spacing

  // SECOND: Render connections (wires) ON TOP - use visibility graph routing with nudging
  ctx.lineWidth = 2;

  // Color palette for wires (11 distinct colors)
  const wireColors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Cyan
    '#45B7D1', // Blue
    '#FFA07A', // Light Salmon
    '#98D8C8', // Mint
    '#FFD93D', // Yellow
    '#6BCF7F', // Green
    '#C77DFF', // Purple
    '#FF9ECD', // Pink
    '#74C0FC', // Sky Blue
    '#FFA94D', // Orange
  ];

  for (let i = 0; i < routeResults.length; i++) {
    const routeResult = routeResults[i];
    const metadata = connectionMetadata[i];

    // Set unique color for this wire
    ctx.strokeStyle = wireColors[i % wireColors.length];

    if (routeResult.success && routeResult.path.segments.length > 0) {
      // Draw routed path segments
      ctx.beginPath();
      ctx.moveTo(routeResult.path.waypoints[0].x, routeResult.path.waypoints[0].y);

      for (const waypoint of routeResult.path.waypoints.slice(1)) {
        ctx.lineTo(waypoint.x, waypoint.y);
      }

      ctx.stroke();
    } else {
      // Fallback: direct line if routing fails
      ctx.beginPath();
      ctx.moveTo(metadata.fromX, metadata.fromY);
      ctx.lineTo(metadata.toX, metadata.toY);
      ctx.stroke();
    }

    // Draw connection points (circles at wire endpoints)
    ctx.fillStyle = '#00ffff'; // Cyan for connection points
    ctx.beginPath();
    ctx.arc(metadata.fromX, metadata.fromY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(metadata.toX, metadata.toY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Debug mode: Draw wire labels and endpoint info
    if (debugMode) {
      const wireNumber = `W${String(metadata.index + 1).padStart(3, '0')}`;
      const net = nets.find(n => n.id === metadata.conn.netId);
      const netName = net?.name || 'unknown';

      // Wire label at midpoint (wire number + net name)
      ctx.save();
      const labelColor = wireColors[metadata.index % wireColors.length];
      ctx.fillStyle = labelColor;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate midpoint from routed path (or fallback to direct midpoint)
      let labelX = (metadata.fromX + metadata.toX) / 2;
      let labelY = (metadata.fromY + metadata.toY) / 2;
      if (routeResult.success && routeResult.path.waypoints.length > 0) {
        const midIndex = Math.floor(routeResult.path.waypoints.length / 2);
        labelX = routeResult.path.waypoints[midIndex].x;
        labelY = routeResult.path.waypoints[midIndex].y;
      }

      // Draw label with background for readability
      const labelText = `${wireNumber} (${netName})`;
      const metrics = ctx.measureText(labelText);
      const padding = 4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(
        labelX - metrics.width / 2 - padding,
        labelY - 8,
        metrics.width + padding * 2,
        16
      );

      ctx.fillStyle = labelColor;
      ctx.fillText(labelText, labelX, labelY);

      // Endpoint labels (device:pin)
      ctx.font = '10px monospace';

      // From endpoint
      const fromLabel = `${metadata.conn.fromDevice}:${metadata.conn.fromPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const fromMetrics = ctx.measureText(fromLabel);
      ctx.fillRect(
        metadata.fromX - fromMetrics.width / 2 - 2,
        metadata.fromY - 18,
        fromMetrics.width + 4,
        12
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fromLabel, metadata.fromX, metadata.fromY - 6);

      // To endpoint
      const toLabel = `${metadata.conn.toDevice}:${metadata.conn.toPin}`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const toMetrics = ctx.measureText(toLabel);
      ctx.fillRect(
        metadata.toX - toMetrics.width / 2 - 2,
        metadata.toY + 6,
        toMetrics.width + 4,
        12
      );
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(toLabel, metadata.toX, metadata.toY + 6);

      ctx.restore();
    }
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

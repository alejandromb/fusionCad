/**
 * Ladder Diagram Renderer
 *
 * Draws the structural overlay for ladder diagrams:
 * - L1 and L2 vertical power rails
 * - Rail labels and voltage annotation
 * - Rung numbers in the left margin
 * - Rung description text in the right margin
 * - Horizontal rung guide lines
 * - Rail-to-device stub wires (L1 → first device, last device → L2)
 */

import type { Device, Part, Sheet, Rung } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import { getSymbolGeometry } from './symbols';
import type { Point } from './types';

/**
 * Compute a pin's world position accounting for device rotation.
 * (Duplicated from circuit-renderer to avoid circular imports.)
 */
function getPinWorldPos(
  devicePos: Point,
  pinPos: Point,
  geometry: { width: number; height: number },
  rotation: number,
): Point {
  let px = pinPos.x;
  let py = pinPos.y;

  if (rotation !== 0) {
    const cx = geometry.width / 2;
    const cy = geometry.height / 2;
    const rad = (rotation * Math.PI) / 180;
    const dx = pinPos.x - cx;
    const dy = pinPos.y - cy;
    px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }

  return { x: devicePos.x + px, y: devicePos.y + py };
}

/**
 * Render the ladder diagram overlay (rails, rung numbers, labels, rail stubs).
 * Called after grid but before devices in the render pipeline.
 */
export function renderLadderOverlay(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  rungs: Rung[],
  devices?: Device[],
  parts?: Part[],
  positions?: Map<string, Point>,
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>,
): void {
  const config = sheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
  const { railL1X, railL2X, firstRungY, rungSpacing } = config;
  const labelL1 = config.railLabelL1 ?? 'L1';
  const labelL2 = config.railLabelL2 ?? 'L2';
  const voltage = config.voltage;

  // Sort rungs by number
  const sortedRungs = [...rungs].sort((a, b) => a.number - b.number);
  const maxRungNumber = sortedRungs.length > 0
    ? sortedRungs[sortedRungs.length - 1].number
    : 1;

  // Rail vertical extent: from above first rung to below last rung
  const railTopY = firstRungY - 40;
  const railBottomY = firstRungY + (maxRungNumber - 1) * rungSpacing + 40;

  // Build part lookup for pin resolution
  const partMap = new Map<string, Part>();
  if (parts) {
    for (const p of parts) partMap.set(p.id, p);
  }
  const deviceMap = new Map<string, Device>();
  if (devices) {
    for (const d of devices) deviceMap.set(d.id, d);
  }

  ctx.save();

  // ---- Vertical power rails ----
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;

  // L1 rail (left)
  ctx.beginPath();
  ctx.moveTo(railL1X, railTopY);
  ctx.lineTo(railL1X, railBottomY);
  ctx.stroke();

  // L2 rail (right)
  ctx.beginPath();
  ctx.moveTo(railL2X, railTopY);
  ctx.lineTo(railL2X, railBottomY);
  ctx.stroke();

  // ---- Rail labels ----
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(labelL1, railL1X, railTopY - 8);
  ctx.fillText(labelL2, railL2X, railTopY - 8);

  // ---- Voltage label (centered between rails at top) ----
  if (voltage) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd700'; // Gold for voltage
    const centerX = (railL1X + railL2X) / 2;
    ctx.fillText(voltage, centerX, railTopY - 8);
  }

  // ---- Rung guide lines, numbers, and rail stubs ----
  for (const rung of sortedRungs) {
    const rungY = firstRungY + (rung.number - 1) * rungSpacing;

    // Horizontal rung guide line (light dashed)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(railL1X, rungY);
    ctx.lineTo(railL2X, rungY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rung number (left margin)
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(String(rung.number), railL1X - 16, rungY);

    // Rung description (right margin)
    if (rung.description) {
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888888';
      ctx.fillText(rung.description, railL2X + 16, rungY);
    }

    // ---- Rail-to-device stub wires ----
    // Draw horizontal lines from L1 rail to leftmost device pin "1" (input)
    // and from rightmost device pin "2" (output) to L2 rail
    if (positions && rung.deviceIds.length > 0) {
      const firstDeviceId = rung.deviceIds[0];
      const lastDeviceId = rung.deviceIds[rung.deviceIds.length - 1];

      // L1 → first device's input pin
      const firstDevice = deviceMap.get(firstDeviceId);
      const firstPos = positions.get(firstDeviceId);
      if (firstDevice && firstPos) {
        const firstPart = firstDevice.partId ? partMap.get(firstDevice.partId) : undefined;
        const firstGeometry = getSymbolGeometry(firstPart?.category || 'unknown');
        const pin1 = firstGeometry.pins.find(p => p.id === '1');
        if (pin1) {
          const rotation = transforms?.[firstDeviceId]?.rotation || 0;
          const pinWorld = getPinWorldPos(firstPos, pin1.position, firstGeometry, rotation);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(railL1X, pinWorld.y);
          ctx.lineTo(pinWorld.x, pinWorld.y);
          ctx.stroke();
        }
      }

      // Last device's output pin → L2 (skip for branch rungs — they wire up to parent rung)
      if (!rung.branchOf) {
        const lastDevice = deviceMap.get(lastDeviceId);
        const lastPos = positions.get(lastDeviceId);
        if (lastDevice && lastPos) {
          const lastPart = lastDevice.partId ? partMap.get(lastDevice.partId) : undefined;
          const lastGeometry = getSymbolGeometry(lastPart?.category || 'unknown');
          const pin2 = lastGeometry.pins.find(p => p.id === '2');
          if (pin2) {
            const rotation = transforms?.[lastDeviceId]?.rotation || 0;
            const pinWorld = getPinWorldPos(lastPos, pin2.position, lastGeometry, rotation);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pinWorld.x, pinWorld.y);
            ctx.lineTo(railL2X, pinWorld.y);
            ctx.stroke();
          }
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Ladder Diagram Renderer
 *
 * Draws the structural overlay for ladder diagrams:
 * - Rail labels (L1/L2) and voltage annotation
 * - Rung numbers in the left margin
 * - Rung description text in the right margin
 * - Horizontal rung guide lines (subtle dots)
 *
 * NOTE: Vertical power rails and horizontal rail stubs are now real wire
 * entities created by createLadderRails() in circuit-helpers.ts.
 */

import type { Sheet, Rung } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';

/**
 * Render the ladder diagram overlay (labels, rung numbers, guide lines).
 * Called after grid but before devices in the render pipeline.
 */
export function renderLadderOverlay(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  rungs: Rung[],
  _devices?: unknown,
  _parts?: unknown,
  _positions?: unknown,
  _transforms?: unknown,
  hideRungGuides?: boolean,
): void {
  const config = sheet.ladderConfig ?? DEFAULT_LADDER_CONFIG;
  const { railL1X, railL2X, firstRungY, rungSpacing } = config;
  const labelL1 = config.railLabelL1 ?? 'L1';
  const labelL2 = config.railLabelL2 ?? 'L2';
  const voltage = config.voltage;

  // Sort rungs by number
  const sortedRungs = [...rungs].sort((a, b) => a.number - b.number);

  // Rail top position for label placement
  const railTopY = firstRungY - 40;

  ctx.save();

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

  // ---- Rung guide lines, numbers, and descriptions ----
  for (const rung of sortedRungs) {
    const rungY = firstRungY + (rung.number - 1) * rungSpacing;

    // Horizontal rung guide line (very subtle dots, hidden during wire mode)
    if (!hideRungGuides) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(railL1X, rungY);
      ctx.lineTo(railL2X, rungY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
  }

  ctx.restore();
}

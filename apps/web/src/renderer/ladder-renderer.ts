/**
 * Ladder Diagram Renderer
 *
 * Draws the structural overlay for ladder diagrams:
 * - L1 and L2 vertical power rails
 * - Rail labels and voltage annotation
 * - Rung numbers in the left margin
 * - Rung description text in the right margin
 * - Horizontal rung guide lines
 */

import type { Sheet, Rung } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';

/**
 * Render the ladder diagram overlay (rails, rung numbers, labels).
 * Called after grid but before devices in the render pipeline.
 */
export function renderLadderOverlay(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  rungs: Rung[],
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

  // ---- Rung guide lines and numbers ----
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
  }

  ctx.restore();
}

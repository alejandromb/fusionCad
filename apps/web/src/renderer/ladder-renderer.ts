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

import type { LadderConfig, Rung } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import { getTheme } from './theme';

/**
 * Render the ladder diagram overlay (labels, rung numbers, guide lines).
 * Called after grid but before devices in the render pipeline.
 *
 * `blockPosition` offsets all visual chrome (rails, labels) when the ladder
 * lives inside a DiagramBlock. Defaults to (0,0) for backward compat.
 */
export function renderLadderOverlay(
  ctx: CanvasRenderingContext2D,
  config: LadderConfig,
  rungs: Rung[],
  blockPosition?: { x: number; y: number },
  hideRungGuides?: boolean,
): void {
  const cfg = config ?? DEFAULT_LADDER_CONFIG;
  const t = getTheme();
  const { railL1X, railL2X, firstRungY, rungSpacing } = cfg;
  const labelL1 = cfg.railLabelL1 ?? 'L1';
  const labelL2 = cfg.railLabelL2 ?? 'L2';
  const voltage = cfg.voltage;

  // Sort rungs by number
  const sortedRungs = [...rungs].sort((a, b) => a.number - b.number);

  // Rail top position for label placement
  const railTopY = firstRungY - 40;

  ctx.save();

  // Apply block offset for visual chrome
  const ox = blockPosition?.x ?? 0;
  const oy = blockPosition?.y ?? 0;
  if (ox !== 0 || oy !== 0) {
    ctx.translate(ox, oy);
  }

  // ---- Rail labels ----
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = t.ladderRailLabelColor;
  ctx.fillText(labelL1, railL1X, railTopY - 8);
  ctx.fillText(labelL2, railL2X, railTopY - 8);

  // ---- Voltage label (centered between rails at top) ----
  if (voltage) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = t.ladderVoltageColor;
    const centerX = (railL1X + railL2X) / 2;
    ctx.fillText(voltage, centerX, railTopY - 8);
  }

  // ---- Rung guide lines, numbers, and descriptions ----
  for (const rung of sortedRungs) {
    const rungY = firstRungY + (rung.number - 1) * rungSpacing;

    // Horizontal rung guide line (very subtle dots, hidden during wire mode)
    if (!hideRungGuides) {
      ctx.strokeStyle = t.ladderRungGuideColor;
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
    ctx.fillStyle = t.ladderRungNumberColor;
    ctx.fillText(String(rung.number), railL1X - 16, rungY);

    // Rung description (right margin)
    if (rung.description) {
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.ladderRungDescColor;
      ctx.fillText(rung.description, railL2X + 16, rungY);
    }
  }

  ctx.restore();
}

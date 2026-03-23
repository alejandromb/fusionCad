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
  sheetNumber?: number,
): void {
  const cfg = config ?? DEFAULT_LADDER_CONFIG;
  const t = getTheme();
  const { railL1X, railL2X, firstRungY, rungSpacing } = cfg;
  const labelL1 = cfg.railLabelL1 ?? 'L1';
  const labelL2 = cfg.railLabelL2 ?? 'L2';
  const voltage = cfg.voltage;
  const scheme = cfg.numberingScheme ?? 'sequential';
  const pageNum = sheetNumber ?? 1;

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

  // ---- Vertical power rail lines (bold) ----
  if (sortedRungs.length > 0) {
    const firstY = firstRungY;
    const lastY = firstRungY + (sortedRungs.length - 1) * rungSpacing;
    ctx.strokeStyle = t.ladderRailLineColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    // L1 rail
    ctx.beginPath();
    ctx.moveTo(railL1X, firstY);
    ctx.lineTo(railL1X, lastY);
    ctx.stroke();
    // L2 rail
    ctx.beginPath();
    ctx.moveTo(railL2X, firstY);
    ctx.lineTo(railL2X, lastY);
    ctx.stroke();
  }

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
  for (let ri = 0; ri < sortedRungs.length; ri++) {
    const rung = sortedRungs[ri];
    // Y position is based on sequential index, not rung.number
    // (rung.number may be a display number like 100, 200, etc.)
    const rungY = firstRungY + ri * rungSpacing;

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

    // Compute display rung number based on numbering scheme
    // rung.number is the stored value — used directly for 'sequential'
    // For other schemes, compute from the rung's index (ri) within the block
    let displayNum: number;
    if (cfg.firstRungNumber != null) {
      displayNum = cfg.firstRungNumber + ri;
    } else {
      switch (scheme) {
        case 'page-based':
          displayNum = pageNum * 100 + ri;
          break;
        case 'page-tens':
          displayNum = pageNum * 100 + ri * 10;
          break;
        default: // 'sequential'
          displayNum = rung.number;
      }
    }

    // Rung number (left margin — placed well left of L1 rail)
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.ladderRungNumberColor;
    ctx.fillText(String(displayNum), railL1X - 20, rungY);

    // Page-qualified rung number (right margin, far right)
    // Format: "page line" (e.g., "3 25")
    if (scheme !== 'sequential') {
      const pageLineLabel = `${pageNum} ${String(displayNum).padStart(2)}`;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.ladderRungNumberColor;
      ctx.fillText(pageLineLabel, railL2X + 200, rungY);
    }

    // Rung description (right margin, adjacent to L2 rail)
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

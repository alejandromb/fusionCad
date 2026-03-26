/**
 * Ladder Diagram Renderer
 *
 * Draws the structural overlay for ladder diagrams:
 * - L1 rail label and vertical power rail line (left side only)
 * - Rung numbers in the left margin
 * - Horizontal rung guide lines (subtle dots)
 * - Rung description text to the right of rung numbers
 *
 * NOTE: L2 rail is NOT drawn — only the left rail is rendered as visual chrome.
 * Actual wires between devices are created by createLadderRails() in circuit-helpers.ts.
 */

import type { LadderConfig, Rung } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG, computeRungDisplayNumber } from '@fusion-cad/core-engine';
import { getTheme } from './theme';

/**
 * Render the ladder diagram overlay (L1 rail, rung numbers, guide lines).
 * Called after title block but before devices in the render pipeline.
 *
 * `blockPosition` offsets all visual chrome when the ladder
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
  const voltage = cfg.voltage;
  const scheme = cfg.numberingScheme ?? 'sequential';
  const pageNum = sheetNumber ?? 1;

  // Determine how many rung slots to draw (always show at least rungCount guide lines)
  const rungCount = cfg.rungCount ?? 10;
  const sortedRungs = [...rungs].sort((a, b) => a.number - b.number);
  // Build a map of rung index → Rung data (for descriptions, etc.)
  const rungByIndex = new Map<number, (typeof sortedRungs)[number]>();
  for (let i = 0; i < sortedRungs.length; i++) {
    rungByIndex.set(i, sortedRungs[i]);
  }
  const totalSlots = Math.max(rungCount, sortedRungs.length);

  // Rail top position for label placement (mm)
  const railTopY = firstRungY - 10;

  ctx.save();

  // Apply block offset for visual chrome
  const ox = blockPosition?.x ?? 0;
  const oy = blockPosition?.y ?? 0;
  if (ox !== 0 || oy !== 0) {
    ctx.translate(ox, oy);
  }

  // ---- Voltage label (above first rung, right of rung number area) ----
  if (voltage) {
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = t.ladderVoltageColor;
    ctx.fillText(voltage, railL1X - 3, railTopY);
  }

  // ---- Rung guide lines, numbers, and descriptions ----
  for (let ri = 0; ri < totalSlots; ri++) {
    const rung = rungByIndex.get(ri); // may be undefined for empty slots
    const rungY = firstRungY + ri * rungSpacing;

    // Horizontal rung guide line (subtle dots from L1 across the page)
    if (!hideRungGuides) {
      ctx.strokeStyle = t.ladderRungGuideColor;
      ctx.lineWidth = 0.3; // mm
      ctx.setLineDash([1, 2]);
      ctx.beginPath();
      ctx.moveTo(railL1X, rungY);
      ctx.lineTo(railL2X, rungY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Compute display rung number based on numbering scheme
    const storedNumber = rung?.number ?? (ri + 1);
    const displayNum = computeRungDisplayNumber(ri, storedNumber, pageNum, cfg);

    // Rung number (left margin, to the left of L1 rail)
    ctx.font = 'bold 3.5px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.ladderRungNumberColor;
    ctx.fillText(String(displayNum), railL1X - 3, rungY);

    // Rung description (right of rung number area)
    if (rung?.description) {
      ctx.font = '3px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.ladderRungDescColor;
      const desc = rung.description;
      if (desc.length > 30) {
        const mid = desc.lastIndexOf(' ', 30);
        const line1 = mid > 0 ? desc.slice(0, mid) : desc.slice(0, 30);
        const line2 = mid > 0 ? desc.slice(mid + 1) : desc.slice(30);
        ctx.fillText(line1, railL1X + 3, rungY - 1.5);
        ctx.fillText(line2, railL1X + 3, rungY + 1.5);
      } else {
        ctx.fillText(desc, railL1X + 3, rungY);
      }
    }
  }

  ctx.restore();
}

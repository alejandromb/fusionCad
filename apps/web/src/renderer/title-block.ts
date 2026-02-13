/**
 * Title block and sheet border renderer
 */

import type { Sheet } from '@fusion-cad/core-model';
import { getTheme } from './theme';

// Sheet dimensions in pixels (at 1:1 scale)
// Standard engineering drawing sizes
export const SHEET_SIZES: Record<string, { width: number; height: number }> = {
  'A4': { width: 1123, height: 794 },      // 297mm x 210mm
  'A3': { width: 1587, height: 1123 },     // 420mm x 297mm
  'A2': { width: 2245, height: 1587 },     // 594mm x 420mm
  'A1': { width: 3179, height: 2245 },     // 841mm x 594mm
  'A0': { width: 4494, height: 3179 },     // 1189mm x 841mm
  'Letter': { width: 1056, height: 816 },  // 11" x 8.5"
  'ANSI-D': { width: 2592, height: 1728 }, // 34" x 22"
};

const BORDER_MARGIN = 20;
const TITLE_BLOCK_HEIGHT = 80;
const TITLE_BLOCK_WIDTH = 400;

/**
 * Render sheet border and title block
 */
export function renderTitleBlock(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet
): void {
  const size = SHEET_SIZES[sheet.size] || SHEET_SIZES['Letter'];
  const t = getTheme();

  // Draw sheet background
  ctx.fillStyle = t.titleBlockBg;
  ctx.fillRect(0, 0, size.width, size.height);

  // Draw border
  ctx.strokeStyle = t.titleBlockBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(BORDER_MARGIN, BORDER_MARGIN, size.width - BORDER_MARGIN * 2, size.height - BORDER_MARGIN * 2);

  // Draw title block in bottom-right corner
  const tbX = size.width - BORDER_MARGIN - TITLE_BLOCK_WIDTH;
  const tbY = size.height - BORDER_MARGIN - TITLE_BLOCK_HEIGHT;

  ctx.strokeStyle = t.titleBlockDivider;
  ctx.lineWidth = 1;
  ctx.strokeRect(tbX, tbY, TITLE_BLOCK_WIDTH, TITLE_BLOCK_HEIGHT);

  // Horizontal dividers
  ctx.beginPath();
  ctx.moveTo(tbX, tbY + 30);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH, tbY + 30);
  ctx.moveTo(tbX, tbY + 55);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH, tbY + 55);
  ctx.stroke();

  // Vertical divider
  ctx.beginPath();
  ctx.moveTo(tbX + TITLE_BLOCK_WIDTH / 2, tbY + 30);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH / 2, tbY + 55);
  ctx.stroke();

  const titleBlock = sheet.titleBlock;
  ctx.textBaseline = 'middle';

  // Title row (top)
  ctx.fillStyle = t.titleBlockTitleColor;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    titleBlock?.title || sheet.name,
    tbX + TITLE_BLOCK_WIDTH / 2,
    tbY + 15
  );

  // Drawing number + revision
  ctx.font = '11px monospace';
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.textAlign = 'left';
  ctx.fillText(`Dwg: ${titleBlock?.drawingNumber || '---'}`, tbX + 8, tbY + 42);
  ctx.fillText(`Rev: ${titleBlock?.revision || '---'}`, tbX + TITLE_BLOCK_WIDTH / 2 + 8, tbY + 42);

  // Date + drawn by
  ctx.fillText(`Date: ${titleBlock?.date || '---'}`, tbX + 8, tbY + 67);
  ctx.fillText(`By: ${titleBlock?.drawnBy || '---'}`, tbX + TITLE_BLOCK_WIDTH / 2 + 8, tbY + 67);

  // Sheet number in bottom-right
  if (titleBlock?.sheetOf) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = t.titleBlockSheetColor;
    ctx.fillText(`Sheet ${titleBlock.sheetOf}`, tbX + TITLE_BLOCK_WIDTH - 8, tbY + TITLE_BLOCK_HEIGHT - 8);
  }
}

/**
 * Get the drawable area inside the border (for centering content)
 */
export function getDrawableArea(sheetSize: string): { x: number; y: number; width: number; height: number } {
  const size = SHEET_SIZES[sheetSize] || SHEET_SIZES['Letter'];
  return {
    x: BORDER_MARGIN,
    y: BORDER_MARGIN,
    width: size.width - BORDER_MARGIN * 2,
    height: size.height - BORDER_MARGIN * 2 - TITLE_BLOCK_HEIGHT,
  };
}

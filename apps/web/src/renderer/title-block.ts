/**
 * Title block and sheet border renderer
 */

import type { Sheet } from '@fusion-cad/core-model';
import { SHEET_SIZES_MM, LAYOUT_MM } from '@fusion-cad/core-model';
import { getTheme } from './theme';

// Sheet dimensions in mm (metric coordinates)
export const SHEET_SIZES: Record<string, { width: number; height: number }> = SHEET_SIZES_MM;

const BORDER_MARGIN = LAYOUT_MM.borderMargin;        // 5mm
const TITLE_BLOCK_HEIGHT = LAYOUT_MM.titleBlockHeight; // 20mm
const TITLE_BLOCK_WIDTH = LAYOUT_MM.titleBlockWidth;   // 100mm

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
  ctx.lineWidth = 0.25;
  ctx.strokeRect(BORDER_MARGIN, BORDER_MARGIN, size.width - BORDER_MARGIN * 2, size.height - BORDER_MARGIN * 2);

  // Draw title block in bottom-right corner
  const tbX = size.width - BORDER_MARGIN - TITLE_BLOCK_WIDTH;
  const tbY = size.height - BORDER_MARGIN - TITLE_BLOCK_HEIGHT;

  ctx.strokeStyle = t.titleBlockDivider;
  ctx.lineWidth = 0.25;
  ctx.strokeRect(tbX, tbY, TITLE_BLOCK_WIDTH, TITLE_BLOCK_HEIGHT);

  // Horizontal dividers — title block is 20mm tall, divide into 3 rows
  const row1Y = tbY + 7.5;   // below title row
  const row2Y = tbY + 13.75; // below fields row
  ctx.beginPath();
  ctx.moveTo(tbX, row1Y);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH, row1Y);
  ctx.moveTo(tbX, row2Y);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH, row2Y);
  ctx.stroke();

  // Vertical divider (middle column)
  ctx.beginPath();
  ctx.moveTo(tbX + TITLE_BLOCK_WIDTH / 2, row1Y);
  ctx.lineTo(tbX + TITLE_BLOCK_WIDTH / 2, row2Y);
  ctx.stroke();

  const titleBlock = sheet.titleBlock;
  ctx.textBaseline = 'middle';

  // Title row (top)
  ctx.fillStyle = t.titleBlockTitleColor;
  ctx.font = 'bold 3.5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    titleBlock?.title || sheet.name,
    tbX + TITLE_BLOCK_WIDTH / 2,
    tbY + 3.75
  );

  // Drawing number + revision
  ctx.font = '2.75px monospace';
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.textAlign = 'left';
  ctx.fillText(`Dwg: ${titleBlock?.drawingNumber || '---'}`, tbX + 2, tbY + 10.5);
  ctx.fillText(`Rev: ${titleBlock?.revision || '---'}`, tbX + TITLE_BLOCK_WIDTH / 2 + 2, tbY + 10.5);

  // Date + drawn by
  ctx.fillText(`Date: ${titleBlock?.date || '---'}`, tbX + 2, tbY + 16.75);
  ctx.fillText(`By: ${titleBlock?.drawnBy || '---'}`, tbX + TITLE_BLOCK_WIDTH / 2 + 2, tbY + 16.75);

  // Sheet number in bottom-right
  if (titleBlock?.sheetOf) {
    ctx.font = '2.5px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = t.titleBlockSheetColor;
    ctx.fillText(`Sheet ${titleBlock.sheetOf}`, tbX + TITLE_BLOCK_WIDTH - 2, tbY + TITLE_BLOCK_HEIGHT - 2);
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

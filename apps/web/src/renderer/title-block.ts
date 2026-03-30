/**
 * Title block and sheet border renderer
 *
 * Full-width title block at the bottom of the sheet, similar to
 * professional industrial schematics (NFPA 79, IEC 61082).
 *
 * Layout (left to right):
 * ┌──────────────┬──────────────────────────────┬──────────────────┐
 * │   Company    │   Title / Drawing Number      │   Rev / Sheet    │
 * │   Drawn By   │   Date                        │                  │
 * └──────────────┴──────────────────────────────┴──────────────────┘
 */

import type { Sheet } from '@fusion-cad/core-model';
import { SHEET_SIZES_MM, LAYOUT_MM } from '@fusion-cad/core-model';
import { getTheme } from './theme';

// Sheet dimensions in mm (metric coordinates)
export const SHEET_SIZES: Record<string, { width: number; height: number }> = SHEET_SIZES_MM;

const BORDER_MARGIN = LAYOUT_MM.borderMargin;          // 5mm
const TITLE_BLOCK_HEIGHT = LAYOUT_MM.titleBlockHeight;  // 20mm

/**
 * Render sheet border and full-width title block
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

  // Full-width title block at bottom of sheet
  const tbX = BORDER_MARGIN;
  const tbWidth = size.width - BORDER_MARGIN * 2;
  const tbY = size.height - BORDER_MARGIN - TITLE_BLOCK_HEIGHT;

  // Title block outer border
  ctx.strokeStyle = t.titleBlockDivider;
  ctx.lineWidth = 0.25;
  ctx.strokeRect(tbX, tbY, tbWidth, TITLE_BLOCK_HEIGHT);

  // Column widths: left (company) ~25%, center (title/info) ~50%, right (rev/sheet) ~25%
  const col1W = tbWidth * 0.22;
  const col3W = tbWidth * 0.22;
  const col2W = tbWidth - col1W - col3W;
  const col1X = tbX;
  const col2X = tbX + col1W;
  const col3X = tbX + col1W + col2W;

  // Vertical dividers
  ctx.beginPath();
  ctx.moveTo(col2X, tbY);
  ctx.lineTo(col2X, tbY + TITLE_BLOCK_HEIGHT);
  ctx.moveTo(col3X, tbY);
  ctx.lineTo(col3X, tbY + TITLE_BLOCK_HEIGHT);
  ctx.stroke();

  // Horizontal divider in center column (split into title row + info row)
  const midY = tbY + TITLE_BLOCK_HEIGHT * 0.5;
  ctx.beginPath();
  ctx.moveTo(col2X, midY);
  ctx.lineTo(col3X, midY);
  // Also split left and right columns
  ctx.moveTo(col1X, midY);
  ctx.lineTo(col2X, midY);
  ctx.moveTo(col3X, midY);
  ctx.lineTo(col3X + col3W, midY);
  ctx.stroke();

  const titleBlock = sheet.titleBlock;
  ctx.textBaseline = 'middle';

  // ---- LEFT COLUMN: Company + Drawn By ----
  ctx.fillStyle = t.titleBlockTitleColor;
  ctx.font = 'bold 3px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    titleBlock?.company || '',
    col1X + col1W / 2,
    tbY + TITLE_BLOCK_HEIGHT * 0.25
  );

  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = '2.5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Drawn: ${titleBlock?.drawnBy || '---'}`, col1X + 2, tbY + TITLE_BLOCK_HEIGHT * 0.75);

  // ---- CENTER COLUMN: Title (top) + Drawing #, Date (bottom) ----
  // Title — large, centered
  ctx.fillStyle = t.titleBlockTitleColor;
  ctx.font = 'bold 4px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    titleBlock?.title || sheet.name,
    col2X + col2W / 2,
    tbY + TITLE_BLOCK_HEIGHT * 0.25
  );

  // Bottom row: Dwg # left, Date right
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = '2.5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Dwg: ${titleBlock?.drawingNumber || '---'}`, col2X + 2, midY + TITLE_BLOCK_HEIGHT * 0.25);
  ctx.textAlign = 'right';
  ctx.fillText(`Date: ${titleBlock?.date || '---'}`, col3X - 2, midY + TITLE_BLOCK_HEIGHT * 0.25);

  // ---- RIGHT COLUMN: Revision (top) + Sheet # (bottom) ----
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = 'bold 3px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Rev: ${titleBlock?.revision || '---'}`,
    col3X + col3W / 2,
    tbY + TITLE_BLOCK_HEIGHT * 0.25
  );

  // Sheet number
  ctx.font = '2.5px monospace';
  ctx.fillStyle = t.titleBlockSheetColor;
  ctx.textAlign = 'center';
  if (titleBlock?.sheetOf) {
    ctx.fillText(`Sheet ${titleBlock.sheetOf}`, col3X + col3W / 2, midY + TITLE_BLOCK_HEIGHT * 0.25);
  }
}

/**
 * Get the drawable area inside the border (above the title block)
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

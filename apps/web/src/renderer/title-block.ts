/**
 * Title block and sheet border renderer
 *
 * Professional title block at the bottom of the sheet.
 *
 * Layout:
 * ┌──────────┬──────────────────┬──────────┬──────────┬───────────┬──────────────────┐
 * │          │ DATE             │ DRAWN BY │ REV      │           │                  │
 * │ PROPRI-  │ 04/07/2026       │ J. Doe   │ A        │           │   Company/Logo   │
 * │ ETARY    ├──────────────────┼──────────┼──────────┼───────────┤                  │
 * │ NOTICE   │ TITLE            │PROJECT # │DRAWING # │ SHEET #   │   TEL: xxx       │
 * │          │ Drawing Name     │ 000000   │ 000000   │ 1         │                  │
 * └──────────┴──────────────────┴──────────┴──────────┴───────────┴──────────────────┘
 */

import type { Sheet } from '@fusion-cad/core-model';
import { SHEET_SIZES_MM, LAYOUT_MM } from '@fusion-cad/core-model';
import { getTheme } from './theme';

export const SHEET_SIZES: Record<string, { width: number; height: number }> = SHEET_SIZES_MM;

const BORDER_MARGIN = LAYOUT_MM.borderMargin;          // 5mm
const TITLE_BLOCK_HEIGHT = LAYOUT_MM.titleBlockHeight;  // 20mm

// Cache for decoded logo image
const logoImageCache = new Map<string, HTMLImageElement>();

export interface ProjectTitleBlock {
  company?: string;
  addressLine1?: string;
  addressLine2?: string;
  phone?: string;
  drawnBy?: string;
  date?: string;
  revision?: string;
  projectNumber?: string;
  logoData?: string;
}

/**
 * Render sheet border and title block
 */
export function renderTitleBlock(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  projectTitleBlock?: ProjectTitleBlock
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

  // Title block dimensions
  const tbX = BORDER_MARGIN;
  const tbWidth = size.width - BORDER_MARGIN * 2;
  const tbY = size.height - BORDER_MARGIN - TITLE_BLOCK_HEIGHT;
  const tbH = TITLE_BLOCK_HEIGHT;
  const midY = tbY + tbH * 0.5;

  // Merge: project-level fields override sheet-level for shared values.
  // Sheet-level retains: title, drawingNumber, sheetOf
  const sheetTb = sheet.titleBlock;
  const tb = {
    ...sheetTb,
    company: projectTitleBlock?.company ?? sheetTb?.company,
    addressLine1: projectTitleBlock?.addressLine1 ?? sheetTb?.addressLine1,
    addressLine2: projectTitleBlock?.addressLine2 ?? sheetTb?.addressLine2,
    phone: projectTitleBlock?.phone ?? sheetTb?.phone,
    drawnBy: projectTitleBlock?.drawnBy ?? sheetTb?.drawnBy,
    date: projectTitleBlock?.date ?? sheetTb?.date,
    revision: projectTitleBlock?.revision ?? sheetTb?.revision,
    projectNumber: projectTitleBlock?.projectNumber ?? sheetTb?.projectNumber,
    logoData: projectTitleBlock?.logoData ?? sheetTb?.logoData,
  };
  const companyName = tb?.company || 'FusionLogik';

  // Column layout: Notice (15%) | Info (55%) | Company (30%)
  const noticeW = tbWidth * 0.15;
  const companyW = tbWidth * 0.28;
  const infoW = tbWidth - noticeW - companyW;

  const noticeX = tbX;
  const infoX = tbX + noticeW;
  const companyX = tbX + noticeW + infoW;

  // Info sub-columns: Title (~42%), field1 (~18%), field2 (~18%), field3 (~22%)
  const titleColW = infoW * 0.42;
  const field1W = infoW * 0.20;
  const field2W = infoW * 0.20;
  const field3W = infoW - titleColW - field1W - field2W;

  const titleColX = infoX;
  const field1X = infoX + titleColW;
  const field2X = field1X + field1W;
  const field3X = field2X + field2W;

  ctx.strokeStyle = t.titleBlockDivider;
  ctx.lineWidth = 0.25;

  // Outer border
  ctx.strokeRect(tbX, tbY, tbWidth, tbH);

  // Notice column right divider (full height)
  ctx.beginPath();
  ctx.moveTo(infoX, tbY);
  ctx.lineTo(infoX, tbY + tbH);
  ctx.stroke();

  // Info column vertical dividers
  ctx.beginPath();
  ctx.moveTo(field1X, tbY);
  ctx.lineTo(field1X, tbY + tbH);
  ctx.moveTo(field2X, tbY);
  ctx.lineTo(field2X, tbY + tbH);
  ctx.moveTo(field3X, midY); // sheet # only in bottom row
  ctx.lineTo(field3X, tbY + tbH);
  ctx.stroke();

  // Company block divider (full height, slightly thicker)
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(companyX, tbY);
  ctx.lineTo(companyX, tbY + tbH);
  ctx.stroke();
  ctx.lineWidth = 0.25;

  // Horizontal mid-line (info area only, not notice or company)
  ctx.beginPath();
  ctx.moveTo(infoX, midY);
  ctx.lineTo(companyX, midY);
  ctx.stroke();

  // ── PROPRIETARY NOTICE (left column, full height) ──
  ctx.save();
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = '1.4px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const noticeText = `THIS DOCUMENT IS THE PROPERTY OF ${companyName.toUpperCase()} AND/OR ITS CUSTOMER(S). ` +
    `REPRODUCTION WITHOUT WRITTEN CONSENT IS PROHIBITED.`;
  // Word-wrap into the notice column
  const noticePad = 1.5;
  const noticeMaxW = noticeW - noticePad * 2;
  const words = noticeText.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > noticeMaxW && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineH = 2;
  const noticeStartY = tbY + (tbH - lines.length * lineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], noticeX + noticePad, noticeStartY + i * lineH);
  }
  ctx.restore();

  // ── Cell helper ──
  const labelSize = 1.8;
  const valueSize = 2.8;
  const cellPad = 1.5;
  const labelOffY = 3;

  const drawCell = (x: number, y: number, w: number, label: string, value: string, largeFontSize?: number) => {
    ctx.fillStyle = t.titleBlockFieldColor;
    ctx.font = `${labelSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + cellPad, y + 1);

    ctx.fillStyle = t.titleBlockTitleColor;
    ctx.font = `bold ${largeFontSize || valueSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const maxW = w - cellPad * 2;
    let text = value;
    while (ctx.measureText(text).width > maxW && text.length > 1) {
      text = text.slice(0, -1);
    }
    ctx.fillText(text, x + cellPad, y + labelOffY);
  };

  // ── ROW 1 (top) ──
  drawCell(titleColX, tbY, titleColW, 'DATE', tb?.date || new Date().toLocaleDateString('en-US'));
  drawCell(field1X, tbY, field1W, 'DRAWN BY', tb?.drawnBy || '---');
  drawCell(field2X, tbY, field2W + field3W, 'REV', tb?.revision || '---');

  // ── ROW 2 (bottom) ──
  drawCell(titleColX, midY, titleColW, 'TITLE', tb?.title || sheet.name, 3.2);
  drawCell(field1X, midY, field1W, 'PROJECT NO.', tb?.projectNumber || '---');
  drawCell(field2X, midY, field2W, 'DRAWING NO.', tb?.drawingNumber || '---');
  drawCell(field3X, midY, companyX - field3X, 'SHEET NO.', tb?.sheetOf || `${sheet.number}`);

  // ── COMPANY BLOCK (right side, full height) ──
  const compCenterX = companyX + companyW / 2;
  const compPad = 2;

  // Company name — rendered as styled text (crisp at any zoom/theme)
  const phoneReserve = tb?.phone ? 4 : 0;
  const nameY = tbY + (tbH - phoneReserve) * 0.38;

  ctx.fillStyle = t.titleBlockTitleColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Stylized company name: cursive "f" + regular "usionLogik"
  if (companyName.toLowerCase() === 'fusionlogik') {
    // Cursive "f" in italic serif
    const fSize = 7;
    const restSize = 5;
    ctx.font = `italic ${fSize}px Georgia, serif`;
    const fWidth = ctx.measureText('f').width;
    ctx.font = `bold ${restSize}px monospace`;
    const restWidth = ctx.measureText('usionLogik').width;
    const totalWidth = fWidth + restWidth;
    const startX = compCenterX - totalWidth / 2;

    ctx.font = `italic ${fSize}px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText('f', startX, nameY);

    ctx.font = `bold ${restSize}px monospace`;
    ctx.fillText('usionLogik', startX + fWidth, nameY);
  } else {
    ctx.font = 'bold 5px monospace';
    ctx.fillText(companyName, compCenterX, nameY);
  }

  // Address lines below company name
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = '2.2px monospace';
  ctx.textAlign = 'center';
  if (tb?.addressLine1) ctx.fillText(tb.addressLine1, compCenterX, nameY + 5);
  if (tb?.addressLine2) ctx.fillText(tb.addressLine2, compCenterX, nameY + 8);

  // Phone — always at bottom of company block
  ctx.fillStyle = t.titleBlockFieldColor;
  ctx.font = '2.2px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tb?.phone ? `TEL: ${tb.phone}` : '', compCenterX, tbY + tbH * 0.85);
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

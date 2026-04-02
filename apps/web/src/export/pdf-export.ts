/**
 * PDF Export
 *
 * Renders circuit to an offscreen canvas with print-quality styling,
 * then converts to a downloadable PDF.
 *
 * Uses a minimal PDF generator (no external deps) that embeds the canvas as a JPEG image.
 */

import type { CircuitData } from '../renderer/circuit-renderer';
import { renderCircuit } from '../renderer/circuit-renderer';
import type { Point, DeviceTransform } from '../renderer/types';
import { getTheme, setTheme, type ThemeData } from '../renderer/theme';
import { SHEET_SIZES } from '../renderer/title-block';
import { MM_TO_PX } from '@fusion-cad/core-model';

interface PDFExportOptions {
  /** Page width in mm (default 420 for A3) */
  pageWidth?: number;
  /** Page height in mm (default 297 for A3) */
  pageHeight?: number;
  /** DPI for rasterization (default 150) */
  dpi?: number;
  /** Device transforms */
  deviceTransforms?: Map<string, DeviceTransform>;
  /** Title for the drawing */
  title?: string;
  /** Active sheet ID */
  activeSheetId?: string;
  /** Display settings */
  showDescriptions?: boolean;
  showPinLabels?: boolean;
}

/**
 * Export circuit to PDF and trigger download
 */
export async function exportToPDF(
  circuit: CircuitData,
  positions: Map<string, Point>,
  options: PDFExportOptions & { allSheets?: boolean } = {}
): Promise<void> {
  const { deviceTransforms, title = 'fusionCad Drawing', activeSheetId, allSheets, showDescriptions, showPinLabels } = options;

  // Determine which sheets to export
  const sheetIds = allSheets
    ? (circuit.sheets || []).map(s => s.id)
    : [activeSheetId || circuit.sheets?.[0]?.id || 'sheet-1'];

  // Render each sheet with print theme using renderSheetForPrint
  const pages: { imageData: string; width: number; height: number }[] = [];

  for (const sid of sheetIds) {
    const canvas = renderSheetForPrint(circuit, positions, sid, deviceTransforms, 2.0);
    if (canvas) {
      pages.push({
        imageData: canvas.toDataURL('image/jpeg', 0.92),
        width: canvas.width,
        height: canvas.height,
      });
    }
  }

  if (pages.length === 0) return;

  // Get page size in mm from first sheet
  const firstSheet = circuit.sheets?.find(s => s.id === sheetIds[0]);
  const sheetSize = SHEET_SIZES[firstSheet?.size || 'Tabloid'] || SHEET_SIZES['Tabloid'];
  // Sheet sizes are already in mm
  const pageWidthMm = sheetSize.width;
  const pageHeightMm = sheetSize.height;

  // Generate multi-page PDF
  const pdf = generateMultiPagePDF(pages, pageWidthMm, pageHeightMm);

  // Download
  const blob = new Blob([pdf as unknown as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Create a print-friendly theme: white background, black symbols/wires.
 */
function createPrintTheme(baseTheme: ThemeData): ThemeData {
  // Override only colors for print — sizes/fonts are already mm-based in the base theme
  const blackWires = new Array(11).fill('#000000');
  return {
    ...baseTheme,
    canvasBg: '#ffffff',
    gridDotColor: 'rgba(0,0,0,0)',
    symbolStroke: '#000000',
    symbolTextFill: '#000000',
    pinDotColor: '#333333',
    pinLabelColor: '#444444',
    tagColor: '#000000',
    partLabelColor: '#333333',
    wireColors: blackWires,
    wireLabelBg: 'rgba(255,255,255,0.9)',
    wireEndpointColor: '#333333',
    annotationColor: '#000000',
    junctionFill: '#000000',
    ladderRailLabelColor: '#000000',
    ladderRailLineColor: '#000000',
    ladderVoltageColor: '#000000',
    ladderRungGuideColor: 'rgba(0,0,0,0)',
    ladderRungNumberColor: '#000000',
    ladderRungDescColor: '#333333',
    titleBlockBg: '#ffffff',
    titleBlockBorder: '#000000',
    titleBlockDivider: '#000000',
    titleBlockTitleColor: '#000000',
    titleBlockFieldColor: '#333333',
    titleBlockSheetColor: '#333333',
  };
}

/**
 * Render a single sheet to an offscreen canvas at the sheet's native size.
 * Uses print theme (white bg, black lines) and includes title block/border.
 */
function renderSheetForPrint(
  circuit: CircuitData,
  positions: Map<string, Point>,
  sheetId: string,
  deviceTransforms?: Map<string, DeviceTransform>,
  scaleFactor = 1.5,
  displayOptions?: { showDescriptions?: boolean; showPinLabels?: boolean },
): HTMLCanvasElement | null {
  const sheetSize = SHEET_SIZES[
    circuit.sheets?.find(s => s.id === sheetId)?.size || 'Tabloid'
  ] || SHEET_SIZES['Tabloid'];

  // Canvas size = mm * MM_TO_PX * scaleFactor
  // renderCircuit internally applies: viewport.scale * MM_TO_PX as the canvas scale
  const pxWidth = Math.round(sheetSize.width * MM_TO_PX * scaleFactor);
  const pxHeight = Math.round(sheetSize.height * MM_TO_PX * scaleFactor);

  const canvas = document.createElement('canvas');
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Switch to print theme
  const originalTheme = getTheme();
  setTheme(createPrintTheme(originalTheme));

  try {
    renderCircuit(ctx, circuit, { offsetX: 0, offsetY: 0, scale: scaleFactor }, false, positions, {
      selectedDevices: [],
      selectedWireIndex: null,
      wireStart: null,
      activeSheetId: sheetId,
      deviceTransforms,
      showGrid: false,
      showDescriptions: displayOptions?.showDescriptions,
      showPinLabels: displayOptions?.showPinLabels,
    });
  } finally {
    setTheme(originalTheme);
  }

  return canvas;
}

/**
 * Print sheet(s) via browser print dialog.
 * Renders with print theme (white background, black lines, title block).
 *
 * Options:
 * - `allSheets: true` — print all sheets as separate pages
 * - Default: prints the active sheet only
 */
export async function printSheet(
  circuit: CircuitData,
  positions: Map<string, Point>,
  options: PDFExportOptions & { allSheets?: boolean } = {}
): Promise<void> {
  const { deviceTransforms, title = 'fusionCad Drawing', activeSheetId, allSheets, showDescriptions, showPinLabels } = options;

  const sheetIds = allSheets
    ? (circuit.sheets || []).map(s => s.id)
    : [activeSheetId || circuit.sheets?.[0]?.id || 'sheet-1'];

  const images: string[] = [];
  for (const sid of sheetIds) {
    const canvas = renderSheetForPrint(circuit, positions, sid, deviceTransforms, undefined, { showDescriptions, showPinLabels });
    if (canvas) images.push(canvas.toDataURL('image/png'));
  }

  if (images.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const pagesHtml = images.map(img =>
    `<div class="page"><img src="${img}" /></div>`
  ).join('\n');

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @page { size: landscape; margin: 0; }
    @media print { .toolbar { display: none !important; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #888; }
    .toolbar { background: #333; color: white; padding: 8px 16px; text-align: center; position: sticky; top: 0; z-index: 10; }
    .toolbar button { padding: 6px 16px; margin: 0 4px; font-size: 14px; cursor: pointer; border: none; border-radius: 4px; }
    .toolbar .print-btn { background: #2070B0; color: white; }
    .toolbar .close-btn { background: #666; color: white; }
    .page { background: white; margin: 8px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.3); page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .page img { width: 100%; display: block; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print-btn" onclick="window.print()">Print ${images.length} Sheet${images.length > 1 ? 's' : ''}</button>
    <button class="close-btn" onclick="window.close()">Close</button>
  </div>
  ${pagesHtml}
</body>
</html>`);
  printWindow.document.close();
}

/**
 * Generate a multi-page PDF with one JPEG image per page.
 * No external dependencies — builds the PDF binary format directly.
 */
function generateMultiPagePDF(
  pages: { imageData: string; width: number; height: number }[],
  pageWidthMm: number,
  pageHeightMm: number
): Uint8Array {
  const mmToPoints = 72 / 25.4;
  const pageW = Math.round(pageWidthMm * mmToPoints);
  const pageH = Math.round(pageHeightMm * mmToPoints);

  const encoder = new TextEncoder();
  const parts: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;
  let objNum = 1;

  const addString = (s: string) => { parts.push(s); currentOffset += encoder.encode(s).length; };
  const markObject = () => { offsets.push(currentOffset); return objNum++; };

  // Header
  addString('%PDF-1.4\n');

  // Object 1: Catalog
  const catalogObj = markObject();
  addString(`${catalogObj} 0 obj\n<< /Type /Catalog /Pages ${catalogObj + 1} 0 R >>\nendobj\n`);

  // Object 2: Pages (will reference all page objects)
  const pagesObj = markObject();
  const pageObjNums: number[] = [];

  // Reserve object numbers for pages
  // Each page needs: Page obj + Content stream obj + Image obj = 3 objects per page
  const firstPageObj = objNum;
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(firstPageObj + i * 3);
  }

  const kidsStr = pageObjNums.map(n => `${n} 0 R`).join(' ');
  addString(`${pagesObj} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pages.length} >>\nendobj\n`);

  // Generate each page
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const base64 = page.imageData.split(',')[1];
    const binaryString = atob(base64);
    const imageBytes = new Uint8Array(binaryString.length);
    for (let j = 0; j < binaryString.length; j++) {
      imageBytes[j] = binaryString.charCodeAt(j);
    }

    // Page object
    const pageObj = markObject();
    const contentObj = pageObj + 1;
    const imgObj = pageObj + 2;
    addString(`${pageObj} 0 obj\n<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentObj} 0 R /Resources << /XObject << /Img${i} ${imgObj} 0 R >> >> >>\nendobj\n`);

    // Content stream
    const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Img${i} Do\nQ\n`;
    markObject();
    addString(`${contentObj} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

    // Image XObject
    markObject();
    addString(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    parts.push(imageBytes);
    currentOffset += imageBytes.length;
    addString('\nendstream\nendobj\n');
  }

  // Cross-reference table
  const xrefOffset = currentOffset;
  addString('xref\n');
  addString(`0 ${offsets.length + 1}\n`);
  addString('0000000000 65535 f \n');
  for (const offset of offsets) {
    addString(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }

  // Trailer
  addString('trailer\n');
  addString(`<< /Size ${offsets.length + 1} /Root ${catalogObj} 0 R >>\n`);
  addString('startxref\n');
  addString(`${xrefOffset}\n`);
  addString('%%EOF\n');

  // Combine
  let totalLength = 0;
  const encoded: Uint8Array[] = parts.map(p => {
    if (typeof p === 'string') { const e = encoder.encode(p); totalLength += e.length; return e; }
    totalLength += p.length; return p;
  });
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of encoded) { result.set(chunk, pos); pos += chunk.length; }
  return result;
}

/** @deprecated Use generateMultiPagePDF instead */
function generateMinimalPDF(
  jpegDataUrl: string,
  imgWidth: number,
  imgHeight: number,
  pageWidthMm: number,
  pageHeightMm: number
): Uint8Array {
  // Convert data URL to binary
  const base64 = jpegDataUrl.split(',')[1];
  const binaryString = atob(base64);
  const imageBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    imageBytes[i] = binaryString.charCodeAt(i);
  }

  // PDF units: 1 point = 1/72 inch
  const mmToPoints = 72 / 25.4;
  const pageW = Math.round(pageWidthMm * mmToPoints);
  const pageH = Math.round(pageHeightMm * mmToPoints);

  const encoder = new TextEncoder();
  const parts: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const addString = (s: string) => {
    parts.push(s);
    currentOffset += encoder.encode(s).length;
  };

  const markObject = () => {
    offsets.push(currentOffset);
  };

  // Header
  addString('%PDF-1.4\n');

  // Object 1: Catalog
  markObject();
  addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  markObject();
  addString(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);

  // Object 3: Page
  markObject();
  addString(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>\nendobj\n`);

  // Object 4: Content stream (draw the image)
  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Img Do\nQ\n`;
  markObject();
  addString(`4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  // Object 5: Image XObject
  markObject();
  addString(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  parts.push(imageBytes);
  currentOffset += imageBytes.length;
  addString('\nendstream\nendobj\n');

  // Cross-reference table
  const xrefOffset = currentOffset;
  addString('xref\n');
  addString(`0 ${offsets.length + 1}\n`);
  addString('0000000000 65535 f \n');
  for (const offset of offsets) {
    addString(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }

  // Trailer
  addString('trailer\n');
  addString(`<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`);
  addString('startxref\n');
  addString(`${xrefOffset}\n`);
  addString('%%EOF\n');

  // Combine all parts into a single Uint8Array
  let totalLength = 0;
  const encoded: Uint8Array[] = parts.map(p => {
    if (typeof p === 'string') {
      const e = encoder.encode(p);
      totalLength += e.length;
      return e;
    }
    totalLength += p.length;
    return p;
  });

  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of encoded) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
}

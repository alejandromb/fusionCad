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
import type { Point, Viewport, DeviceTransform } from '../renderer/types';
import { getTheme, setTheme, type ThemeData } from '../renderer/theme';
import { SHEET_SIZES } from '../renderer/title-block';

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
}

/**
 * Export circuit to PDF and trigger download
 */
export async function exportToPDF(
  circuit: CircuitData,
  positions: Map<string, Point>,
  options: PDFExportOptions = {}
): Promise<void> {
  const {
    pageWidth = 432,  // Tabloid width in mm (17")
    pageHeight = 279,  // Tabloid height in mm (11")
    dpi = 150,
    deviceTransforms,
    title = 'fusionCad Drawing',
    activeSheetId,
  } = options;

  // Convert mm to pixels at given DPI
  const mmToInch = 1 / 25.4;
  const pxWidth = Math.round(pageWidth * mmToInch * dpi);
  const pxHeight = Math.round(pageHeight * mmToInch * dpi);

  // Calculate content bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const filteredDevices = activeSheetId
    ? circuit.devices.filter(d => d.sheetId === activeSheetId)
    : circuit.devices;

  for (const device of filteredDevices) {
    const pos = positions.get(device.id);
    if (!pos) continue;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + 100); // Approximate max width
    maxY = Math.max(maxY, pos.y + 100);
  }

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 800; maxY = 600;
  }

  const padding = 40;
  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;

  // Calculate scale to fit content in page
  const scaleX = pxWidth / contentW;
  const scaleY = pxHeight / contentH;
  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to leave margin

  const viewport: Viewport = {
    offsetX: (pxWidth - contentW * scale) / 2 - minX * scale + padding * scale,
    offsetY: (pxHeight - contentH * scale) / 2 - minY * scale + padding * scale,
    scale,
  };

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = pxWidth;
  canvas.height = pxHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');

  // White background for print
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pxWidth, pxHeight);

  // Override render colors for print mode
  // The renderer uses green on dark - we need to override this.
  // For now, render normally and the SVG export handles print mode better.
  // For PDF, we render the circuit then invert/adjust colors.

  renderCircuit(ctx, circuit, viewport, false, positions, {
    selectedDevices: [],
    selectedWireIndex: null,
    wireStart: null,
    activeSheetId,
    deviceTransforms,
    showGrid: false,
  });

  // Add title text at top
  ctx.fillStyle = '#000000';
  ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(title, pxWidth / 2, 20 * scale);

  // Convert canvas to JPEG data URL
  const imageData = canvas.toDataURL('image/jpeg', 0.92);

  // Generate minimal PDF
  const pdf = generateMinimalPDF(imageData, pxWidth, pxHeight, pageWidth, pageHeight);

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
  return {
    ...baseTheme,
    canvasBg: '#ffffff',
    gridDotColor: 'rgba(0,0,0,0)',
    symbolStroke: '#000000',
    symbolStrokeWidth: 2,
    symbolTextFill: '#000000',
    pinDotColor: '#333333',
    pinDotRadius: 2,
    pinLabelColor: '#444444',
    tagColor: '#000000',
    tagFont: 'bold 12px monospace',
    partLabelColor: '#333333',
    wireWidth: 1.5,
    wireColors: ['#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000','#000000'],
    wireLabelBg: 'rgba(255,255,255,0.9)',
    wireLabelFont: '8px monospace',
    wireEndpointColor: '#333333',
    wireEndpointRadius: 2,
    annotationColor: '#000000',
    junctionFill: '#000000',
    ladderRailLabelColor: '#000000',
    ladderRailLineColor: '#000000',
    ladderVoltageColor: '#000000',
    ladderRungGuideColor: 'rgba(0,0,0,0.15)',
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
): HTMLCanvasElement | null {
  const sheetSize = SHEET_SIZES[
    circuit.sheets?.find(s => s.id === sheetId)?.size || 'Tabloid'
  ] || SHEET_SIZES['Tabloid'];

  const pxWidth = Math.round(sheetSize.width * scaleFactor);
  const pxHeight = Math.round(sheetSize.height * scaleFactor);

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
  const { deviceTransforms, title = 'fusionCad Drawing', activeSheetId, allSheets } = options;

  const sheetIds = allSheets
    ? (circuit.sheets || []).map(s => s.id)
    : [activeSheetId || circuit.sheets?.[0]?.id || 'sheet-1'];

  const images: string[] = [];
  for (const sid of sheetIds) {
    const canvas = renderSheetForPrint(circuit, positions, sid, deviceTransforms);
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
 * Generate a minimal PDF containing a single JPEG image.
 * This avoids any external PDF library dependency.
 */
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

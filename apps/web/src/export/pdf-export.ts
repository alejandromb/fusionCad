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
    pageWidth = 420,
    pageHeight = 297,
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
    const pos = positions.get(device.tag);
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

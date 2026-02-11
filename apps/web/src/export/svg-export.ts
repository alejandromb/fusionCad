/**
 * SVG Export
 *
 * Generates an SVG document from circuit data.
 * Reuses SVG path data already defined in symbol definitions.
 */

import type { Part, SymbolPrimitive } from '@fusion-cad/core-model';
import { getSymbolDefinition } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { Point, DeviceTransform } from '../renderer/types';

interface SVGExportOptions {
  /** White background for print (default true) */
  printMode?: boolean;
  /** Include grid (default false) */
  showGrid?: boolean;
  /** Page width in mm (default 420 for A3) */
  pageWidth?: number;
  /** Page height in mm (default 297 for A3) */
  pageHeight?: number;
  /** Device transforms for rotation/mirror */
  deviceTransforms?: Map<string, DeviceTransform>;
}

/**
 * Export circuit to SVG string
 */
export function exportToSVG(
  circuit: CircuitData,
  positions: Map<string, Point>,
  options: SVGExportOptions = {}
): string {
  const {
    printMode = true,
    pageWidth = 420,
    pageHeight = 297,
    deviceTransforms,
  } = options;

  const partMap = new Map<string, Part>();
  for (const part of circuit.parts) {
    partMap.set(part.id, part);
  }

  // Calculate bounding box of all content
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const device of circuit.devices) {
    const pos = positions.get(device.tag);
    if (!pos) continue;
    const part = device.partId ? partMap.get(device.partId) : null;
    const def = getSymbolDefinition(part?.category || 'unknown');
    const w = def?.geometry.width || 40;
    const h = def?.geometry.height || 40;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + w);
    maxY = Math.max(maxY, pos.y + h);
  }

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = pageWidth; maxY = pageHeight;
  }

  const padding = 30;
  const viewMinX = minX - padding;
  const viewMinY = minY - padding;
  const viewW = (maxX - minX) + padding * 2;
  const viewH = (maxY - minY) + padding * 2;

  const strokeColor = printMode ? '#000000' : '#00ff00';
  const bgColor = printMode ? '#ffffff' : '#1a1a1a';
  const textColor = printMode ? '#000000' : '#e0e0e0';
  const wireColors = printMode
    ? ['#cc0000', '#0066cc', '#006600', '#cc6600', '#660099', '#cc0066']
    : ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FFD93D'];

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewMinX} ${viewMinY} ${viewW} ${viewH}" width="${pageWidth}mm" height="${pageHeight}mm">`);
  lines.push(`  <rect x="${viewMinX}" y="${viewMinY}" width="${viewW}" height="${viewH}" fill="${bgColor}"/>`);

  // Render devices
  for (const device of circuit.devices) {
    const pos = positions.get(device.tag);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const category = part?.category || 'unknown';
    const def = getSymbolDefinition(category);
    if (!def) continue;

    const transform = deviceTransforms?.get(device.tag);
    const rotation = transform?.rotation || 0;
    const mirrorH = transform?.mirrorH || false;

    // Symbol group with optional transform
    let transformAttr = '';
    if (rotation !== 0 || mirrorH) {
      const cx = pos.x + def.geometry.width / 2;
      const cy = pos.y + def.geometry.height / 2;
      const parts: string[] = [];
      parts.push(`translate(${cx},${cy})`);
      if (mirrorH) parts.push(`scale(-1,1)`);
      if (rotation) parts.push(`rotate(${rotation})`);
      parts.push(`translate(${-cx},${-cy})`);
      transformAttr = ` transform="${parts.join(' ')}"`;
    }

    lines.push(`  <g id="dev-${device.tag}"${transformAttr}>`);

    // Render symbol: primitives (preferred) -> paths (legacy) -> fallback
    if (def.primitives && def.primitives.length > 0) {
      for (const prim of def.primitives) {
        lines.push(`    ${primitiveToSVGString(prim, strokeColor, pos.x, pos.y)}`);
      }
    } else if (def.paths) {
      for (const path of def.paths) {
        const sw = path.strokeWidth ?? 2;
        const fill = path.fill ? strokeColor : 'none';
        const stroke = path.stroke !== false ? strokeColor : 'none';
        // Translate path to device position
        lines.push(`    <path d="${path.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="translate(${pos.x},${pos.y})"/>`);
      }
    } else {
      // Fallback: draw rectangle
      lines.push(`    <rect x="${pos.x}" y="${pos.y}" width="${def.geometry.width}" height="${def.geometry.height}" fill="none" stroke="${strokeColor}" stroke-width="2"/>`);
    }

    // Render symbol texts
    if (def.texts) {
      for (const t of def.texts) {
        const fs = t.fontSize ?? 20;
        const fw = t.fontWeight ?? 'bold';
        lines.push(`    <text x="${pos.x + t.x}" y="${pos.y + t.y}" font-size="${fs}" font-weight="${fw}" fill="${strokeColor}" text-anchor="middle" dominant-baseline="central">${escapeXml(t.content)}</text>`);
      }
    }

    lines.push(`  </g>`);

    // Device tag label (outside transform so text stays readable)
    lines.push(`  <text x="${pos.x + 2}" y="${pos.y - 4}" font-size="12" font-weight="bold" fill="${textColor}" font-family="monospace">${escapeXml(device.tag)}</text>`);

    // Pin dots
    for (const pin of def.pins) {
      const px = pos.x + pin.position.x;
      const py = pos.y + pin.position.y;
      lines.push(`  <circle cx="${px}" cy="${py}" r="2" fill="${strokeColor}"/>`);
    }
  }

  // Render wires (simplified — straight lines between pin endpoints)
  for (let i = 0; i < circuit.connections.length; i++) {
    const conn = circuit.connections[i];
    const fromPos = positions.get(conn.fromDevice);
    const toPos = positions.get(conn.toDevice);
    if (!fromPos || !toPos) continue;

    const fromDevice = circuit.devices.find(d => d.tag === conn.fromDevice);
    const toDevice = circuit.devices.find(d => d.tag === conn.toDevice);
    if (!fromDevice || !toDevice) continue;

    const fromPart = fromDevice.partId ? partMap.get(fromDevice.partId) : null;
    const toPart = toDevice.partId ? partMap.get(toDevice.partId) : null;
    const fromDef = getSymbolDefinition(fromPart?.category || 'unknown');
    const toDef = getSymbolDefinition(toPart?.category || 'unknown');

    const fromPin = fromDef?.pins.find(p => p.id === conn.fromPin);
    const toPin = toDef?.pins.find(p => p.id === conn.toPin);

    const fx = fromPos.x + (fromPin?.position.x ?? (fromDef?.geometry.width || 40) / 2);
    const fy = fromPos.y + (fromPin?.position.y ?? (fromDef?.geometry.height || 40) / 2);
    const tx = toPos.x + (toPin?.position.x ?? (toDef?.geometry.width || 40) / 2);
    const ty = toPos.y + (toPin?.position.y ?? (toDef?.geometry.height || 40) / 2);

    const color = wireColors[i % wireColors.length];

    // Build wire path (through waypoints if present)
    const points: Point[] = [{ x: fx, y: fy }];
    if (conn.waypoints) {
      for (const wp of conn.waypoints) {
        points.push(wp);
      }
    }
    points.push({ x: tx, y: ty });

    // Convert to orthogonal
    const orthoPoints = toOrthogonalPoints(points);
    const pathD = orthoPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

    lines.push(`  <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2"/>`);

    // Wire number label
    const wireNumber = conn.wireNumber || `W${String(i + 1).padStart(3, '0')}`;
    const midIdx = Math.floor(orthoPoints.length / 2);
    const labelX = orthoPoints[midIdx]?.x || (fx + tx) / 2;
    const labelY = orthoPoints[midIdx]?.y || (fy + ty) / 2;
    lines.push(`  <text x="${labelX}" y="${labelY - 4}" font-size="8" fill="${color}" text-anchor="middle" font-family="monospace">${escapeXml(wireNumber)}</text>`);
  }

  // Render annotations
  if (circuit.annotations) {
    for (const ann of circuit.annotations) {
      if (ann.annotationType === 'text') {
        const fs = ann.style?.fontSize || 14;
        lines.push(`  <text x="${ann.position.x}" y="${ann.position.y}" font-size="${fs}" fill="${textColor}" font-family="monospace">${escapeXml(ann.content)}</text>`);
      }
    }
  }

  lines.push('</svg>');
  return lines.join('\n');
}

/**
 * Convert a SymbolPrimitive to an SVG element string.
 * Uses native SVG elements (rect, circle, line) instead of path+d.
 */
function primitiveToSVGString(p: SymbolPrimitive, strokeColor: string, tx: number, ty: number): string {
  const stroke = ('stroke' in p && p.stroke) || strokeColor;
  const fill = ('fill' in p && p.fill) || 'none';
  const sw = ('strokeWidth' in p && p.strokeWidth) || 2;

  switch (p.type) {
    case 'rect':
      return `<rect x="${tx + p.x}" y="${ty + p.y}" width="${p.width}" height="${p.height}"${p.rx ? ` rx="${p.rx}"` : ''} fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'circle':
      return `<circle cx="${tx + p.cx}" cy="${ty + p.cy}" r="${p.r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'line':
      return `<line x1="${tx + p.x1}" y1="${ty + p.y1}" x2="${tx + p.x2}" y2="${ty + p.y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'arc': {
      const r = p.r;
      const x1 = p.cx + r * Math.cos(p.startAngle);
      const y1 = p.cy + r * Math.sin(p.startAngle);
      const x2 = p.cx + r * Math.cos(p.endAngle);
      const y2 = p.cy + r * Math.sin(p.endAngle);
      const largeArc = Math.abs(p.endAngle - p.startAngle) > Math.PI ? 1 : 0;
      const sweep = p.endAngle > p.startAngle ? 1 : 0;
      return `<path d="M${tx + x1},${ty + y1} A${r},${r} 0 ${largeArc},${sweep} ${tx + x2},${ty + y2}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${tx + p.cx}" cy="${ty + p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 'polyline': {
      const pts = p.points.map(pt => `${tx + pt.x},${ty + pt.y}`).join(' ');
      const tag = p.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    case 'text': {
      const fs = p.fontSize ?? 20;
      const fw = p.fontWeight ?? 'bold';
      return `<text x="${tx + p.x}" y="${ty + p.y}" font-size="${fs}" font-weight="${fw}" fill="${stroke}" text-anchor="${p.textAnchor || 'middle'}" dominant-baseline="central">${escapeXml(p.content)}</text>`;
    }
    case 'path':
      return `<path d="${p.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="translate(${tx},${ty})"/>`;
    default:
      return '';
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toOrthogonalPoints(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    if (prev.x !== curr.x && prev.y !== curr.y) {
      result.push({ x: curr.x, y: prev.y });
    }
    result.push(curr);
  }
  return result;
}

/**
 * Download SVG as a file
 */
export function downloadSVG(svgContent: string, filename = 'drawing.svg'): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

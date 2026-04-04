/**
 * Symbol Importer — Convert SVG and DXF files to fusionCad symbol definitions.
 *
 * Pipeline:
 * 1. Parse the source file (SVG or DXF)
 * 2. Extract geometry → fusionCad primitives (line, rect, circle, arc, polyline, text, path)
 * 3. Compute bounding box and normalize to mm
 * 4. Auto-detect pin candidates (endpoints on boundary, small circles)
 * 5. Return ImportedSymbol for user to review/edit pins before saving
 */

import type { SymbolDefinition, SymbolPrimitive, SymbolPin, PinDirection } from '@fusion-cad/core-model';
import { parse as parseSvg } from 'svg-parser';
import DxfParser from 'dxf-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportedSymbol {
  /** Extracted primitives (visual geometry) */
  primitives: SymbolPrimitive[];
  /** Auto-detected pin candidates — user should review and edit */
  pinCandidates: PinCandidate[];
  /** Bounding box in mm */
  bounds: { width: number; height: number };
  /** Source file name for reference */
  sourceName?: string;
}

export interface PinCandidate {
  x: number;
  y: number;
  /** Suggested direction based on position relative to center */
  suggestedDirection: PinDirection;
  /** How this pin was detected */
  source: 'boundary-endpoint' | 'small-circle' | 'point-entity' | 'manual';
  /** Suggested name (auto-numbered) */
  name: string;
}

// ---------------------------------------------------------------------------
// SVG Importer
// ---------------------------------------------------------------------------

interface SvgNode {
  type: string;
  tagName?: string;
  properties?: Record<string, string | number>;
  children?: SvgNode[];
  value?: string;
}

/**
 * Import an SVG string into fusionCad primitives + pin candidates.
 * @param svgString The raw SVG content
 * @param targetWidthMm Desired width in mm (scales the SVG to fit)
 */
export function importSvg(svgString: string, targetWidthMm?: number): ImportedSymbol {
  const ast = parseSvg(svgString) as unknown as SvgNode;
  const primitives: SymbolPrimitive[] = [];
  const allEndpoints: Array<{ x: number; y: number }> = [];
  const smallCircles: Array<{ x: number; y: number; r: number }> = [];

  // Extract viewBox for coordinate mapping
  const root = ast.children?.[0];
  let viewBox = { x: 0, y: 0, w: 100, h: 100 };
  if (root?.properties) {
    const vb = root.properties.viewBox as string;
    if (vb) {
      const parts = String(vb).split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    } else {
      // Try width/height attributes
      const w = Number(root.properties.width) || 100;
      const h = Number(root.properties.height) || 100;
      viewBox = { x: 0, y: 0, w, h };
    }
  }

  // Scale factor: SVG units → mm
  // If SVG has explicit mm dimensions, use them (no scaling needed)
  let nativeWidthMm: number | null = null;
  if (root?.properties?.width) {
    const widthStr = String(root.properties.width);
    const mmMatch = widthStr.match(/^([\d.]+)mm$/);
    if (mmMatch) nativeWidthMm = parseFloat(mmMatch[1]);
  }
  const defaultWidthMm = targetWidthMm ?? nativeWidthMm ?? 40;
  const scale = defaultWidthMm / viewBox.w;

  // Convert SVG coordinate to mm
  const toMm = (val: number | string | undefined, offset: number = 0): number => {
    return (Number(val || 0) - offset) * scale;
  };

  // Walk SVG tree and extract primitives
  function walkNode(node: SvgNode, parentTransform?: { tx: number; ty: number }): void {
    if (!node) return;
    const tx = parentTransform?.tx ?? 0;
    const ty = parentTransform?.ty ?? 0;

    const p = node.properties || {};

    switch (node.tagName) {
      case 'line': {
        const x1 = toMm(p.x1, viewBox.x) + tx;
        const y1 = toMm(p.y1, viewBox.y) + ty;
        const x2 = toMm(p.x2, viewBox.x) + tx;
        const y2 = toMm(p.y2, viewBox.y) + ty;
        primitives.push({ type: 'line', x1, y1, x2, y2 });
        allEndpoints.push({ x: x1, y: y1 }, { x: x2, y: y2 });
        break;
      }
      case 'rect': {
        const x = toMm(p.x, viewBox.x) + tx;
        const y = toMm(p.y, viewBox.y) + ty;
        const w = toMm(p.width);
        const h = toMm(p.height);
        if (w > 0 && h > 0) {
          primitives.push({ type: 'rect', x, y, width: w, height: h });
        }
        break;
      }
      case 'circle': {
        const cx = toMm(p.cx, viewBox.x) + tx;
        const cy = toMm(p.cy, viewBox.y) + ty;
        const r = toMm(p.r);
        if (r < 1.5) {
          // Small circle — pin candidate
          smallCircles.push({ x: cx, y: cy, r });
        } else {
          primitives.push({ type: 'circle', cx, cy, r });
        }
        break;
      }
      case 'ellipse': {
        const cx = toMm(p.cx, viewBox.x) + tx;
        const cy = toMm(p.cy, viewBox.y) + ty;
        const rx = toMm(p.rx);
        const ry = toMm(p.ry);
        // Approximate as circle using average radius
        primitives.push({ type: 'circle', cx, cy, r: (rx + ry) / 2 });
        break;
      }
      case 'polyline':
      case 'polygon': {
        const pointsStr = String(p.points || '');
        const nums = pointsStr.trim().split(/[\s,]+/).map(Number);
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
          points.push({
            x: toMm(nums[i], viewBox.x) + tx,
            y: toMm(nums[i + 1], viewBox.y) + ty,
          });
        }
        if (points.length >= 2) {
          primitives.push({ type: 'polyline', points });
          allEndpoints.push(points[0], points[points.length - 1]);
        }
        break;
      }
      case 'path': {
        const d = String(p.d || '');
        if (d) {
          // Store the path data as-is (scaled via transform)
          // TODO: Apply scale transform to path data for accuracy
          primitives.push({ type: 'path', d });
        }
        break;
      }
      case 'text': {
        const x = toMm(p.x, viewBox.x) + tx;
        const y = toMm(p.y, viewBox.y) + ty;
        // Extract text content from children
        const content = extractTextContent(node);
        if (content) {
          const fontSize = toMm(p['font-size'] || 12);
          primitives.push({
            type: 'text', x, y, content,
            fontSize: Math.max(1.5, Math.min(fontSize, 5)),
            textAnchor: 'start',
          });
        }
        break;
      }
      case 'g': {
        // Handle group transforms
        let childTx = tx;
        let childTy = ty;
        const transform = String(p.transform || '');
        const translateMatch = transform.match(/translate\(\s*([\d.e+-]+)[\s,]+([\d.e+-]+)\s*\)/);
        if (translateMatch) {
          childTx += toMm(parseFloat(translateMatch[1]));
          childTy += toMm(parseFloat(translateMatch[2]));
        }
        for (const child of node.children || []) {
          walkNode(child, { tx: childTx, ty: childTy });
        }
        return; // don't walk children again below
      }
    }

    // Walk children for non-group elements
    if (node.tagName !== 'g') {
      for (const child of node.children || []) {
        walkNode(child, parentTransform);
      }
    }
  }

  // Start walking from root
  for (const child of ast.children || []) {
    walkNode(child);
  }

  // Compute actual bounds from primitives
  const bounds = computeBounds(primitives, allEndpoints, smallCircles);

  // Normalize: shift all primitives so top-left is (0, 0)
  if (bounds.minX !== 0 || bounds.minY !== 0) {
    shiftPrimitives(primitives, -bounds.minX, -bounds.minY);
    for (const ep of allEndpoints) { ep.x -= bounds.minX; ep.y -= bounds.minY; }
    for (const sc of smallCircles) { sc.x -= bounds.minX; sc.y -= bounds.minY; }
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Auto-detect pin candidates
  const pinCandidates = detectPinCandidates(allEndpoints, smallCircles, width, height);

  return {
    primitives,
    pinCandidates,
    bounds: { width, height },
  };
}

// ---------------------------------------------------------------------------
// DXF Importer
// ---------------------------------------------------------------------------

/**
 * Import a DXF string into fusionCad primitives + pin candidates.
 * @param dxfString The raw DXF content
 * @param targetWidthMm Desired width in mm (optional, auto-detects from DXF units)
 */
export function importDxf(dxfString: string, targetWidthMm?: number): ImportedSymbol {
  const parser = new (DxfParser as any)();
  const dxf = parser.parseSync(dxfString);

  const primitives: SymbolPrimitive[] = [];
  const allEndpoints: Array<{ x: number; y: number }> = [];
  const smallCircles: Array<{ x: number; y: number; r: number }> = [];
  const pointEntities: Array<{ x: number; y: number }> = [];

  // Layer-based line weight: "Narrow" layers get thin lines
  function getStrokeWidth(entity: any): number {
    const layer = (entity.layer || '').toLowerCase();
    if (layer.includes('narrow') || layer.includes('thin') || layer.includes('hidden')) return 0.15;
    return 0.35; // default visible weight
  }

  // Process entities
  function processEntity(entity: any): void {
    const sw = getStrokeWidth(entity);
    switch (entity.type) {
      case 'LINE':
        primitives.push({
          type: 'line',
          x1: entity.vertices[0].x,
          y1: entity.vertices[0].y,
          x2: entity.vertices[1].x,
          y2: entity.vertices[1].y,
          strokeWidth: sw,
        });
        allEndpoints.push(
          { x: entity.vertices[0].x, y: entity.vertices[0].y },
          { x: entity.vertices[1].x, y: entity.vertices[1].y }
        );
        break;

      case 'CIRCLE':
        if (entity.radius < 1.5) {
          smallCircles.push({ x: entity.center.x, y: entity.center.y, r: entity.radius });
        } else {
          primitives.push({
            type: 'circle',
            cx: entity.center.x,
            cy: entity.center.y,
            r: entity.radius,
            strokeWidth: sw,
          });
        }
        break;

      case 'ARC':
        // Skip construction/dimension arcs (radius > 100mm is likely not part geometry)
        if (entity.radius <= 100) {
          primitives.push({
            type: 'arc',
            cx: entity.center.x,
            cy: entity.center.y,
            r: entity.radius,
            startAngle: (entity.startAngle * Math.PI) / 180,
            endAngle: (entity.endAngle * Math.PI) / 180,
            strokeWidth: sw,
          });
        }
        break;

      case 'ELLIPSE': {
        // Approximate ellipse as polyline (sample points along the curve)
        const cx = entity.center?.x ?? 0;
        const cy = entity.center?.y ?? 0;
        const majorX = entity.majorAxisEndPoint?.x ?? 1;
        const majorY = entity.majorAxisEndPoint?.y ?? 0;
        const ratio = entity.axisRatio ?? 1;
        const startParam = entity.startAngle ?? 0;
        const endParam = entity.endAngle ?? 2 * Math.PI;
        const majorLen = Math.hypot(majorX, majorY);
        const majorAngle = Math.atan2(majorY, majorX);
        const a = majorLen;       // semi-major
        const b = majorLen * ratio; // semi-minor
        const steps = 32;
        const range = endParam > startParam ? endParam - startParam : endParam + 2 * Math.PI - startParam;
        const points: Array<{ x: number; y: number }> = [];
        for (let i = 0; i <= steps; i++) {
          const t = startParam + (range * i) / steps;
          const ex = a * Math.cos(t);
          const ey = b * Math.sin(t);
          // Rotate by major axis angle
          const rx = cx + ex * Math.cos(majorAngle) - ey * Math.sin(majorAngle);
          const ry = cy + ex * Math.sin(majorAngle) + ey * Math.cos(majorAngle);
          points.push({ x: rx, y: ry });
        }
        if (points.length >= 2) {
          primitives.push({ type: 'polyline', points });
        }
        break;
      }

      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const points = (entity.vertices || []).map((v: any) => ({
          x: v.x,
          y: v.y,
        }));
        if (points.length >= 2) {
          primitives.push({ type: 'polyline', points });
          allEndpoints.push(points[0], points[points.length - 1]);
        }
        break;
      }

      case 'TEXT':
      case 'MTEXT':
        primitives.push({
          type: 'text',
          x: entity.startPoint?.x ?? entity.position?.x ?? 0,
          y: entity.startPoint?.y ?? entity.position?.y ?? 0,
          content: entity.text || '',
          fontSize: entity.textHeight || 2.5,
          textAnchor: 'start',
        });
        break;

      case 'POINT':
        pointEntities.push({ x: entity.position.x, y: entity.position.y });
        break;

      case 'INSERT':
        // Resolve block reference
        if (dxf.blocks && dxf.blocks[entity.name]) {
          const block = dxf.blocks[entity.name];
          const offsetX = entity.position?.x ?? 0;
          const offsetY = entity.position?.y ?? 0;
          for (const blockEntity of block.entities || []) {
            // Clone and offset the entity
            const shifted = shiftEntity(blockEntity, offsetX, offsetY);
            processEntity(shifted);
          }
        }
        break;
    }
  }

  for (const entity of dxf.entities || []) {
    processEntity(entity);
  }

  // Multi-view detection: if there's a large X gap, keep only the largest view (front)
  // This handles DXF files with front+side+top orthographic projections
  const entityXValues: number[] = [];
  for (const p of primitives) {
    if (p.type === 'line') { entityXValues.push(p.x1, p.x2); }
    else if (p.type === 'circle' || p.type === 'arc') { entityXValues.push(p.cx); }
    else if (p.type === 'polyline') { for (const pt of p.points) entityXValues.push(pt.x); }
  }
  if (entityXValues.length > 0) {
    entityXValues.sort((a, b) => a - b);
    // Find largest gap in X coordinates
    let maxGap = 0, gapX = 0;
    for (let i = 1; i < entityXValues.length; i++) {
      const gap = entityXValues[i] - entityXValues[i - 1];
      if (gap > maxGap) { maxGap = gap; gapX = (entityXValues[i] + entityXValues[i - 1]) / 2; }
    }
    // If gap > 30mm, there are multiple views — keep the one with more primitives
    if (maxGap > 30) {
      // Use center X of each primitive to classify which view it belongs to
      const getCenterX = (p: SymbolPrimitive): number => {
        if (p.type === 'line') return (p.x1 + p.x2) / 2;
        if (p.type === 'circle' || p.type === 'arc') return p.cx;
        if (p.type === 'polyline') return p.points.reduce((s, pt) => s + pt.x, 0) / p.points.length;
        if (p.type === 'text') return p.x;
        return 0;
      };
      const leftCount = primitives.filter(p => getCenterX(p) < gapX).length;
      const rightCount = primitives.length - leftCount;
      const keepLeft = leftCount >= rightCount;
      // Filter to keep only the larger view
      for (let i = primitives.length - 1; i >= 0; i--) {
        const inLeft = getCenterX(primitives[i]) < gapX;
        if ((keepLeft && !inLeft) || (!keepLeft && inLeft)) {
          primitives.splice(i, 1);
        }
      }
      // Also filter endpoints
      for (let i = allEndpoints.length - 1; i >= 0; i--) {
        if ((keepLeft && allEndpoints[i].x >= gapX) || (!keepLeft && allEndpoints[i].x < gapX)) {
          allEndpoints.splice(i, 1);
        }
      }
    }
  }

  // Strip dimension-like text (e.g., "241.6[9.51]", "110.8 [4.36]")
  // and very long lines that are likely dimension extension lines
  const isDimensionText = (text: string) => /\d+\.?\d*\s*[\[\(]/.test(text);
  const beforeStrip = primitives.length;
  for (let i = primitives.length - 1; i >= 0; i--) {
    const p = primitives[i];
    if (p.type === 'text' && isDimensionText(p.content || '')) {
      primitives.splice(i, 1);
    }
  }

  // Compute initial bounds to detect outlier lines (dimension extension lines)
  // Lines that span > 80% of the full extent are likely dimension lines, not geometry
  const allX: number[] = [];
  const allY: number[] = [];
  for (const p of primitives) {
    if (p.type === 'line') { allX.push(p.x1, p.x2); allY.push(p.y1, p.y2); }
    else if (p.type === 'circle') { allX.push(p.cx); allY.push(p.cy); }
    else if (p.type === 'polyline') { for (const pt of p.points) { allX.push(pt.x); allY.push(pt.y); } }
  }
  if (allX.length > 0) {
    const rangeX = Math.max(...allX) - Math.min(...allX);
    const rangeY = Math.max(...allY) - Math.min(...allY);
    for (let i = primitives.length - 1; i >= 0; i--) {
      const p = primitives[i];
      if (p.type === 'line') {
        const lineLen = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
        // Very long horizontal or vertical lines spanning most of the drawing = dimension lines
        if (lineLen > rangeX * 0.7 || lineLen > rangeY * 0.7) {
          const isHoriz = Math.abs(p.y2 - p.y1) < 0.5;
          const isVert = Math.abs(p.x2 - p.x1) < 0.5;
          if (isHoriz || isVert) {
            primitives.splice(i, 1);
          }
        }
      }
    }
  }

  // DXF uses Y-up, fusionCad uses Y-down — flip Y
  const rawBounds = computeBounds(primitives, allEndpoints, smallCircles);
  const flipY = rawBounds.maxY + rawBounds.minY;
  flipPrimitivesY(primitives, flipY);
  for (const ep of allEndpoints) { ep.y = flipY - ep.y; }
  for (const sc of smallCircles) { sc.y = flipY - sc.y; }
  for (const pt of pointEntities) { pt.y = flipY - pt.y; }

  // Recompute bounds after flip
  const bounds = computeBounds(primitives, allEndpoints, smallCircles);

  // Normalize to origin
  if (bounds.minX !== 0 || bounds.minY !== 0) {
    shiftPrimitives(primitives, -bounds.minX, -bounds.minY);
    for (const ep of allEndpoints) { ep.x -= bounds.minX; ep.y -= bounds.minY; }
    for (const sc of smallCircles) { sc.x -= bounds.minX; sc.y -= bounds.minY; }
    for (const pt of pointEntities) { pt.x -= bounds.minX; pt.y -= bounds.minY; }
  }

  let width = bounds.maxX - bounds.minX;
  let height = bounds.maxY - bounds.minY;

  // Clip: remove primitives that extend far outside the normalized bounds
  // This catches stray ellipse arcs, construction lines, etc.
  const clipMargin = Math.max(width, height) * 0.15;
  for (let i = primitives.length - 1; i >= 0; i--) {
    const p = primitives[i];
    let outside = false;
    if (p.type === 'line') {
      outside = p.x1 < -clipMargin || p.y1 < -clipMargin || p.x2 < -clipMargin || p.y2 < -clipMargin ||
                p.x1 > width + clipMargin || p.y1 > height + clipMargin || p.x2 > width + clipMargin || p.y2 > height + clipMargin;
    } else if (p.type === 'polyline') {
      outside = p.points.some(pt => pt.x < -clipMargin || pt.y < -clipMargin || pt.x > width + clipMargin || pt.y > height + clipMargin);
    } else if (p.type === 'circle' || p.type === 'arc') {
      outside = p.cx - p.r < -clipMargin || p.cy - p.r < -clipMargin || p.cx + p.r > width + clipMargin || p.cy + p.r > height + clipMargin;
    }
    if (outside) primitives.splice(i, 1);
  }

  // Recompute bounds after clipping
  const clippedBounds = computeBounds(primitives, [], []);
  if (clippedBounds.minX !== 0 || clippedBounds.minY !== 0) {
    shiftPrimitives(primitives, -clippedBounds.minX, -clippedBounds.minY);
    for (const ep of allEndpoints) { ep.x -= clippedBounds.minX; ep.y -= clippedBounds.minY; }
    for (const sc of smallCircles) { sc.x -= clippedBounds.minX; sc.y -= clippedBounds.minY; }
  }
  width = clippedBounds.maxX - clippedBounds.minX;
  height = clippedBounds.maxY - clippedBounds.minY;

  // Scale to target width if specified
  if (targetWidthMm && width > 0) {
    const s = targetWidthMm / width;
    scalePrimitives(primitives, s);
    for (const ep of allEndpoints) { ep.x *= s; ep.y *= s; }
    for (const sc of smallCircles) { sc.x *= s; sc.y *= s; sc.r *= s; }
    for (const pt of pointEntities) { pt.x *= s; pt.y *= s; }
    width *= s;
    height *= s;
  }

  // Merge point entities into pin detection
  const allPinSources = [...allEndpoints, ...pointEntities];
  const pinCandidates = detectPinCandidates(allPinSources, smallCircles, width, height);

  return {
    primitives,
    pinCandidates,
    bounds: { width, height },
  };
}

// ---------------------------------------------------------------------------
// Finalize: Convert ImportedSymbol → SymbolDefinition
// ---------------------------------------------------------------------------

/**
 * Convert an ImportedSymbol with user-confirmed pins into a SymbolDefinition.
 */
export function finalizeImportedSymbol(
  imported: ImportedSymbol,
  id: string,
  name: string,
  category: string,
  confirmedPins: Array<{ x: number; y: number; name: string; direction: PinDirection; pinType: string }>,
  tagPrefix?: string,
  usage?: 'schematic' | 'layout',
): SymbolDefinition {
  const pins: SymbolPin[] = confirmedPins.map(p => ({
    id: p.name,
    name: p.name,
    position: { x: p.x, y: p.y },
    direction: p.direction,
    pinType: p.pinType as any,
  }));

  return {
    id,
    type: 'symbol-definition',
    name,
    category,
    geometry: { width: imported.bounds.width, height: imported.bounds.height },
    pins,
    primitives: imported.primitives,
    tagPrefix: tagPrefix || category.substring(0, 2).toUpperCase(),
    source: 'imported',
    standard: 'custom',
    usage: usage || 'schematic',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextContent(node: SvgNode): string {
  if (node.value) return node.value;
  if (node.children) {
    return node.children.map(c => extractTextContent(c)).join('');
  }
  return '';
}

function computeBounds(
  primitives: SymbolPrimitive[],
  endpoints: Array<{ x: number; y: number }>,
  circles: Array<{ x: number; y: number; r: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const p of primitives) {
    switch (p.type) {
      case 'line': update(p.x1, p.y1); update(p.x2, p.y2); break;
      case 'rect': update(p.x, p.y); update(p.x + p.width, p.y + p.height); break;
      case 'circle': update(p.cx - p.r, p.cy - p.r); update(p.cx + p.r, p.cy + p.r); break;
      case 'arc': update(p.cx - p.r, p.cy - p.r); update(p.cx + p.r, p.cy + p.r); break;
      case 'polyline': for (const pt of p.points) update(pt.x, pt.y); break;
      case 'text': update(p.x, p.y); break;
    }
  }
  for (const ep of endpoints) update(ep.x, ep.y);
  for (const c of circles) update(c.x, c.y);

  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 40, maxY: 40 };
  return { minX, minY, maxX, maxY };
}

function shiftPrimitives(primitives: SymbolPrimitive[], dx: number, dy: number): void {
  for (const p of primitives) {
    switch (p.type) {
      case 'line': p.x1 += dx; p.y1 += dy; p.x2 += dx; p.y2 += dy; break;
      case 'rect': p.x += dx; p.y += dy; break;
      case 'circle': p.cx += dx; p.cy += dy; break;
      case 'arc': p.cx += dx; p.cy += dy; break;
      case 'polyline': for (const pt of p.points) { pt.x += dx; pt.y += dy; } break;
      case 'text': p.x += dx; p.y += dy; break;
    }
  }
}

function scalePrimitives(primitives: SymbolPrimitive[], s: number): void {
  for (const p of primitives) {
    switch (p.type) {
      case 'line': p.x1 *= s; p.y1 *= s; p.x2 *= s; p.y2 *= s; break;
      case 'rect': p.x *= s; p.y *= s; p.width *= s; p.height *= s; break;
      case 'circle': p.cx *= s; p.cy *= s; p.r *= s; break;
      case 'arc': p.cx *= s; p.cy *= s; p.r *= s; break;
      case 'polyline': for (const pt of p.points) { pt.x *= s; pt.y *= s; } break;
      case 'text': p.x *= s; p.y *= s; if (p.fontSize) p.fontSize *= s; break;
    }
  }
}

function flipPrimitivesY(primitives: SymbolPrimitive[], flipY: number): void {
  for (const p of primitives) {
    switch (p.type) {
      case 'line': p.y1 = flipY - p.y1; p.y2 = flipY - p.y2; break;
      case 'rect': p.y = flipY - p.y - p.height; break;
      case 'circle': p.cy = flipY - p.cy; break;
      case 'arc': p.cy = flipY - p.cy; break;
      case 'polyline': for (const pt of p.points) { pt.y = flipY - pt.y; } break;
      case 'text': p.y = flipY - p.y; break;
    }
  }
}

function shiftEntity(entity: any, dx: number, dy: number): any {
  const shifted = { ...entity };
  if (shifted.vertices) {
    shifted.vertices = shifted.vertices.map((v: any) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }
  if (shifted.center) {
    shifted.center = { ...shifted.center, x: shifted.center.x + dx, y: shifted.center.y + dy };
  }
  if (shifted.position) {
    shifted.position = { ...shifted.position, x: shifted.position.x + dx, y: shifted.position.y + dy };
  }
  if (shifted.startPoint) {
    shifted.startPoint = { ...shifted.startPoint, x: shifted.startPoint.x + dx, y: shifted.startPoint.y + dy };
  }
  return shifted;
}

/**
 * Auto-detect pin candidates from geometry analysis.
 * Strategies:
 * 1. Line endpoints that lie near the bounding box boundary
 * 2. Small circles (r < 1.5mm) — often used as connection dots
 */
function detectPinCandidates(
  endpoints: Array<{ x: number; y: number }>,
  smallCircles: Array<{ x: number; y: number; r: number }>,
  width: number,
  height: number,
): PinCandidate[] {
  const candidates: PinCandidate[] = [];
  const seen = new Set<string>();
  const edgeThreshold = 2; // mm from boundary to be considered a pin
  let pinNum = 1;

  const addCandidate = (x: number, y: number, source: PinCandidate['source']) => {
    // Round to grid
    const rx = Math.round(x * 2) / 2;
    const ry = Math.round(y * 2) / 2;
    const key = `${rx},${ry}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Determine direction based on position
    let dir: PinDirection = 'left';
    if (rx <= edgeThreshold) dir = 'left';
    else if (rx >= width - edgeThreshold) dir = 'right';
    else if (ry <= edgeThreshold) dir = 'top';
    else if (ry >= height - edgeThreshold) dir = 'bottom';
    else return; // not near boundary — skip

    candidates.push({
      x: rx,
      y: ry,
      suggestedDirection: dir,
      source,
      name: String(pinNum++),
    });
  };

  // Boundary endpoints
  for (const ep of endpoints) {
    addCandidate(ep.x, ep.y, 'boundary-endpoint');
  }

  // Small circles
  for (const sc of smallCircles) {
    addCandidate(sc.x, sc.y, 'small-circle');
  }

  return candidates;
}

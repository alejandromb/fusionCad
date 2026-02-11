/**
 * SVG Symbol Importer
 *
 * Parses SVG content (string) and converts it into a fusionCad SymbolDefinition.
 * Runs entirely in the browser using DOMParser - no external dependencies.
 *
 * Supports:
 * - <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon> elements
 * - <text> elements
 * - <g> groups with translate transforms
 * - Auto-detection of pins from small circles at symbol edges
 * - Scaling to target dimensions
 */

import type {
  SymbolDefinition,
  SymbolPath,
  SymbolText,
  SymbolPin,
  PinType,
  PinDirection,
} from '@fusion-cad/core-model';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SVGImportOptions {
  /** Target width for the symbol (scales SVG to fit) */
  targetWidth?: number;
  /** Target height for the symbol (scales SVG to fit) */
  targetHeight?: number;
  /** Category name for the imported symbol */
  category: string;
  /** Display name */
  name: string;
  /** Auto-detect pins from small circles at edges (default: true) */
  autoDetectPins?: boolean;
}

export interface SVGImportResult {
  definition: SymbolDefinition;
  warnings: string[];
}

/**
 * Import an SVG string and produce a fusionCad SymbolDefinition.
 */
export function importSVGToSymbol(
  svgContent: string,
  options: SVGImportOptions,
): SVGImportResult {
  const warnings: string[] = [];
  const autoDetectPins = options.autoDetectPins ?? true;

  // ---- 1. Parse SVG --------------------------------------------------------
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    warnings.push(`SVG parse error: ${errorNode.textContent?.slice(0, 200) ?? 'unknown'}`);
    return {
      definition: emptyDefinition(options),
      warnings,
    };
  }

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    warnings.push('No <svg> root element found');
    return {
      definition: emptyDefinition(options),
      warnings,
    };
  }

  // ---- 2. Extract coordinate system (viewBox / width+height) ---------------
  const { width: srcWidth, height: srcHeight, warnMsg } = extractDimensions(svgEl);
  if (warnMsg) warnings.push(warnMsg);

  // ---- 3. Walk the SVG tree and collect shapes / texts / pin-candidates ----
  const collectedPaths: SymbolPath[] = [];
  const collectedTexts: SymbolText[] = [];
  const pinCandidateCircles: { cx: number; cy: number; r: number }[] = [];

  walkElement(svgEl, { tx: 0, ty: 0 }, collectedPaths, collectedTexts, pinCandidateCircles, warnings);

  // ---- 4. Pin detection -----------------------------------------------------
  const pins: SymbolPin[] = [];
  const pathsWithoutPins: SymbolPath[] = [];

  if (autoDetectPins && pinCandidateCircles.length > 0) {
    const edgeThreshold = Math.max(srcWidth, srcHeight) * 0.15;

    for (let i = 0; i < pinCandidateCircles.length; i++) {
      const c = pinCandidateCircles[i];
      const direction = detectPinDirection(c.cx, c.cy, srcWidth, srcHeight, edgeThreshold);

      if (direction !== null) {
        pins.push({
          id: `p${i + 1}`,
          name: `p${i + 1}`,
          pinType: 'passive' as PinType,
          position: { x: c.cx, y: c.cy },
          direction,
        });
      } else {
        // Not at an edge: treat as a normal graphic circle
        pathsWithoutPins.push({
          d: circleToPath(c.cx, c.cy, c.r),
          stroke: true,
          fill: false,
          strokeWidth: 2,
        });
      }
    }

    // Keep all non-pin paths
    pathsWithoutPins.unshift(...collectedPaths);
  } else {
    // No pin detection: pin circles stay as graphic paths
    pathsWithoutPins.push(...collectedPaths);
    for (const c of pinCandidateCircles) {
      pathsWithoutPins.push({
        d: circleToPath(c.cx, c.cy, c.r),
        stroke: true,
        fill: false,
        strokeWidth: 2,
      });
    }
  }

  // ---- 5. Scale to target dimensions ----------------------------------------
  const targetWidth = options.targetWidth ?? srcWidth;
  const targetHeight = options.targetHeight ?? srcHeight;

  const { paths: scaledPaths, texts: scaledTexts, pins: scaledPins } = scaleAll(
    pathsWithoutPins,
    collectedTexts,
    pins,
    srcWidth,
    srcHeight,
    targetWidth,
    targetHeight,
  );

  // ---- 6. Assemble SymbolDefinition -----------------------------------------
  const now = Date.now();
  const definition: SymbolDefinition = {
    id: `custom-${sanitize(options.category)}-${now}`,
    type: 'symbol-definition',
    name: options.name,
    category: options.category,
    pins: scaledPins,
    geometry: { width: targetWidth, height: targetHeight },
    paths: scaledPaths.length > 0 ? scaledPaths : undefined,
    texts: scaledTexts.length > 0 ? scaledTexts : undefined,
    createdAt: now,
    modifiedAt: now,
  };

  return { definition, warnings };
}

// ---------------------------------------------------------------------------
// SVG dimension extraction
// ---------------------------------------------------------------------------

function extractDimensions(svg: SVGSVGElement): { width: number; height: number; warnMsg?: string } {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const w = parseFloat(svg.getAttribute('width') ?? '');
  const h = parseFloat(svg.getAttribute('height') ?? '');
  if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }

  return {
    width: 100,
    height: 100,
    warnMsg: 'No viewBox or width/height found on <svg>; defaulting to 100x100',
  };
}

// ---------------------------------------------------------------------------
// Recursive SVG tree walker
// ---------------------------------------------------------------------------

interface TranslateOffset {
  tx: number;
  ty: number;
}

function walkElement(
  el: Element,
  offset: TranslateOffset,
  paths: SymbolPath[],
  texts: SymbolText[],
  pinCircles: { cx: number; cy: number; r: number }[],
  warnings: string[],
): void {
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    const tag = child.tagName.toLowerCase();

    // Skip <defs>, <style>, <clipPath>, metadata, etc.
    if (['defs', 'style', 'clippath', 'metadata', 'title', 'desc', 'symbol', 'use'].includes(tag)) {
      continue;
    }

    if (tag === 'g') {
      const childOffset = applyGroupTransform(child, offset, warnings);
      walkElement(child, childOffset, paths, texts, pinCircles, warnings);
      continue;
    }

    // Shape elements
    if (tag === 'path') {
      const d = child.getAttribute('d');
      if (d) {
        const translated = translatePathData(d, offset.tx, offset.ty);
        paths.push(extractPathStyle(child, translated));
      }
      continue;
    }

    if (tag === 'rect') {
      const pathData = rectToPath(
        num(child, 'x') + offset.tx,
        num(child, 'y') + offset.ty,
        num(child, 'width'),
        num(child, 'height'),
      );
      paths.push(extractPathStyle(child, pathData));
      continue;
    }

    if (tag === 'circle') {
      const cx = num(child, 'cx') + offset.tx;
      const cy = num(child, 'cy') + offset.ty;
      const r = num(child, 'r');
      if (r < 5) {
        pinCircles.push({ cx, cy, r });
      } else {
        paths.push(extractPathStyle(child, circleToPath(cx, cy, r)));
      }
      continue;
    }

    if (tag === 'ellipse') {
      const cx = num(child, 'cx') + offset.tx;
      const cy = num(child, 'cy') + offset.ty;
      const rx = num(child, 'rx');
      const ry = num(child, 'ry');
      paths.push(extractPathStyle(child, ellipseToPath(cx, cy, rx, ry)));
      continue;
    }

    if (tag === 'line') {
      const pathData = lineToPath(
        num(child, 'x1') + offset.tx,
        num(child, 'y1') + offset.ty,
        num(child, 'x2') + offset.tx,
        num(child, 'y2') + offset.ty,
      );
      paths.push(extractPathStyle(child, pathData));
      continue;
    }

    if (tag === 'polyline') {
      const pts = child.getAttribute('points') ?? '';
      if (pts.trim()) {
        const pathData = polylineToPath(pts, offset);
        paths.push(extractPathStyle(child, pathData));
      }
      continue;
    }

    if (tag === 'polygon') {
      const pts = child.getAttribute('points') ?? '';
      if (pts.trim()) {
        const pathData = polygonToPath(pts, offset);
        paths.push(extractPathStyle(child, pathData));
      }
      continue;
    }

    if (tag === 'text') {
      const content = child.textContent?.trim() ?? '';
      if (content) {
        const x = num(child, 'x') + offset.tx;
        const y = num(child, 'y') + offset.ty;
        const fontSize = parseFontSize(child);
        const fontWeight = parseFontWeight(child);
        texts.push({ content, x, y, fontSize, fontWeight });
      }
      continue;
    }

    // Recurse into unknown containers (e.g., <a>, <switch>)
    if (child.children.length > 0) {
      walkElement(child, offset, paths, texts, pinCircles, warnings);
    }
  }
}

// ---------------------------------------------------------------------------
// Group transform parsing
// ---------------------------------------------------------------------------

function applyGroupTransform(el: Element, parent: TranslateOffset, warnings: string[]): TranslateOffset {
  const transform = el.getAttribute('transform');
  if (!transform) return { ...parent };

  // translate(x, y) or translate(x)
  const translateMatch = transform.match(/translate\(\s*([-\d.e]+)[\s,]*([-\d.e]+)?\s*\)/i);
  if (translateMatch) {
    const dx = parseFloat(translateMatch[1]);
    const dy = parseFloat(translateMatch[2] ?? '0');
    return { tx: parent.tx + dx, ty: parent.ty + dy };
  }

  // Detect other transforms and warn
  const otherTransforms = ['scale', 'rotate', 'skewX', 'skewY', 'matrix'];
  for (const t of otherTransforms) {
    if (transform.includes(t)) {
      warnings.push(`Unsupported transform "${t}" on <g> element — coordinates may be inaccurate`);
    }
  }

  return { ...parent };
}

// ---------------------------------------------------------------------------
// Shape → Path conversions
// ---------------------------------------------------------------------------

function rectToPath(x: number, y: number, width: number, height: number): string {
  return `M ${r(x)},${r(y)} L ${r(x + width)},${r(y)} L ${r(x + width)},${r(y + height)} L ${r(x)},${r(y + height)} Z`;
}

function circleToPath(cx: number, cy: number, radius: number): string {
  return `M ${r(cx - radius)},${r(cy)} A ${r(radius)},${r(radius)} 0 1,0 ${r(cx + radius)},${r(cy)} A ${r(radius)},${r(radius)} 0 1,0 ${r(cx - radius)},${r(cy)} Z`;
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${r(cx - rx)},${r(cy)} A ${r(rx)},${r(ry)} 0 1,0 ${r(cx + rx)},${r(cy)} A ${r(rx)},${r(ry)} 0 1,0 ${r(cx - rx)},${r(cy)} Z`;
}

function lineToPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${r(x1)},${r(y1)} L ${r(x2)},${r(y2)}`;
}

function polylineToPath(points: string, offset: TranslateOffset): string {
  const coords = parsePointList(points, offset);
  if (coords.length === 0) return '';
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${r(c.x)},${r(c.y)}`).join(' ');
}

function polygonToPath(points: string, offset: TranslateOffset): string {
  const base = polylineToPath(points, offset);
  return base ? base + ' Z' : '';
}

// ---------------------------------------------------------------------------
// Path data translation (apply translate offset to an existing d-string)
// ---------------------------------------------------------------------------

/**
 * Apply a translate(tx, ty) offset to every coordinate in an SVG path data string.
 * Handles absolute commands (MLHVCSQTAZ) by offsetting their x/y values.
 * Relative commands (lowercase) are passed through unchanged since they are
 * already relative to the current point.
 */
function translatePathData(d: string, tx: number, ty: number): string {
  if (tx === 0 && ty === 0) return d;

  const tokens = tokenizePath(d);
  const result: string[] = [];
  let cmd = '';

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (isCommand(tok)) {
      cmd = tok;
      result.push(tok);
      i++;
      continue;
    }

    // Numeric value — interpret based on current command
    const upperCmd = cmd.toUpperCase();
    const isRelative = cmd !== upperCmd;

    if (isRelative) {
      // Relative commands: coordinates are relative, don't translate
      result.push(tok);
      i++;
      continue;
    }

    // Absolute commands: translate x/y pairs
    switch (upperCmd) {
      case 'M':
      case 'L':
      case 'T': {
        // x, y
        const x = parseFloat(tok) + tx;
        const y = parseFloat(tokens[i + 1] ?? '0') + ty;
        result.push(r(x).toString(), r(y).toString());
        i += 2;
        break;
      }
      case 'H': {
        // x only
        const x = parseFloat(tok) + tx;
        result.push(r(x).toString());
        i++;
        break;
      }
      case 'V': {
        // y only
        const y = parseFloat(tok) + ty;
        result.push(r(y).toString());
        i++;
        break;
      }
      case 'C': {
        // x1 y1 x2 y2 x y (6 values)
        for (let j = 0; j < 3; j++) {
          const xi = parseFloat(tokens[i] ?? '0') + tx;
          const yi = parseFloat(tokens[i + 1] ?? '0') + ty;
          result.push(r(xi).toString(), r(yi).toString());
          i += 2;
        }
        break;
      }
      case 'S':
      case 'Q': {
        // x1 y1 x y (4 values)
        for (let j = 0; j < 2; j++) {
          const xi = parseFloat(tokens[i] ?? '0') + tx;
          const yi = parseFloat(tokens[i + 1] ?? '0') + ty;
          result.push(r(xi).toString(), r(yi).toString());
          i += 2;
        }
        break;
      }
      case 'A': {
        // rx ry x-rotation large-arc-flag sweep-flag x y (7 values)
        // Only x,y (last two) get translated
        result.push(tok); // rx
        result.push(tokens[i + 1] ?? '0'); // ry
        result.push(tokens[i + 2] ?? '0'); // x-rotation
        result.push(tokens[i + 3] ?? '0'); // large-arc
        result.push(tokens[i + 4] ?? '0'); // sweep
        const ax = parseFloat(tokens[i + 5] ?? '0') + tx;
        const ay = parseFloat(tokens[i + 6] ?? '0') + ty;
        result.push(r(ax).toString(), r(ay).toString());
        i += 7;
        break;
      }
      case 'Z': {
        // No arguments
        i++;
        break;
      }
      default: {
        result.push(tok);
        i++;
        break;
      }
    }
  }

  return result.join(' ');
}

// ---------------------------------------------------------------------------
// Path data scaling
// ---------------------------------------------------------------------------

/**
 * Scale every coordinate in an SVG path data string by a uniform ratio.
 */
function scalePathData(d: string, ratio: number): string {
  if (ratio === 1) return d;

  const tokens = tokenizePath(d);
  const result: string[] = [];
  let cmd = '';

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (isCommand(tok)) {
      cmd = tok;
      result.push(tok);
      i++;
      continue;
    }

    const upperCmd = cmd.toUpperCase();

    switch (upperCmd) {
      case 'M':
      case 'L':
      case 'T':
      case 'C':
      case 'S':
      case 'Q': {
        // All numeric args are coordinates — scale them
        result.push(r(parseFloat(tok) * ratio).toString());
        i++;
        break;
      }
      case 'H':
      case 'V': {
        result.push(r(parseFloat(tok) * ratio).toString());
        i++;
        break;
      }
      case 'A': {
        // rx ry x-rotation large-arc sweep x y — scale rx, ry, x, y
        result.push(r(parseFloat(tok) * ratio).toString()); // rx
        result.push(r(parseFloat(tokens[i + 1] ?? '0') * ratio).toString()); // ry
        result.push(tokens[i + 2] ?? '0'); // x-rotation (angle, don't scale)
        result.push(tokens[i + 3] ?? '0'); // large-arc (flag, don't scale)
        result.push(tokens[i + 4] ?? '0'); // sweep (flag, don't scale)
        result.push(r(parseFloat(tokens[i + 5] ?? '0') * ratio).toString()); // x
        result.push(r(parseFloat(tokens[i + 6] ?? '0') * ratio).toString()); // y
        i += 7;
        break;
      }
      case 'Z': {
        i++;
        break;
      }
      default: {
        result.push(tok);
        i++;
        break;
      }
    }
  }

  return result.join(' ');
}

// ---------------------------------------------------------------------------
// Scaling orchestration
// ---------------------------------------------------------------------------

function scaleAll(
  paths: SymbolPath[],
  texts: SymbolText[],
  pins: SymbolPin[],
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): { paths: SymbolPath[]; texts: SymbolText[]; pins: SymbolPin[] } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { paths, texts, pins };
  }

  const ratioX = targetWidth / srcWidth;
  const ratioY = targetHeight / srcHeight;
  const ratio = Math.min(ratioX, ratioY); // Uniform scaling

  if (Math.abs(ratio - 1) < 0.0001) {
    return { paths, texts, pins };
  }

  const scaledPaths = paths.map(p => ({
    ...p,
    d: scalePathData(p.d, ratio),
  }));

  const scaledTexts = texts.map(t => ({
    ...t,
    x: r(t.x * ratio),
    y: r(t.y * ratio),
    fontSize: t.fontSize ? r(t.fontSize * ratio) : undefined,
  }));

  const scaledPins = pins.map(p => ({
    ...p,
    position: {
      x: r(p.position.x * ratio),
      y: r(p.position.y * ratio),
    },
  }));

  return { paths: scaledPaths, texts: scaledTexts, pins: scaledPins };
}

// ---------------------------------------------------------------------------
// Pin direction detection
// ---------------------------------------------------------------------------

function detectPinDirection(
  cx: number,
  cy: number,
  width: number,
  height: number,
  threshold: number,
): PinDirection | null {
  const distLeft = cx;
  const distRight = width - cx;
  const distTop = cy;
  const distBottom = height - cy;

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist > threshold) return null; // Not near any edge

  if (minDist === distLeft) return 'left';
  if (minDist === distRight) return 'right';
  if (minDist === distTop) return 'top';
  return 'bottom';
}

// ---------------------------------------------------------------------------
// Style extraction from SVG elements
// ---------------------------------------------------------------------------

function extractPathStyle(el: Element, d: string): SymbolPath {
  const stroke = el.getAttribute('stroke');
  const fill = el.getAttribute('fill');
  const strokeWidthAttr = el.getAttribute('stroke-width');
  const style = el.getAttribute('style') ?? '';

  // Parse inline style overrides
  const styleStroke = extractStyleProp(style, 'stroke');
  const styleFill = extractStyleProp(style, 'fill');
  const styleStrokeWidth = extractStyleProp(style, 'stroke-width');

  const effectiveStroke = styleStroke || stroke;
  const effectiveFill = styleFill || fill;
  const effectiveStrokeWidth = styleStrokeWidth || strokeWidthAttr;

  const hasStroke = effectiveStroke !== 'none' && effectiveStroke !== 'transparent';
  const hasFill = !!effectiveFill && effectiveFill !== 'none' && effectiveFill !== 'transparent';

  const result: SymbolPath = { d, stroke: hasStroke, fill: hasFill };

  if (effectiveStrokeWidth) {
    const sw = parseFloat(effectiveStrokeWidth);
    if (!isNaN(sw) && sw > 0) {
      result.strokeWidth = sw;
    }
  }

  return result;
}

function extractStyleProp(style: string, prop: string): string | undefined {
  const regex = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i');
  const match = style.match(regex);
  return match ? match[1].trim() : undefined;
}

// ---------------------------------------------------------------------------
// Text style parsing
// ---------------------------------------------------------------------------

function parseFontSize(el: Element): number {
  const attr = el.getAttribute('font-size');
  const style = el.getAttribute('style') ?? '';
  const styleVal = extractStyleProp(style, 'font-size');
  const raw = styleVal || attr;
  if (raw) {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) return n;
  }
  return 14; // reasonable default
}

function parseFontWeight(el: Element): 'normal' | 'bold' {
  const attr = el.getAttribute('font-weight');
  const style = el.getAttribute('style') ?? '';
  const styleVal = extractStyleProp(style, 'font-weight');
  const raw = styleVal || attr;
  if (raw && (raw === 'bold' || raw === '700' || raw === '800' || raw === '900')) {
    return 'bold';
  }
  return 'normal';
}

// ---------------------------------------------------------------------------
// SVG path tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize an SVG path data string into an array of command letters and
 * numeric value strings. Handles comma/space separation, negative numbers,
 * and implicit repeated commands correctly.
 */
function tokenizePath(d: string): string[] {
  const tokens: string[] = [];
  // Regex matches: a single letter (command) OR a numeric value (int/float/scientific)
  const re = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

function isCommand(token: string): boolean {
  return /^[a-zA-Z]$/.test(token) && token !== 'e' && token !== 'E';
}

// ---------------------------------------------------------------------------
// Point list parser (for polyline/polygon)
// ---------------------------------------------------------------------------

function parsePointList(points: string, offset: TranslateOffset): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  // Points can be "x1,y1 x2,y2" or "x1 y1 x2 y2" or mixed
  const nums = points.trim().match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
  if (!nums || nums.length < 2) return result;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    result.push({
      x: parseFloat(nums[i]) + offset.tx,
      y: parseFloat(nums[i + 1]) + offset.ty,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(el: Element, attr: string): number {
  return parseFloat(el.getAttribute(attr) ?? '0') || 0;
}

/** Round to 2 decimal places to keep path data clean */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

function emptyDefinition(options: SVGImportOptions): SymbolDefinition {
  const now = Date.now();
  return {
    id: `custom-${sanitize(options.category)}-${now}`,
    type: 'symbol-definition',
    name: options.name,
    category: options.category,
    pins: [],
    geometry: { width: options.targetWidth ?? 60, height: options.targetHeight ?? 80 },
    paths: [],
    texts: [],
    createdAt: now,
    modifiedAt: now,
  };
}

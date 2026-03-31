import type { SymbolPrimitive } from '@fusion-cad/core-model';

export interface LayoutSimplifyOptions {
  preserveLabels?: boolean;
  keepComponentCount?: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ComponentStats {
  indices: number[];
  bounds: Bounds;
  area: number;
  primitiveCount: number;
  totalLength: number;
  circleCount: number;
  tinyPrimitiveCount: number;
  score: number;
}

export function simplifyLayoutPrimitives(
  primitives: SymbolPrimitive[],
  options: LayoutSimplifyOptions = {},
): SymbolPrimitive[] {
  const preserveLabels = options.preserveLabels ?? true;
  const keepComponentCount = options.keepComponentCount ?? 3;
  const keptText = preserveLabels
    ? primitives.filter((p) => p.type === 'text' && p.content.trim().length > 0)
    : [];

  const normalized = dedupeAndFilter(primitives);
  const nonText = normalized.filter((p) => p.type !== 'text');
  if (nonText.length === 0) return keptText;

  const primitiveBounds = nonText.map(computePrimitiveBounds);
  const overallBounds = mergeBounds(primitiveBounds);
  const components = buildComponents(primitiveBounds).map((indices) =>
    computeComponentStats(nonText, primitiveBounds, indices),
  );

  const keptIndices = chooseComponentsToKeep(components, overallBounds, keepComponentCount);
  const selected = keptIndices.flatMap((componentIndex) =>
    components[componentIndex].indices.map((primitiveIndex) => nonText[primitiveIndex]),
  );

  return [...selected, ...keptText];
}

function dedupeAndFilter(primitives: SymbolPrimitive[]): SymbolPrimitive[] {
  const SNAP = 0.5;
  const MIN_LENGTH = 0.3;
  const seen = new Set<string>();
  const result: SymbolPrimitive[] = [];

  for (const primitive of primitives) {
    if (primitive.type === 'text') {
      result.push(primitive);
      continue;
    }

    if (primitive.type === 'line') {
      const len = Math.hypot(primitive.x2 - primitive.x1, primitive.y2 - primitive.y1);
      if (len < MIN_LENGTH) continue;
      const key1 = `${Math.round(primitive.x1 / SNAP)},${Math.round(primitive.y1 / SNAP)}-${Math.round(primitive.x2 / SNAP)},${Math.round(primitive.y2 / SNAP)}`;
      const key2 = `${Math.round(primitive.x2 / SNAP)},${Math.round(primitive.y2 / SNAP)}-${Math.round(primitive.x1 / SNAP)},${Math.round(primitive.y1 / SNAP)}`;
      if (seen.has(key1) || seen.has(key2)) continue;
      seen.add(key1);
      result.push(primitive);
      continue;
    }

    if (primitive.type === 'polyline') {
      const len = primitive.points.reduce((sum, pt, index) => {
        if (index === 0) return 0;
        const prev = primitive.points[index - 1];
        return sum + Math.hypot(pt.x - prev.x, pt.y - prev.y);
      }, 0);
      if (len < MIN_LENGTH) continue;
    }

    result.push(primitive);
  }

  return result;
}

function buildComponents(boundsList: Bounds[]): number[][] {
  const parents = Array.from({ length: boundsList.length }, (_, index) => index);

  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };

  for (let i = 0; i < boundsList.length; i++) {
    for (let j = i + 1; j < boundsList.length; j++) {
      if (boxesNear(boundsList[i], boundsList[j], 2.0)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < boundsList.length; i++) {
    const root = find(i);
    const group = groups.get(root) || [];
    group.push(i);
    groups.set(root, group);
  }
  return Array.from(groups.values());
}

function chooseComponentsToKeep(components: ComponentStats[], overallBounds: Bounds, keepCount: number): number[] {
  const totalArea = Math.max(1, area(overallBounds));
  const sorted = components
    .map((component, index) => ({ component, index }))
    .sort((a, b) => b.component.score - a.component.score);

  const keep = new Set<number>();
  for (const { index } of sorted.slice(0, keepCount)) {
    keep.add(index);
  }

  for (const { component, index } of sorted) {
    const areaRatio = component.area / totalArea;
    const width = component.bounds.maxX - component.bounds.minX;
    const height = component.bounds.maxY - component.bounds.minY;
    const maxDim = Math.max(width, height);

    if (component.circleCount > 0 && maxDim > 4) keep.add(index);
    if (areaRatio >= 0.025) keep.add(index);
    if (component.primitiveCount >= 80 && areaRatio >= 0.01) keep.add(index);
  }

  return Array.from(keep.values());
}

function computeComponentStats(primitives: SymbolPrimitive[], boundsList: Bounds[], indices: number[]): ComponentStats {
  const bounds = mergeBounds(indices.map((index) => boundsList[index]));
  let totalLength = 0;
  let circleCount = 0;
  let tinyPrimitiveCount = 0;

  for (const index of indices) {
    const primitive = primitives[index];
    const primitiveBounds = boundsList[index];
    const width = primitiveBounds.maxX - primitiveBounds.minX;
    const height = primitiveBounds.maxY - primitiveBounds.minY;
    if (Math.max(width, height) <= 8 && Math.min(width, height) <= 6) tinyPrimitiveCount += 1;

    switch (primitive.type) {
      case 'line':
        totalLength += Math.hypot(primitive.x2 - primitive.x1, primitive.y2 - primitive.y1);
        break;
      case 'polyline':
        totalLength += primitive.points.reduce((sum, pt, pointIndex) => {
          if (pointIndex === 0) return 0;
          const prev = primitive.points[pointIndex - 1];
          return sum + Math.hypot(pt.x - prev.x, pt.y - prev.y);
        }, 0);
        break;
      case 'arc':
        totalLength += Math.abs(primitive.endAngle - primitive.startAngle) * primitive.r;
        break;
      case 'circle':
        totalLength += 2 * Math.PI * primitive.r;
        circleCount += 1;
        break;
    }
  }

  const componentArea = Math.max(1, area(bounds));
  const score =
    Math.sqrt(componentArea) * 2 +
    totalLength * 0.08 +
    circleCount * 8 -
    (tinyPrimitiveCount / Math.max(1, indices.length)) * 20;

  return {
    indices,
    bounds,
    area: componentArea,
    primitiveCount: indices.length,
    totalLength,
    circleCount,
    tinyPrimitiveCount,
    score,
  };
}

function computePrimitiveBounds(primitive: SymbolPrimitive): Bounds {
  switch (primitive.type) {
    case 'line':
      return {
        minX: Math.min(primitive.x1, primitive.x2),
        minY: Math.min(primitive.y1, primitive.y2),
        maxX: Math.max(primitive.x1, primitive.x2),
        maxY: Math.max(primitive.y1, primitive.y2),
      };
    case 'rect':
      return { minX: primitive.x, minY: primitive.y, maxX: primitive.x + primitive.width, maxY: primitive.y + primitive.height };
    case 'circle':
      return { minX: primitive.cx - primitive.r, minY: primitive.cy - primitive.r, maxX: primitive.cx + primitive.r, maxY: primitive.cy + primitive.r };
    case 'arc':
      return { minX: primitive.cx - primitive.r, minY: primitive.cy - primitive.r, maxX: primitive.cx + primitive.r, maxY: primitive.cy + primitive.r };
    case 'ellipse':
      return { minX: primitive.cx - primitive.rx, minY: primitive.cy - primitive.ry, maxX: primitive.cx + primitive.rx, maxY: primitive.cy + primitive.ry };
    case 'polyline': {
      const xs = primitive.points.map((pt) => pt.x);
      const ys = primitive.points.map((pt) => pt.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case 'text':
      return { minX: primitive.x, minY: primitive.y, maxX: primitive.x, maxY: primitive.y };
    case 'path':
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

function mergeBounds(boundsList: Bounds[]): Bounds {
  return boundsList.reduce<Bounds>((acc, bounds) => ({
    minX: Math.min(acc.minX, bounds.minX),
    minY: Math.min(acc.minY, bounds.minY),
    maxX: Math.max(acc.maxX, bounds.maxX),
    maxY: Math.max(acc.maxY, bounds.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function boxesNear(a: Bounds, b: Bounds, padding: number): boolean {
  return !(
    a.maxX + padding < b.minX ||
    b.maxX + padding < a.minX ||
    a.maxY + padding < b.minY ||
    b.maxY + padding < a.minY
  );
}

function area(bounds: Bounds): number {
  return Math.max(0.1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
}

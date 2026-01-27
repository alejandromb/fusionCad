/**
 * Segment Nudging Algorithm
 *
 * Separates overlapping wire segments by offsetting them perpendicular to their direction.
 * Based on the approach from libavoid (Wybrow, Marriott, Stuckey 2009).
 */

import type { Point, PathSegment, RoutedPath } from './types.js';

/**
 * Extended segment with routing metadata
 */
interface NudgedSegment extends PathSegment {
  routeId: string; // Which route this segment belongs to
  offset: number; // Perpendicular offset applied
  bundleId?: string; // ID of overlap bundle this segment belongs to
}

/**
 * Bundle of overlapping segments
 */
interface SegmentBundle {
  id: string;
  segments: NudgedSegment[];
  direction: 'horizontal' | 'vertical';
  fixedCoord: number; // The coordinate that's fixed (y for horizontal, x for vertical)
  minRange: number; // Start of overlap range
  maxRange: number; // End of overlap range
}

/**
 * Check if two segments overlap (are collinear and share space)
 */
function segmentsOverlap(s1: NudgedSegment, s2: NudgedSegment): boolean {
  // Must be same direction
  if (s1.direction !== s2.direction) return false;

  if (s1.direction === 'horizontal') {
    // Check if y coordinates are the same (or very close)
    const y1 = s1.start.y;
    const y2 = s2.start.y;
    if (Math.abs(y1 - y2) > 0.1) return false;

    // Check if x ranges overlap
    const x1Min = Math.min(s1.start.x, s1.end.x);
    const x1Max = Math.max(s1.start.x, s1.end.x);
    const x2Min = Math.min(s2.start.x, s2.end.x);
    const x2Max = Math.max(s2.start.x, s2.end.x);

    return x1Max > x2Min && x2Max > x1Min;
  } else {
    // Vertical: check if x coordinates are the same
    const x1 = s1.start.x;
    const x2 = s2.start.x;
    if (Math.abs(x1 - x2) > 0.1) return false;

    // Check if y ranges overlap
    const y1Min = Math.min(s1.start.y, s1.end.y);
    const y1Max = Math.max(s1.start.y, s1.end.y);
    const y2Min = Math.min(s2.start.y, s2.end.y);
    const y2Max = Math.max(s2.start.y, s2.end.y);

    return y1Max > y2Min && y2Max > y1Min;
  }
}

/**
 * Group overlapping segments into bundles
 */
function findOverlapBundles(segments: NudgedSegment[]): SegmentBundle[] {
  const bundles: SegmentBundle[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < segments.length; i++) {
    if (processed.has(i)) continue;

    const segment = segments[i];
    const bundle: SegmentBundle = {
      id: `bundle_${bundles.length}`,
      segments: [segment],
      direction: segment.direction,
      fixedCoord: segment.direction === 'horizontal' ? segment.start.y : segment.start.x,
      minRange: segment.direction === 'horizontal'
        ? Math.min(segment.start.x, segment.end.x)
        : Math.min(segment.start.y, segment.end.y),
      maxRange: segment.direction === 'horizontal'
        ? Math.max(segment.start.x, segment.end.x)
        : Math.max(segment.start.y, segment.end.y),
    };

    processed.add(i);

    // Find all segments that overlap with this one
    for (let j = i + 1; j < segments.length; j++) {
      if (processed.has(j)) continue;

      const otherSegment = segments[j];

      // Check if overlaps with any segment in current bundle
      let overlapsWithBundle = false;
      for (const bundleSegment of bundle.segments) {
        if (segmentsOverlap(bundleSegment, otherSegment)) {
          overlapsWithBundle = true;
          break;
        }
      }

      if (overlapsWithBundle) {
        bundle.segments.push(otherSegment);
        processed.add(j);

        // Expand bundle range
        if (bundle.direction === 'horizontal') {
          const segMin = Math.min(otherSegment.start.x, otherSegment.end.x);
          const segMax = Math.max(otherSegment.start.x, otherSegment.end.x);
          bundle.minRange = Math.min(bundle.minRange, segMin);
          bundle.maxRange = Math.max(bundle.maxRange, segMax);
        } else {
          const segMin = Math.min(otherSegment.start.y, otherSegment.end.y);
          const segMax = Math.max(otherSegment.start.y, otherSegment.end.y);
          bundle.minRange = Math.min(bundle.minRange, segMin);
          bundle.maxRange = Math.max(bundle.maxRange, segMax);
        }
      }
    }

    // Only create bundle if there are multiple segments
    if (bundle.segments.length > 1) {
      bundles.push(bundle);
    }
  }

  return bundles;
}

/**
 * Sort segments within a bundle to determine offset order
 * Uses route ID for consistent ordering
 */
function sortBundleSegments(bundle: SegmentBundle): void {
  bundle.segments.sort((a, b) => {
    return a.routeId.localeCompare(b.routeId);
  });
}

/**
 * Apply offsets to segments in a bundle to separate them
 */
function applyBundleOffsets(bundle: SegmentBundle, spacing: number): void {
  const numSegments = bundle.segments.length;
  const totalOffset = (numSegments - 1) * spacing;
  const startOffset = -totalOffset / 2; // Center the bundle

  for (let i = 0; i < numSegments; i++) {
    const segment = bundle.segments[i];
    segment.offset = startOffset + i * spacing;
    segment.bundleId = bundle.id;
  }
}

/**
 * Apply offset to segment points
 */
function applyOffsetToSegment(segment: NudgedSegment): PathSegment {
  if (Math.abs(segment.offset) < 0.1) {
    // No offset needed
    return segment;
  }

  if (segment.direction === 'horizontal') {
    // Offset vertically (perpendicular to horizontal)
    return {
      start: { x: segment.start.x, y: segment.start.y + segment.offset },
      end: { x: segment.end.x, y: segment.end.y + segment.offset },
      direction: segment.direction,
    };
  } else {
    // Offset horizontally (perpendicular to vertical)
    return {
      start: { x: segment.start.x + segment.offset, y: segment.start.y },
      end: { x: segment.end.x + segment.offset, y: segment.end.y },
      direction: segment.direction,
    };
  }
}

/**
 * Main nudging algorithm: separates overlapping segments
 */
export function nudgeRoutes(
  routes: Map<string, RoutedPath>,
  spacing = 8
): Map<string, RoutedPath> {
  // Collect all segments with route IDs
  const allSegments: NudgedSegment[] = [];

  for (const [routeId, route] of routes.entries()) {
    for (const segment of route.segments) {
      allSegments.push({
        ...segment,
        routeId,
        offset: 0,
      });
    }
  }

  // Find overlapping segment bundles
  const bundles = findOverlapBundles(allSegments);

  console.log(`[Nudging] Found ${bundles.length} overlap bundles from ${allSegments.length} segments`);

  // Apply offsets to each bundle
  for (const bundle of bundles) {
    console.log(`[Nudging] Bundle ${bundle.id}: ${bundle.segments.length} segments, ${bundle.direction}, coord=${bundle.fixedCoord}`);
    sortBundleSegments(bundle);
    applyBundleOffsets(bundle, spacing);

    // Log applied offsets
    for (const seg of bundle.segments) {
      console.log(`  - Route ${seg.routeId}: offset=${seg.offset.toFixed(1)}px`);
    }
  }

  // Reconstruct routes with nudged segments, maintaining orthogonality
  const nudgedRoutes = new Map<string, RoutedPath>();

  for (const [routeId, originalRoute] of routes.entries()) {
    // Find nudged segments for this route (in order)
    const routeSegments = allSegments.filter(s => s.routeId === routeId);

    // Build waypoints by offsetting and reconnecting orthogonally
    const waypoints: Point[] = [];

    if (routeSegments.length === 0) {
      // No segments - use original route
      nudgedRoutes.set(routeId, originalRoute);
      continue;
    }

    // Start with first segment's start point (with offset if applicable)
    const firstSeg = routeSegments[0];
    const firstOffset = applyOffsetToSegment(firstSeg);
    waypoints.push(firstOffset.start);

    // Process each segment
    for (let i = 0; i < routeSegments.length; i++) {
      const segment = routeSegments[i];
      const offsetSegment = applyOffsetToSegment(segment);

      // If this segment's start doesn't match the last waypoint, add connector
      const lastWaypoint = waypoints[waypoints.length - 1];
      if (Math.abs(offsetSegment.start.x - lastWaypoint.x) > 0.1 ||
          Math.abs(offsetSegment.start.y - lastWaypoint.y) > 0.1) {
        // Need to connect - add orthogonal connector
        if (segment.direction === 'horizontal') {
          // Last segment was vertical, this is horizontal
          // Add vertical connector from last point to this segment's Y
          waypoints.push({ x: lastWaypoint.x, y: offsetSegment.start.y });
        } else {
          // Last segment was horizontal, this is vertical
          // Add horizontal connector from last point to this segment's X
          waypoints.push({ x: offsetSegment.start.x, y: lastWaypoint.y });
        }
      }

      // Add this segment's end point
      waypoints.push(offsetSegment.end);
    }

    // Convert waypoints to segments
    const finalSegments: PathSegment[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];

      let direction: 'horizontal' | 'vertical';
      if (Math.abs(start.y - end.y) < 0.1) {
        direction = 'horizontal';
      } else if (Math.abs(start.x - end.x) < 0.1) {
        direction = 'vertical';
      } else {
        // Should not happen - skip diagonal segments
        console.warn(`[Nudging] Diagonal segment detected: (${start.x},${start.y}) to (${end.x},${end.y})`);
        continue;
      }

      finalSegments.push({ start, end, direction });
    }

    // Calculate total length
    let totalLength = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dx = waypoints[i + 1].x - waypoints[i].x;
      const dy = waypoints[i + 1].y - waypoints[i].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }

    nudgedRoutes.set(routeId, {
      segments: finalSegments,
      waypoints,
      totalLength,
    });
  }

  return nudgedRoutes;
}

/**
 * Visibility Graph Builder
 *
 * Builds an orthogonal visibility graph for wire routing around obstacles.
 */

import type {
  Point,
  Rectangle,
  Obstacle,
  VisibilityGraph,
  VisibilityNode,
  VisibilityEdge
} from './types.js';

/**
 * Expand obstacle bounds by padding to create clearance
 */
function expandObstacle(bounds: Rectangle, padding: number): Rectangle {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

/**
 * Get corner points of an obstacle (for orthogonal routing)
 */
function getCornerPoints(obstacle: Obstacle, padding: number): Point[] {
  const expanded = expandObstacle(obstacle.bounds, padding);
  return [
    { x: expanded.x, y: expanded.y }, // top-left
    { x: expanded.x + expanded.width, y: expanded.y }, // top-right
    { x: expanded.x, y: expanded.y + expanded.height }, // bottom-left
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height }, // bottom-right
  ];
}

/**
 * Check if two points can be connected horizontally without intersecting obstacles
 */
function isHorizontalVisible(
  p1: Point,
  p2: Point,
  obstacles: Obstacle[],
  padding: number,
  start?: Point,
  end?: Point
): boolean {
  if (p1.y !== p2.y) return false; // Not horizontal

  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const y = p1.y;

  // Check if segment intersects any obstacle
  for (const obstacle of obstacles) {
    // If this segment connects to start or end, use NO padding (allow pins on obstacle edges)
    const isStartOrEnd = (start && (distance(p1, start) < 0.1 || distance(p2, start) < 0.1)) ||
                         (end && (distance(p1, end) < 0.1 || distance(p2, end) < 0.1));
    const effectivePadding = isStartOrEnd ? 0 : padding;

    const expanded = expandObstacle(obstacle.bounds, effectivePadding);

    // Check if horizontal line intersects obstacle
    if (
      y > expanded.y &&
      y < expanded.y + expanded.height &&
      maxX > expanded.x &&
      minX < expanded.x + expanded.width
    ) {
      return false; // Intersects obstacle
    }
  }

  return true;
}

/**
 * Check if two points can be connected vertically without intersecting obstacles
 */
function isVerticalVisible(
  p1: Point,
  p2: Point,
  obstacles: Obstacle[],
  padding: number,
  start?: Point,
  end?: Point
): boolean {
  if (p1.x !== p2.x) return false; // Not vertical

  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  const x = p1.x;

  // Check if segment intersects any obstacle
  for (const obstacle of obstacles) {
    // If this segment connects to start or end, use NO padding (allow pins on obstacle edges)
    const isStartOrEnd = (start && (distance(p1, start) < 0.1 || distance(p2, start) < 0.1)) ||
                         (end && (distance(p1, end) < 0.1 || distance(p2, end) < 0.1));
    const effectivePadding = isStartOrEnd ? 0 : padding;

    const expanded = expandObstacle(obstacle.bounds, effectivePadding);

    // Check if vertical line intersects obstacle
    if (
      x > expanded.x &&
      x < expanded.x + expanded.width &&
      maxY > expanded.y &&
      minY < expanded.y + expanded.height
    ) {
      return false; // Intersects obstacle
    }
  }

  return true;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build orthogonal visibility graph
 */
export function buildVisibilityGraph(
  obstacles: Obstacle[],
  start: Point,
  end: Point,
  padding = 10
): VisibilityGraph {
  const nodes = new Map<string, VisibilityNode>();
  const edges: VisibilityEdge[] = [];

  // Add start and end points
  const startId = 'start';
  const endId = 'end';

  nodes.set(startId, {
    id: startId,
    point: start,
    type: 'start',
  });

  nodes.set(endId, {
    id: endId,
    point: end,
    type: 'end',
  });

  // Add obstacle corner points
  for (const obstacle of obstacles) {
    const corners = getCornerPoints(obstacle, padding);

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const nodeId = `${obstacle.id}_corner_${i}`;

      nodes.set(nodeId, {
        id: nodeId,
        point: corner,
        type: 'corner',
        obstacleId: obstacle.id,
      });
    }
  }

  // Generate orthogonal waypoints at all unique X and Y coordinates
  // This creates a grid of potential routing points
  // CRITICAL: Add scan lines through start and end points for direct routing
  const allPoints = Array.from(nodes.values()).map(n => n.point);

  // Include start and end coordinates to create scan lines
  const uniqueX = [...new Set([...allPoints.map(p => p.x), start.x, end.x])].sort((a, b) => a - b);
  const uniqueY = [...new Set([...allPoints.map(p => p.y), start.y, end.y])].sort((a, b) => a - b);

  // Add waypoint nodes at grid intersections that don't overlap obstacles
  let waypointIndex = 0;
  for (const x of uniqueX) {
    for (const y of uniqueY) {
      const point = { x, y };

      // Skip if point is too close to an existing node
      let tooClose = false;
      for (const node of nodes.values()) {
        if (distance(node.point, point) < 0.1) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Skip if point is inside an obstacle
      // EXCEPTION: Allow waypoints on start/end scan lines with reduced padding
      const isOnScanLine = (Math.abs(y - start.y) < 0.1) || (Math.abs(y - end.y) < 0.1) ||
                           (Math.abs(x - start.x) < 0.1) || (Math.abs(x - end.x) < 0.1);
      const effectivePadding = isOnScanLine ? 0 : padding; // No padding on scan lines

      let insideObstacle = false;
      for (const obstacle of obstacles) {
        const expanded = expandObstacle(obstacle.bounds, effectivePadding);
        if (
          x >= expanded.x &&
          x <= expanded.x + expanded.width &&
          y >= expanded.y &&
          y <= expanded.y + expanded.height
        ) {
          insideObstacle = true;
          break;
        }
      }

      if (!insideObstacle) {
        const waypointId = `waypoint_${waypointIndex++}`;
        nodes.set(waypointId, {
          id: waypointId,
          point,
          type: 'waypoint',
        });
      }
    }
  }

  // Build edges between visible nodes (orthogonal only)
  const nodeArray = Array.from(nodes.values());

  for (let i = 0; i < nodeArray.length; i++) {
    for (let j = i + 1; j < nodeArray.length; j++) {
      const n1 = nodeArray[i];
      const n2 = nodeArray[j];

      // Check horizontal visibility
      if (n1.point.y === n2.point.y) {
        if (isHorizontalVisible(n1.point, n2.point, obstacles, padding, start, end)) {
          const weight = Math.abs(n2.point.x - n1.point.x);
          edges.push({
            from: n1.id,
            to: n2.id,
            weight,
            direction: 'horizontal',
          });
        }
      }

      // Check vertical visibility
      if (n1.point.x === n2.point.x) {
        if (isVerticalVisible(n1.point, n2.point, obstacles, padding, start, end)) {
          const weight = Math.abs(n2.point.y - n1.point.y);
          edges.push({
            from: n1.id,
            to: n2.id,
            weight,
            direction: 'vertical',
          });
        }
      }
    }
  }

  return { nodes, edges };
}

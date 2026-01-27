/**
 * Orthogonal Wire Router
 *
 * Main router that combines visibility graph and A* pathfinding.
 */

import type {
  Point,
  Obstacle,
  RouteRequest,
  RouteResult,
  RoutedPath,
  PathSegment,
} from './types.js';
import { buildVisibilityGraph } from './visibility-graph.js';
import { findPath } from './astar.js';
import { nudgeRoutes } from './nudging.js';

/**
 * Calculate total path length
 */
function calculatePathLength(waypoints: Point[]): number {
  let length = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

/**
 * Convert waypoints to path segments
 */
function waypointsToSegments(waypoints: Point[]): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];

    // Determine direction
    let direction: 'horizontal' | 'vertical';
    if (start.y === end.y) {
      direction = 'horizontal';
    } else if (start.x === end.x) {
      direction = 'vertical';
    } else {
      // Should not happen in orthogonal routing, but handle gracefully
      // Add two segments: horizontal then vertical
      const midpoint = { x: end.x, y: start.y };
      segments.push({
        start,
        end: midpoint,
        direction: 'horizontal',
      });
      segments.push({
        start: midpoint,
        end,
        direction: 'vertical',
      });
      continue;
    }

    segments.push({ start, end, direction });
  }

  return segments;
}

/**
 * Route a single wire using orthogonal visibility graph and A*
 */
export function routeWire(
  request: RouteRequest,
  obstacles: Obstacle[],
  padding = 10
): RouteResult {
  try {
    // Build visibility graph
    const graph = buildVisibilityGraph(
      obstacles,
      request.start,
      request.end,
      padding
    );

    console.log(`[RouteWire] ${request.id}: graph has ${graph.nodes.size} nodes, ${graph.edges.length} edges`);

    // Find path using A*
    const pathNodeIds = findPath(graph, 'start', 'end');

    console.log(`[RouteWire] ${request.id}: A* found path: ${pathNodeIds ? 'YES' : 'NO'}, nodes=${pathNodeIds?.length || 0}`);

    if (!pathNodeIds) {
      return {
        id: request.id,
        path: {
          segments: [],
          totalLength: 0,
          waypoints: [],
        },
        success: false,
        error: 'No path found',
      };
    }

    // Convert node IDs to waypoints
    const waypoints: Point[] = pathNodeIds.map((nodeId: string) => {
      const node = graph.nodes.get(nodeId);
      if (!node) {
        throw new Error(`Node ${nodeId} not found in graph`);
      }
      return node.point;
    });

    // Convert waypoints to segments
    const segments = waypointsToSegments(waypoints);
    const totalLength = calculatePathLength(waypoints);

    const path: RoutedPath = {
      segments,
      totalLength,
      waypoints,
    };

    return {
      id: request.id,
      path,
      success: true,
    };
  } catch (error) {
    return {
      id: request.id,
      path: {
        segments: [],
        totalLength: 0,
        waypoints: [],
      },
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Route multiple wires with nudging to separate overlapping segments
 */
export function routeWires(
  requests: RouteRequest[],
  obstacles: Obstacle[],
  padding = 10,
  spacing = 8
): RouteResult[] {
  // Step 1: Route all wires using visibility graph + A*
  const initialResults = requests.map(request => routeWire(request, obstacles, padding));

  console.log(`[Router] Routed ${initialResults.length} wires`);

  // Step 2: Collect successful routes for nudging
  const routeMap = new Map<string, RoutedPath>();
  for (const result of initialResults) {
    console.log(`[Router] ${result.id}: success=${result.success}, segments=${result.path.segments.length}, error=${result.error || 'none'}`);
    if (result.success && result.path.segments.length > 0) {
      routeMap.set(result.id, result.path);
    }
  }

  console.log(`[Router] ${routeMap.size} successful routes to nudge`);

  // Step 3: Apply nudging to separate overlapping segments
  const nudgedRoutes = nudgeRoutes(routeMap, spacing);

  // Step 4: Return results with nudged paths
  return initialResults.map(result => {
    if (!result.success) {
      return result; // Keep failed routes as-is
    }

    const nudgedPath = nudgedRoutes.get(result.id);
    if (nudgedPath) {
      return {
        ...result,
        path: nudgedPath,
      };
    }

    return result;
  });
}

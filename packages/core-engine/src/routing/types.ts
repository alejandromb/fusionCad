/**
 * Routing types for orthogonal wire routing
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Obstacle {
  id: string;
  bounds: Rectangle;
}

/**
 * A node in the visibility graph
 */
export interface VisibilityNode {
  id: string;
  point: Point;
  type: 'start' | 'end' | 'corner' | 'waypoint';
  obstacleId?: string; // If this is a corner of an obstacle
}

/**
 * An edge in the visibility graph
 */
export interface VisibilityEdge {
  from: string; // node id
  to: string; // node id
  weight: number; // Euclidean distance
  direction: 'horizontal' | 'vertical';
}

/**
 * Visibility graph containing nodes and edges
 */
export interface VisibilityGraph {
  nodes: Map<string, VisibilityNode>;
  edges: VisibilityEdge[];
}

/**
 * A segment of a routed wire path
 */
export interface PathSegment {
  start: Point;
  end: Point;
  direction: 'horizontal' | 'vertical';
}

/**
 * Complete routed path from start to end
 */
export interface RoutedPath {
  segments: PathSegment[];
  totalLength: number;
  waypoints: Point[]; // All points including start and end
}

/**
 * Wire routing request
 */
export interface RouteRequest {
  id: string; // Connection/wire ID
  start: Point;
  end: Point;
  netId?: string; // Optional net ID for grouping
}

/**
 * Wire routing result
 */
export interface RouteResult {
  id: string;
  path: RoutedPath;
  success: boolean;
  error?: string;
}

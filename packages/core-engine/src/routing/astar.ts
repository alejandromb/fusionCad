/**
 * A* Pathfinding Algorithm
 *
 * Finds the shortest path through a visibility graph.
 */

import type { Point, VisibilityGraph, VisibilityEdge } from './types.js';

/**
 * Calculate Manhattan distance heuristic (admissible for orthogonal routing)
 */
function manhattanDistance(p1: Point, p2: Point): number {
  return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
}

/**
 * A* node for priority queue
 */
interface AStarNode {
  id: string;
  gScore: number; // Cost from start
  fScore: number; // gScore + heuristic
  parent: string | null;
}

/**
 * Priority queue for A* algorithm (min-heap based on fScore)
 */
class PriorityQueue {
  private items: AStarNode[] = [];

  push(node: AStarNode): void {
    this.items.push(node);
    this.items.sort((a, b) => a.fScore - b.fScore);
  }

  pop(): AStarNode | undefined {
    return this.items.shift();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  updateNode(id: string, gScore: number, fScore: number, parent: string): void {
    const index = this.items.findIndex(n => n.id === id);
    if (index !== -1) {
      this.items[index] = { id, gScore, fScore, parent };
      this.items.sort((a, b) => a.fScore - b.fScore);
    }
  }

  contains(id: string): boolean {
    return this.items.some(n => n.id === id);
  }

  getNode(id: string): AStarNode | undefined {
    return this.items.find(n => n.id === id);
  }
}

/**
 * Build adjacency list from edges
 */
function buildAdjacencyList(edges: VisibilityEdge[]): Map<string, VisibilityEdge[]> {
  const adjacency = new Map<string, VisibilityEdge[]>();

  for (const edge of edges) {
    // Add forward edge
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge);

    // Add reverse edge (undirected graph)
    if (!adjacency.has(edge.to)) {
      adjacency.set(edge.to, []);
    }
    adjacency.get(edge.to)!.push({
      from: edge.to,
      to: edge.from,
      weight: edge.weight,
      direction: edge.direction,
    });
  }

  return adjacency;
}

/**
 * Find shortest path using A* algorithm
 *
 * @param graph Visibility graph to search
 * @param startId Node ID to start from
 * @param endId Node ID to reach
 * @returns Array of node IDs forming the path, or null if no path exists
 */
export function findPath(
  graph: VisibilityGraph,
  startId: string,
  endId: string
): string[] | null {
  const startNode = graph.nodes.get(startId);
  const endNode = graph.nodes.get(endId);

  if (!startNode || !endNode) {
    return null; // Start or end not in graph
  }

  const adjacency = buildAdjacencyList(graph.edges);

  // Check if start and end nodes have any connections
  const startNeighbors = adjacency.get(startId) || [];
  const endNeighbors = adjacency.get(endId) || [];

  const openSet = new PriorityQueue();
  const closedSet = new Set<string>();
  const gScores = new Map<string, number>();
  const parents = new Map<string, string>();

  // Initialize start node
  const initialHeuristic = manhattanDistance(startNode.point, endNode.point);
  gScores.set(startId, 0);
  openSet.push({
    id: startId,
    gScore: 0,
    fScore: initialHeuristic,
    parent: null,
  });

  let iterations = 0;

  while (!openSet.isEmpty()) {
    iterations++;
    const current = openSet.pop()!;

    // Reached goal
    if (current.id === endId) {
      // Reconstruct path
      const path: string[] = [];
      let nodeId: string | null = endId;

      while (nodeId !== null) {
        path.unshift(nodeId);
        nodeId = parents.get(nodeId) || null;
      }

      return path;
    }

    closedSet.add(current.id);

    // Check neighbors
    const neighbors = adjacency.get(current.id) || [];

    for (const edge of neighbors) {
      const neighborId = edge.to;

      if (closedSet.has(neighborId)) {
        continue; // Already evaluated
      }

      const tentativeGScore = current.gScore + edge.weight;

      // Check if this is a better path
      const existingGScore = gScores.get(neighborId);
      if (existingGScore === undefined || tentativeGScore < existingGScore) {
        // Update scores and parent
        gScores.set(neighborId, tentativeGScore);
        parents.set(neighborId, current.id);

        const neighborNode = graph.nodes.get(neighborId)!;
        const heuristic = manhattanDistance(neighborNode.point, endNode.point);
        const fScore = tentativeGScore + heuristic;

        if (openSet.contains(neighborId)) {
          openSet.updateNode(neighborId, tentativeGScore, fScore, current.id);
        } else {
          openSet.push({
            id: neighborId,
            gScore: tentativeGScore,
            fScore,
            parent: current.id,
          });
        }
      }
    }
  }

  return null; // No path found
}

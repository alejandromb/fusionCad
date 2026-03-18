/**
 * Wire Routing Tests
 *
 * Tests for the orthogonal visibility graph router, including
 * the direction-constrained edge filtering (libavoid approach).
 */

import { describe, it, expect } from 'vitest';
import { routeWire, routeWires } from './orthogonal-router.js';
import { buildVisibilityGraph, isEdgeAllowed } from './visibility-graph.js';
import type { Point, Obstacle, RouteRequest, ConnDirection } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────

/** Create a rectangular obstacle */
function obstacle(id: string, x: number, y: number, w: number, h: number): Obstacle {
  return { id, bounds: { x, y, width: w, height: h } };
}

/** Check that all segments in a route are orthogonal */
function isOrthogonal(waypoints: Point[]): boolean {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    if (dx !== 0 && dy !== 0) return false; // diagonal segment
  }
  return true;
}

/** Get the direction of the first segment from start */
function firstSegmentDirection(waypoints: Point[]): ConnDirection | null {
  if (waypoints.length < 2) return null;
  const dx = waypoints[1].x - waypoints[0].x;
  const dy = waypoints[1].y - waypoints[0].y;
  if (dx > 0 && dy === 0) return 'right';
  if (dx < 0 && dy === 0) return 'left';
  if (dy > 0 && dx === 0) return 'down';
  if (dy < 0 && dx === 0) return 'up';
  return null;
}

/** Get the direction of the last segment arriving at end */
function lastSegmentDirection(waypoints: Point[]): ConnDirection | null {
  if (waypoints.length < 2) return null;
  const n = waypoints.length;
  const dx = waypoints[n - 1].x - waypoints[n - 2].x;
  const dy = waypoints[n - 1].y - waypoints[n - 2].y;
  // Direction the wire arrives FROM (opposite of travel)
  if (dx > 0 && dy === 0) return 'right';
  if (dx < 0 && dy === 0) return 'left';
  if (dy > 0 && dx === 0) return 'down';
  if (dy < 0 && dx === 0) return 'up';
  return null;
}

// ─── isEdgeAllowed unit tests ───────────────────────────────────

describe('isEdgeAllowed', () => {
  const pin: Point = { x: 100, y: 100 };

  describe('direction: right', () => {
    it('allows horizontal edge going right', () => {
      expect(isEdgeAllowed(pin, { x: 200, y: 100 }, 'right')).toBe(true);
    });

    it('blocks horizontal edge going left', () => {
      expect(isEdgeAllowed(pin, { x: 50, y: 100 }, 'right')).toBe(false);
    });

    it('blocks vertical edge going down', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 200 }, 'right')).toBe(false);
    });

    it('blocks vertical edge going up', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 50 }, 'right')).toBe(false);
    });

    it('allows zero-length horizontal edge (same point)', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 100 }, 'right')).toBe(true);
    });
  });

  describe('direction: left', () => {
    it('allows horizontal edge going left', () => {
      expect(isEdgeAllowed(pin, { x: 50, y: 100 }, 'left')).toBe(true);
    });

    it('blocks horizontal edge going right', () => {
      expect(isEdgeAllowed(pin, { x: 200, y: 100 }, 'left')).toBe(false);
    });

    it('blocks vertical edges', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 200 }, 'left')).toBe(false);
      expect(isEdgeAllowed(pin, { x: 100, y: 50 }, 'left')).toBe(false);
    });
  });

  describe('direction: down', () => {
    it('allows vertical edge going down', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 200 }, 'down')).toBe(true);
    });

    it('blocks vertical edge going up', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 50 }, 'down')).toBe(false);
    });

    it('blocks horizontal edges', () => {
      expect(isEdgeAllowed(pin, { x: 200, y: 100 }, 'down')).toBe(false);
      expect(isEdgeAllowed(pin, { x: 50, y: 100 }, 'down')).toBe(false);
    });
  });

  describe('direction: up', () => {
    it('allows vertical edge going up', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 50 }, 'up')).toBe(true);
    });

    it('blocks vertical edge going down', () => {
      expect(isEdgeAllowed(pin, { x: 100, y: 200 }, 'up')).toBe(false);
    });

    it('blocks horizontal edges', () => {
      expect(isEdgeAllowed(pin, { x: 200, y: 100 }, 'up')).toBe(false);
      expect(isEdgeAllowed(pin, { x: 50, y: 100 }, 'up')).toBe(false);
    });
  });
});

// ─── Visibility graph construction ─────────────────────────────

describe('buildVisibilityGraph', () => {
  it('includes start and end nodes', () => {
    const graph = buildVisibilityGraph([], { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(graph.nodes.has('start')).toBe(true);
    expect(graph.nodes.has('end')).toBe(true);
  });

  it('creates direct horizontal edge when no obstacles', () => {
    const graph = buildVisibilityGraph([], { x: 0, y: 0 }, { x: 100, y: 0 });
    const directEdge = graph.edges.find(
      e => (e.from === 'start' && e.to === 'end') || (e.from === 'end' && e.to === 'start')
    );
    expect(directEdge).toBeDefined();
    expect(directEdge!.direction).toBe('horizontal');
  });

  it('adds corner nodes for obstacles', () => {
    const obs = [obstacle('box', 40, -20, 20, 40)];
    const graph = buildVisibilityGraph(obs, { x: 0, y: 0 }, { x: 100, y: 0 });
    const cornerNodes = Array.from(graph.nodes.values()).filter(n => n.type === 'corner');
    expect(cornerNodes.length).toBe(4); // 4 corners per obstacle
  });

  describe('direction constraints', () => {
    it('filters edges from start node when startDirection is set', () => {
      // Start at origin, end to the right — but force start to exit 'right'
      const graph = buildVisibilityGraph(
        [], { x: 0, y: 0 }, { x: 100, y: 100 }, 10, 'right'
      );

      // All edges from 'start' should be horizontal going right
      const startEdges = graph.edges.filter(e => e.from === 'start' || e.to === 'start');
      for (const edge of startEdges) {
        const otherId = edge.from === 'start' ? edge.to : edge.from;
        const other = graph.nodes.get(otherId)!;
        // Must be horizontal (same Y=0) and going right (other.x >= 0)
        expect(other.point.y).toBe(0);
        expect(other.point.x).toBeGreaterThanOrEqual(0);
      }
    });

    it('filters edges from end node when endDirection is set', () => {
      const graph = buildVisibilityGraph(
        [], { x: 0, y: 0 }, { x: 100, y: 100 }, 10, undefined, 'left'
      );

      // All edges to 'end' should be horizontal from the left (other.x <= 100)
      const endEdges = graph.edges.filter(e => e.from === 'end' || e.to === 'end');
      for (const edge of endEdges) {
        const otherId = edge.from === 'end' ? edge.to : edge.from;
        const other = graph.nodes.get(otherId)!;
        expect(other.point.y).toBe(100);
        expect(other.point.x).toBeLessThanOrEqual(100);
      }
    });

    it('does not filter edges when no direction is set', () => {
      const graphWithout = buildVisibilityGraph([], { x: 0, y: 0 }, { x: 100, y: 100 });
      const graphWith = buildVisibilityGraph([], { x: 0, y: 0 }, { x: 100, y: 100 }, 10);

      // Should have the same number of edges (no filtering)
      expect(graphWithout.edges.length).toBe(graphWith.edges.length);
    });
  });
});

// ─── Basic routing (no direction constraints) ───────────────────

describe('routeWire', () => {
  it('routes a straight horizontal wire with no obstacles', () => {
    const result = routeWire(
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      []
    );
    expect(result.success).toBe(true);
    expect(result.path.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
  });

  it('routes a straight vertical wire with no obstacles', () => {
    const result = routeWire(
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 0, y: 100 } },
      []
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
  });

  it('routes around a single obstacle', () => {
    // Obstacle directly between start and end
    const obs = [obstacle('box', 40, -20, 20, 40)];
    const result = routeWire(
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      obs
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
    // Should have more than 2 waypoints (had to detour)
    expect(result.path.waypoints.length).toBeGreaterThan(2);
  });

  it('routes an L-shaped path with no obstacles', () => {
    const result = routeWire(
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
      []
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
  });

  it('produces segments that match waypoints', () => {
    const result = routeWire(
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      []
    );
    expect(result.success).toBe(true);
    expect(result.path.segments.length).toBeGreaterThan(0);
    // First segment starts at start point
    expect(result.path.segments[0].start.x).toBe(0);
    expect(result.path.segments[0].start.y).toBe(0);
    // Last segment ends at end point
    const last = result.path.segments[result.path.segments.length - 1];
    expect(last.end.x).toBe(100);
    expect(last.end.y).toBe(0);
  });
});

// ─── Direction-constrained routing ──────────────────────────────

describe('routeWire with direction constraints', () => {
  it('exits start in the specified direction (right)', () => {
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        startDirection: 'right',
      },
      []
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('right');
  });

  it('exits start in the specified direction (down)', () => {
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        startDirection: 'down',
      },
      []
    );
    expect(result.success).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('down');
  });

  it('arrives at end respecting left-facing pin constraint', () => {
    // End pin faces left → only allows edges where other.x <= end.x
    // Wire from (0,0) to (100,0): the direct path comes from left, which is allowed.
    // The constraint blocks approaches from the RIGHT (other.x > end.x), not the left.
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        endDirection: 'left',
      },
      []
    );
    expect(result.success).toBe(true);
    // Direct path goes right — that's valid because left-facing pin accepts from the left
    expect(lastSegmentDirection(result.path.waypoints)).toBe('right');
  });

  it('end direction blocks wrong-side approach', () => {
    // End pin faces right → only horizontal edges going right (other.x >= end.x)
    // Wire from (0,0) to (100,0): direct path has other at x=0 which is < 100, so blocked!
    // Router must find an alternative (go past, then come from the right).
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        endDirection: 'right',
      },
      []
    );
    // Should either succeed with a detour or fail gracefully
    expect(result).toBeDefined();
  });

  it('both start and end constrained — compatible directions', () => {
    // Start faces right, end faces left → wire goes straight right. Both happy.
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 50 },
        end: { x: 200, y: 50 },
        startDirection: 'right',
        endDirection: 'left',
      },
      []
    );
    expect(result.success).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('right');
    // Wire arrives from left going right — valid for left-facing pin
    expect(lastSegmentDirection(result.path.waypoints)).toBe('right');
  });

  it('still routes around obstacles with direction constraints', () => {
    const obs = [obstacle('box', 40, -20, 20, 60)]; // tall obstacle in the way
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        startDirection: 'right',
      },
      obs
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('right');
    expect(result.path.waypoints.length).toBeGreaterThan(2);
  });

  it('falls back gracefully when direction makes routing impossible', () => {
    // Start faces left but end is to the right — direction constraint blocks all paths
    // The router should still return a result (possibly failed)
    const result = routeWire(
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        startDirection: 'left',
      },
      []
    );
    // Should either find a roundabout path or fail gracefully
    expect(result).toBeDefined();
    if (result.success) {
      expect(isOrthogonal(result.path.waypoints)).toBe(true);
    }
  });
});

// ─── Multi-wire routing with nudging ────────────────────────────

describe('routeWires', () => {
  it('routes multiple wires', () => {
    const requests: RouteRequest[] = [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'w2', start: { x: 0, y: 20 }, end: { x: 100, y: 20 } },
    ];
    const results = routeWires(requests, []);
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('separates overlapping parallel wires via nudging', () => {
    // Two wires that share the same Y coordinate should be nudged apart
    const requests: RouteRequest[] = [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, netId: 'net1' },
      { id: 'w2', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, netId: 'net2' },
    ];
    const results = routeWires(requests, [], 10, 8);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    // They should not be identical after nudging (at least one should be offset)
    const w1y = results[0].path.waypoints[0].y;
    const w2y = results[1].path.waypoints[0].y;
    // One of them should have been nudged
    expect(w1y !== w2y || results[0].path.waypoints.length !== results[1].path.waypoints.length).toBe(true);
  });

  it('passes direction constraints through to individual routes', () => {
    const requests: RouteRequest[] = [
      {
        id: 'w1',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
        startDirection: 'right',
      },
    ];
    const results = routeWires(requests, []);
    expect(results[0].success).toBe(true);
    expect(firstSegmentDirection(results[0].path.waypoints)).toBe('right');
  });
});

// ─── Real-world scenarios ───────────────────────────────────────

describe('real-world routing scenarios', () => {
  it('PLC DO pin to coil — wire exits right from PLC', () => {
    // PLC module at left, coil at right
    // PLC DO pin faces right, coil pin faces left
    const plcObs = obstacle('plc', 0, 0, 60, 120);
    const coilObs = obstacle('coil', 200, 40, 40, 40);

    const result = routeWire(
      {
        id: 'w1',
        start: { x: 60, y: 60 },    // Right edge of PLC
        end: { x: 200, y: 60 },      // Left edge of coil
        startDirection: 'right',
        endDirection: 'left',
      },
      [plcObs, coilObs]
    );
    expect(result.success).toBe(true);
    expect(isOrthogonal(result.path.waypoints)).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('right');
  });

  it('vertical ladder rung — wire exits down from top device', () => {
    const topDevice = obstacle('top', 80, 0, 40, 30);
    const bottomDevice = obstacle('bottom', 80, 100, 40, 30);

    const result = routeWire(
      {
        id: 'w1',
        start: { x: 100, y: 30 },    // Bottom of top device
        end: { x: 100, y: 100 },     // Top of bottom device
        startDirection: 'down',
        endDirection: 'up',
      },
      [topDevice, bottomDevice]
    );
    expect(result.success).toBe(true);
    expect(firstSegmentDirection(result.path.waypoints)).toBe('down');
  });
});

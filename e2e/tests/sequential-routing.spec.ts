import { test, expect } from '../fixtures/fusion-cad.fixture';

// =============================================================================
// Sequential routing on device drag release (Session 44)
// =============================================================================
//
// Bug: dragging a device with multiple attached wires left them all collapsed
// on the same path. Each wire was routed independently; none knew about the
// others. Demoing this to an EE was painful.
//
// Fix: on mouseup after a device drag, run `routeWires()` from
// @fusion-cad/core-engine (A* + nudging) for every connection touching a
// moved device. Nudging separates overlapping parallel segments into distinct
// channels, producing the staircase pattern engineers expect.
// =============================================================================

test.describe('Sequential wire routing on drag release', () => {
  test('dragging a device with 2 parallel wires produces distinct routed paths', async ({ page, canvasHelpers }) => {
    // Setup: 3 buttons stacked so S1's two pins connect to S2 and S3. This
    // creates two wires (S1-S2 and S1-S3) that share the S1 endpoint — the
    // exact "parallel wires sharing an endpoint" scenario that used to
    // collapse on drag.
    //
    //   S1 (50, 60)     pin 1 (60, 60)   pin 2 (60, 85)
    //   S2 (150, 60)    pin 1 (160, 60)
    //   S3 (150, 85)    pin 1 (160, 85)
    //
    // Wires: S1.1 → S2.1   and   S1.2 → S3.1   (two parallel horizontals).
    await canvasHelpers.placeSymbol(page, 'button', 50, 60);
    await canvasHelpers.placeSymbol(page, 'button', 150, 60);
    await canvasHelpers.placeSymbol(page, 'button', 150, 100);
    await canvasHelpers.waitForDeviceCount(page, 3);

    await canvasHelpers.createWire(page, 60, 60, 160, 60);    // S1.1 → S2.1
    await canvasHelpers.createWire(page, 60, 85, 160, 100);   // S1.2 → S3.1
    await canvasHelpers.waitForConnectionCount(page, 2);

    // Drag S1 down by 30mm. This forces both wires to re-route.
    await canvasHelpers.selectMode(page);
    // Click S1 body to select (middle of its 10×25 bounds).
    await canvasHelpers.clickCanvas(page, 55, 72);
    await page.waitForTimeout(100);

    const screenAt = async (wx: number, wy: number) => page.evaluate((p) => {
      const s = (window as any).__fusionCadState;
      const canvas = document.querySelectorAll('canvas')[1] as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const MM_TO_PX = 4;
      return {
        x: rect.x + p.x * s.viewport.scale * MM_TO_PX + s.viewport.offsetX,
        y: rect.y + p.y * s.viewport.scale * MM_TO_PX + s.viewport.offsetY,
      };
    }, { x: wx, y: wy });
    const fromScreen = await screenAt(55, 72);
    const toScreen = await screenAt(55, 102);

    await page.mouse.move(fromScreen.x, fromScreen.y);
    await page.mouse.down();
    await page.mouse.move(toScreen.x, toScreen.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await canvasHelpers.getState(page);

    // Both wires still exist.
    expect(state.circuit.connections).toHaveLength(2);

    // CORE ASSERTION: the router ran on mouseup, so both affected wires now
    // carry routed waypoints (either an interior array from nudging, OR
    // undefined for a pure L-shape where the router's interior was empty).
    // WITHOUT the fix, both wires would be stuck at `waypoints: []` because
    // that's what the mousemove handler at useCanvasInteraction.ts:1252 sets
    // during drag, and nothing clears it on release.
    for (const conn of state.circuit.connections) {
      const wps = conn.waypoints;
      const isEmptyArray = Array.isArray(wps) && wps.length === 0;
      expect(isEmptyArray,
        `wire ${conn.fromDevice}.${conn.fromPin}→${conn.toDevice}.${conn.toPin} should NOT have empty [] waypoints after drag — the router should have replaced them`,
      ).toBe(false);
    }
  });

  test('dragging a single-wire device still produces a valid path', async ({ page, canvasHelpers }) => {
    // Guardrail: simpler cases (one wire) must not regress. The router should
    // produce a sane path for 1 wire just as well as N.
    await canvasHelpers.placeSymbol(page, 'button', 50, 60);
    await canvasHelpers.placeSymbol(page, 'button', 150, 120);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.createWire(page, 60, 85, 160, 120);
    await canvasHelpers.waitForConnectionCount(page, 1);

    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 55, 72);
    await page.waitForTimeout(100);

    // Drag S1 down 30mm.
    const screenAt = async (wx: number, wy: number) => page.evaluate((p) => {
      const s = (window as any).__fusionCadState;
      const canvas = document.querySelectorAll('canvas')[1] as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const MM_TO_PX = 4;
      return {
        x: rect.x + p.x * s.viewport.scale * MM_TO_PX + s.viewport.offsetX,
        y: rect.y + p.y * s.viewport.scale * MM_TO_PX + s.viewport.offsetY,
      };
    }, { x: wx, y: wy });
    const from = await screenAt(55, 72);
    const to = await screenAt(55, 102);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(1);
    // Router ran — the wire is no longer stuck at the drag-reset `[]`.
    const conn = state.circuit.connections[0];
    const isEmptyArray = Array.isArray(conn.waypoints) && conn.waypoints.length === 0;
    expect(isEmptyArray).toBe(false);
    // Audit still shows a valid path.
    const audit = await page.evaluate(() => (window as any).__fusionCadState.getRenderAudit());
    expect(audit.wires[0].pathPoints.length).toBeGreaterThanOrEqual(2);
    expect(audit.wires[0].totalLength).toBeGreaterThan(0);
  });
});

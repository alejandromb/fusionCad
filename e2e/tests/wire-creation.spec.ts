import { test, expect } from '../fixtures/fusion-cad.fixture';

// Manual Switch (iec-manual-switch) geometry in mm (Session 30 mm migration):
//   width=10, height=25
//   pin "1" at (10, 0)   — top
//   pin "2" at (10, 25)  — bottom
//
// World coordinates in these tests are MILLIMETERS. The worldToScreen helper
// multiplies by MM_TO_PX (=4) internally.

test.describe('Wire creation', () => {
  test('wire two button pins together', async ({ page, canvasHelpers }) => {
    // Place S1 at (100, 60) → pins at (110, 60) and (110, 85)
    // Place S2 at (100, 110) → pins at (110, 110) and (110, 135)
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 100, 110);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin "2" (110, 85) to S2 pin "1" (110, 110)
    await canvasHelpers.createWire(page, 110, 85, 110, 110);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(1);

    const conn = state.circuit.connections[0];
    expect(conn.fromDevice).toBe('S1');
    expect(conn.fromPin).toBe('2');
    expect(conn.toDevice).toBe('S2');
    expect(conn.toPin).toBe('1');
  });

  test('wire creates a new net', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 100, 110);
    await canvasHelpers.waitForDeviceCount(page, 2);

    const stateBefore = await canvasHelpers.getState(page);
    const netsBefore = stateBefore.circuit.nets.length;

    await canvasHelpers.createWire(page, 110, 85, 110, 110);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const stateAfter = await canvasHelpers.getState(page);
    expect(stateAfter.circuit.nets.length).toBe(netsBefore + 1);
  });

  test('Escape cancels wire start', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Enter wire mode and click S1 pin "1" at (110, 60)
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 110, 60);
    await page.waitForTimeout(100);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(0);
  });

  test('REGRESSION: waypoints placed during draw persist on completion (Session 42 Problem 5)', async ({ page, canvasHelpers }) => {
    // Bug: keydown/mousedown handlers in useCanvasInteraction captured a stale
    // `wireWaypoints` closure (initial []), so user-placed bends were discarded
    // when the wire was completed. Fix: add wireWaypoints to the useEffect
    // dependency list so handlers re-bind whenever waypoints change.
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.placeSymbol(page, 'button', 150, 110);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Enter wire mode, click S1 pin "2" (110, 85), add two waypoints,
    // then click S2 pin "1" (160, 110).
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 110, 85);
    await page.waitForTimeout(80);
    await canvasHelpers.clickCanvas(page, 130, 85);   // waypoint 1 (empty space)
    await page.waitForTimeout(80);
    await canvasHelpers.clickCanvas(page, 130, 110);  // waypoint 2 (empty space)
    await page.waitForTimeout(80);
    await canvasHelpers.clickCanvas(page, 160, 110);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const state = await canvasHelpers.getState(page);
    const conn = state.circuit.connections[0];
    expect(conn.waypoints, 'waypoints should be stored on the connection').toBeDefined();
    expect(conn.waypoints.length, 'both user-placed waypoints should persist').toBe(2);
    // Waypoints should be snapped to the 5mm grid.
    expect(conn.waypoints[0]).toEqual({ x: 130, y: 85 });
    expect(conn.waypoints[1]).toEqual({ x: 130, y: 110 });
  });

  test('REGRESSION: no console errors during wire flow (Session 42 fix)', async ({ page, canvasHelpers }) => {
    // Session 38-40 extracted applyPinTransform into utils/pin-math.ts using
    // `export { X } from './path'` which doesn't create a local binding —
    // getPinAtPoint threw ReferenceError at runtime, silently breaking every
    // wire click. This test catches that class of regression by watching for
    // page errors while performing a basic wire flow.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.placeSymbol(page, 'button', 100, 110);
    await canvasHelpers.waitForDeviceCount(page, 2);

    await canvasHelpers.createWire(page, 110, 85, 110, 110);
    await canvasHelpers.waitForConnectionCount(page, 1);

    expect(errors, `Unexpected page errors during wire flow:\n${errors.join('\n')}`).toHaveLength(0);
  });
});

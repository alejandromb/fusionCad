import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Wire creation', () => {
  test('wire two button pins together', async ({ page, canvasHelpers }) => {
    // Place two Manual Switch symbols (mapped from 'button'):
    // Manual Switch geometry is 40x60, pins at x=20,y=0 (top) and x=20,y=60 (bottom)
    // Switch at (200, 200): pin 1 at (220, 200), pin 2 at (220, 260)
    // Switch at (200, 400): pin 1 at (220, 400), pin 2 at (220, 460)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 (220, 260) to S2 pin 1 (220, 400)
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
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
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    const stateBefore = await canvasHelpers.getState(page);
    const netsBefore = stateBefore.circuit.nets.length;

    // Wire S1 pin 2 to S2 pin 1
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const stateAfter = await canvasHelpers.getState(page);
    expect(stateAfter.circuit.nets.length).toBe(netsBefore + 1);
  });

  test('Escape cancels wire start', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Enter wire mode and click first pin (pin 1 at x=20, y=0 relative to symbol)
    // Symbol at (200, 200), pin 1 at (220, 200)
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 220, 200);
    await page.waitForTimeout(100);

    // Press Escape to cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Should still be in wire mode but with no active start
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(0);
  });
});

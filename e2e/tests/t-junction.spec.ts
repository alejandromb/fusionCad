import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('T-Junction wire connections', () => {
  /**
   * Setup helper: place two switches and wire them vertically.
   * S1 at (200, 200): pin 1 (220, 200), pin 2 (220, 260)
   * S2 at (200, 400): pin 1 (220, 400), pin 2 (220, 460)
   * Wire from S1 pin 2 (220, 260) → S2 pin 1 (220, 400) = vertical wire at x=220
   */
  async function setupBaseWire(page: any, canvasHelpers: any) {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);
  }

  test('create T-junction: junction device, branch wire, original wire intact', async ({ page, canvasHelpers }) => {
    await setupBaseWire(page, canvasHelpers);

    // Place S3 to the right
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Get the netId of the original wire
    const stateBefore = await canvasHelpers.getState(page);
    const originalNetId = stateBefore.circuit.connections[0].netId;

    // Enter wire mode, click S3 pin 1 (420, 300), then click on the vertical wire (220, 340)
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 420, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 220, 340);
    await page.waitForTimeout(300);

    // Should now have 4 devices (S1, S2, S3, J1) and 2 connections:
    // - Original wire S1→S2 (intact, with waypoint at junction position)
    // - Branch wire S3→J1
    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 2);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(4);
    expect(state.circuit.connections).toHaveLength(2);

    // Verify junction device exists
    const junctionDevice = state.circuit.devices.find((d: any) => d.tag.startsWith('J'));
    expect(junctionDevice).toBeTruthy();
    expect(junctionDevice.tag).toBe('J1');

    // Both connections share the same netId
    for (const conn of state.circuit.connections) {
      expect(conn.netId).toBe(originalNetId);
    }

    // Original wire still connects S1→S2 and now has a waypoint at junction position
    const originalWire = state.circuit.connections.find(
      (c: any) => c.fromDevice === 'S1' && c.toDevice === 'S2'
    );
    expect(originalWire).toBeTruthy();
    expect(originalWire.waypoints).toBeTruthy();
    expect(originalWire.waypoints.length).toBeGreaterThanOrEqual(1);

    // Branch wire connects S3 to junction
    const branchWire = state.circuit.connections.find(
      (c: any) => c.toDevice === 'J1' || c.fromDevice === 'J1'
    );
    expect(branchWire).toBeTruthy();
  });

  test('delete junction removes branch wire, keeps original wire', async ({ page, canvasHelpers }) => {
    await setupBaseWire(page, canvasHelpers);

    // Place S3 and create T-junction
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 420, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 220, 340);
    await page.waitForTimeout(300);

    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 2);

    // Switch to select mode and click on junction to select it
    // Junction projected onto vertical wire at x=220, y=340
    // Junction symbol is 12x12, center at (226, 346)
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 226, 346);
    await page.waitForTimeout(200);

    // Verify junction is selected
    const stateSelected = await canvasHelpers.getState(page);
    expect(canvasHelpers.isSelectedByTag(stateSelected, 'J1')).toBe(true);

    // Delete the junction
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Junction device gone, branch wire gone, original S1→S2 wire remains
    const state = await canvasHelpers.getState(page);
    const junctionDevice = state.circuit.devices.find((d: any) => d.tag === 'J1');
    expect(junctionDevice).toBeUndefined();

    // Original wire remains (S1→S2)
    expect(state.circuit.connections).toHaveLength(1);
    expect(state.circuit.connections[0].fromDevice).toBe('S1');
    expect(state.circuit.connections[0].toDevice).toBe('S2');

    // 3 regular devices remain (S1, S2, S3)
    expect(state.circuit.devices).toHaveLength(3);
  });

  test('undo T-junction restores original wire', async ({ page, canvasHelpers }) => {
    await setupBaseWire(page, canvasHelpers);

    // Place S3 and create T-junction
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    const stateBefore = await canvasHelpers.getState(page);
    const originalConn = stateBefore.circuit.connections[0];

    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 420, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 220, 340);
    await page.waitForTimeout(300);

    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 2);

    // Undo the T-junction (Cmd+Z on Mac, Ctrl+Z on others)
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);

    // Should restore: 3 devices (no junction), 1 connection (original wire)
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(3);
    expect(state.circuit.connections).toHaveLength(1);

    // Original connection restored (no waypoints)
    const conn = state.circuit.connections[0];
    expect(conn.fromDevice).toBe(originalConn.fromDevice);
    expect(conn.fromPin).toBe(originalConn.fromPin);
    expect(conn.toDevice).toBe(originalConn.toDevice);
    expect(conn.toPin).toBe(originalConn.toPin);
  });
});

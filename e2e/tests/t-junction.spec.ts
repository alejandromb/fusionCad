import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('T-Junction wire connections', () => {
  /**
   * Setup helper: place two switches and wire them vertically.
   * S1 at (200, 200): pin 1 (230, 200), pin 2 (230, 271)
   * S2 at (200, 400): pin 1 (230, 400), pin 2 (230, 471)
   * Wire from S1 pin 2 (230, 271) → S2 pin 1 (230, 400) = vertical wire at x=230
   */
  async function setupBaseWire(page: any, canvasHelpers: any) {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.createWire(page, 230, 271, 230, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);
  }

  test('create T-junction: 3 connections, junction device, same netId', async ({ page, canvasHelpers }) => {
    await setupBaseWire(page, canvasHelpers);

    // Place S3 to the right
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Get the netId of the original wire
    const stateBefore = await canvasHelpers.getState(page);
    const originalNetId = stateBefore.circuit.connections[0].netId;

    // Enter wire mode, click S3 pin 1 (430, 300), then click on the vertical wire (230, 340)
    await page.locator('.toolbar .tool-btn').filter({ hasText: 'Wire' }).click();
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 430, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 230, 340);
    await page.waitForTimeout(300);

    // Should now have 4 devices (S1, S2, S3, J1) and 3 connections
    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 3);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(4);
    expect(state.circuit.connections).toHaveLength(3);

    // Verify junction device exists
    const junctionDevice = state.circuit.devices.find((d: any) => d.tag.startsWith('J'));
    expect(junctionDevice).toBeTruthy();
    expect(junctionDevice.tag).toBe('J1');

    // Verify all 3 connections share the same netId
    for (const conn of state.circuit.connections) {
      expect(conn.netId).toBe(originalNetId);
    }

    // Verify connection structure:
    // conn1: S1:2 → J1:J (first half of split)
    // conn2: J1:J → S2:1 (second half of split)
    // conn3: S3:1 → J1:J (new wire from S3)
    const connToJ = state.circuit.connections.filter(
      (c: any) => c.toDevice === 'J1' || c.fromDevice === 'J1'
    );
    expect(connToJ).toHaveLength(3);
  });

  test('delete junction removes connections through it', async ({ page, canvasHelpers }) => {
    await setupBaseWire(page, canvasHelpers);

    // Place S3 and create T-junction
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    await page.locator('.toolbar .tool-btn').filter({ hasText: 'Wire' }).click();
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 430, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 230, 340);
    await page.waitForTimeout(300);

    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 3);

    // Switch to select mode and click on junction to select it
    // Junction position: snapToGrid(230-6)=220, snapToGrid(340-6)=340
    // Junction symbol is 12x12 at (220, 340), center at (226, 346)
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 226, 346);
    await page.waitForTimeout(200);

    // Verify junction is selected
    const stateSelected = await canvasHelpers.getState(page);
    expect(stateSelected.selectedDevices).toContain('J1');

    // Delete the junction
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Junction device should be gone, and all connections through it removed
    const state = await canvasHelpers.getState(page);
    const junctionDevice = state.circuit.devices.find((d: any) => d.tag === 'J1');
    expect(junctionDevice).toBeUndefined();

    // All 3 connections involved the junction, so 0 connections remain
    expect(state.circuit.connections).toHaveLength(0);

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

    await page.locator('.toolbar .tool-btn').filter({ hasText: 'Wire' }).click();
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 430, 300);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 230, 340);
    await page.waitForTimeout(300);

    await canvasHelpers.waitForDeviceCount(page, 4);
    await canvasHelpers.waitForConnectionCount(page, 3);

    // Undo the T-junction (Cmd+Z on Mac, Ctrl+Z on others)
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(300);

    // Should restore: 3 devices (no junction), 1 connection (original wire)
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(3);
    expect(state.circuit.connections).toHaveLength(1);

    // Original connection restored
    const conn = state.circuit.connections[0];
    expect(conn.fromDevice).toBe(originalConn.fromDevice);
    expect(conn.fromPin).toBe(originalConn.fromPin);
    expect(conn.toDevice).toBe(originalConn.toDevice);
    expect(conn.toPin).toBe(originalConn.toPin);
  });
});

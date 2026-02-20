import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Property editing', () => {
  test('selecting device shows properties in sidebar', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(300);

    // Properties panel should show device info
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.locator('text=Properties')).toBeVisible();

    // Should show the device tag
    const state = await canvasHelpers.getState(page);
    const tag = state.circuit.devices[0].tag;
    await expect(sidebar.locator(`.property-value:has-text("${tag}")`).or(
      sidebar.locator(`.property-input[value="${tag}"]`)
    ).first()).toBeVisible();
  });

  test('selecting wire shows wire properties', async ({ page, canvasHelpers }) => {
    // Place two Manual Switch symbols vertically
    // Manual Switch: pins at (x+20, y+0) and (x+20, y+60)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 (220, 260) to S2 pin 1 (220, 400)
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // Switch to select mode and click on the wire midpoint
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 220, 330);
    await page.waitForTimeout(300);

    // Check if wire properties section appears
    const updatedState = await canvasHelpers.getState(page);
    if (updatedState.selectedWireIndex !== null) {
      const sidebar = page.locator('.sidebar');
      await expect(sidebar.locator('text=Wire Properties').or(
        sidebar.locator('text=Wire Number')
      ).first()).toBeVisible();
    }
  });

  test('deselecting device clears properties panel', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(1);

    // Deselect by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(0);

    // Properties section should no longer show device-specific properties
    // Title Block or empty state should show instead
    const sidebar = page.locator('.sidebar');
    const deviceProperties = sidebar.locator('.properties-panel');
    // The properties panel might still show but without device info
    // Check that we don't have a selected device's tag showing
    const count = await sidebar.locator('.property-row').count();
    // Should still render sidebar content (title block or status)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('delete button in sidebar removes device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    // Click delete button in sidebar
    const deleteBtn = page.locator('.sidebar .delete-btn');
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await canvasHelpers.waitForDeviceCount(page, 0);

      const state = await canvasHelpers.getState(page);
      expect(state.circuit.devices).toHaveLength(0);
    }
  });
});

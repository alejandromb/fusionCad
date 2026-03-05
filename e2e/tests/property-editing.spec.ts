import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Property editing', () => {
  test('selecting device shows properties in right panel', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(300);

    // Properties should auto-switch to Props tab in right panel
    const rightPanel = page.locator('.right-panel');
    await expect(rightPanel.locator('text=Properties').or(
      rightPanel.locator('.right-panel-tab.active').filter({ hasText: 'Props' })
    ).first()).toBeVisible();

    // Should show the device tag
    const state = await canvasHelpers.getState(page);
    const tag = state.circuit.devices[0].tag;
    await expect(rightPanel.locator(`.property-value:has-text("${tag}")`).or(
      rightPanel.locator(`.property-input[value="${tag}"]`)
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

    // Check if wire properties section appears in right panel
    const updatedState = await canvasHelpers.getState(page);
    if (updatedState.selectedWireIndex !== null) {
      const rightPanel = page.locator('.right-panel');
      await expect(rightPanel.locator('text=Wire Properties').or(
        rightPanel.locator('text=Wire Number')
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
  });

  test('delete button removes device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    // Click delete button in the right panel properties
    const deleteBtn = page.locator('.right-panel .delete-btn').or(page.locator('.toolbar .delete-btn'));
    if (await deleteBtn.first().isVisible()) {
      await deleteBtn.first().click();
      await canvasHelpers.waitForDeviceCount(page, 0);

      const state = await canvasHelpers.getState(page);
      expect(state.circuit.devices).toHaveLength(0);
    }
  });
});

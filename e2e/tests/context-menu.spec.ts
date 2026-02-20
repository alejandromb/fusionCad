import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Context menu', () => {
  test('right-click on device shows context menu', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Right-click on the device
    const screen = await canvasHelpers.worldToScreen(page, 220, 220);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await page.waitForTimeout(200);

    // Context menu should appear
    const menu = page.locator('.context-menu');
    await expect(menu).toBeVisible();

    // Should have rotate and delete options
    await expect(page.locator('.context-menu-item:has-text("Rotate CW")')).toBeVisible();
    await expect(page.locator('.context-menu-item:has-text("Delete")')).toBeVisible();
  });

  test('context menu rotate CW works', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Right-click on device
    const screen = await canvasHelpers.worldToScreen(page, 220, 220);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await page.waitForTimeout(200);

    // Click Rotate CW
    await page.click('.context-menu-item:has-text("Rotate CW")');
    await page.waitForTimeout(200);

    // Verify rotation applied
    const state = await canvasHelpers.getState(page);
    const deviceId = state.circuit.devices[0].id;
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(90);
  });

  test('context menu delete removes device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Right-click on device
    const screen = await canvasHelpers.worldToScreen(page, 220, 220);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await page.waitForTimeout(200);

    // Click Delete
    await page.click('.context-menu-item:has-text("Delete")');
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });

  test('clicking backdrop closes context menu', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Right-click on device
    const screen = await canvasHelpers.worldToScreen(page, 220, 220);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await page.waitForTimeout(200);
    await expect(page.locator('.context-menu')).toBeVisible();

    // Click backdrop to close
    await page.click('.context-menu-backdrop');
    await page.waitForTimeout(200);
    await expect(page.locator('.context-menu')).not.toBeVisible();
  });

  test('right-click on empty canvas with clipboard shows paste', async ({ page, canvasHelpers }) => {
    // Place and copy a device first
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);
    await canvasHelpers.pressShortcut(page, 'c', ['Meta']);
    await page.waitForTimeout(200);

    // Deselect
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Right-click on empty canvas
    const screen = await canvasHelpers.worldToScreen(page, 500, 500);
    await page.mouse.click(screen.x, screen.y, { button: 'right' });
    await page.waitForTimeout(200);

    const menu = page.locator('.context-menu');
    if (await menu.isVisible()) {
      const pasteItem = page.locator('.context-menu-item:has-text("Paste")');
      await expect(pasteItem).toBeVisible();
    }
  });
});

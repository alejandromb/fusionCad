import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Zoom and pan', () => {
  test('mouse wheel zoom changes viewport scale', async ({ page, canvasHelpers }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Get initial viewport
    const before = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(before.scale).toBe(1);

    // Move mouse over the canvas first (wheel events go to element under cursor)
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Zoom in with mouse wheel (negative deltaY = zoom in)
    await page.mouse.wheel(0, -300);

    // Wait for debounced viewport update
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(after.scale).toBeGreaterThan(before.scale);
  });

  test('zoom out decreases viewport scale', async ({ page, canvasHelpers }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    const before = await page.evaluate(() => (window as any).__fusionCadState?.viewport);

    // Move mouse over canvas
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Zoom out (positive deltaY = zoom out)
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(after.scale).toBeLessThan(before.scale);
  });

  test('devices remain visible after zoom', async ({ page, canvasHelpers }) => {
    // Place a device
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Zoom in
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(400);

    // Device should still exist in state
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1);

    // Canvas should have non-blank content (symbol is rendered)
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonBgPixels = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2], a = imageData.data[i + 3];
        if (a > 0 && !(r === 30 && g === 30 && b === 46)) nonBgPixels++;
      }
      return nonBgPixels > 50;
    });
    expect(hasContent).toBe(true);
  });

  test('zoom respects min/max bounds', async ({ page }) => {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Zoom out a lot — should not go below 0.1
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 500);
    }
    await page.waitForTimeout(400);
    const zoomedOut = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(zoomedOut.scale).toBeGreaterThanOrEqual(0.1);

    // Zoom in a lot — should not go above 5
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, -500);
    }
    await page.waitForTimeout(400);
    const zoomedIn = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(zoomedIn.scale).toBeLessThanOrEqual(5);
  });

  test('+ key zooms in', async ({ page }) => {
    const before = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    await page.keyboard.press('=');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(after.scale).toBeGreaterThan(before.scale);
  });

  test('- key zooms out', async ({ page }) => {
    const before = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    await page.keyboard.press('-');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => (window as any).__fusionCadState?.viewport);
    expect(after.scale).toBeLessThan(before.scale);
  });
});

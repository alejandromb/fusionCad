import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Canvas navigation', () => {
  test('mouse wheel zooms in and out', async ({ page, canvasHelpers }) => {
    const state = await canvasHelpers.getState(page);
    const initialScale = state.viewport.scale;

    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas).not.toBeNull();

    // Zoom in with scroll up
    await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);

    let updatedState = await canvasHelpers.getState(page);
    expect(updatedState.viewport.scale).toBeGreaterThan(initialScale);

    // Zoom out with scroll down
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(200);

    updatedState = await canvasHelpers.getState(page);
    expect(updatedState.viewport.scale).toBeLessThan(initialScale);
  });

  test('H key activates hand/pan mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('pan');
  });

  test('pan mode allows click-drag to pan canvas', async ({ page, canvasHelpers }) => {
    // Switch to pan mode
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    const initialOffsetX = state.viewport.offsetX;
    const initialOffsetY = state.viewport.offsetY;

    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas).not.toBeNull();

    // Drag to pan
    const startX = canvas!.x + canvas!.width / 2;
    const startY = canvas!.y + canvas!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 50, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const updatedState = await canvasHelpers.getState(page);
    expect(updatedState.viewport.offsetX).not.toBe(initialOffsetX);
    expect(updatedState.viewport.offsetY).not.toBe(initialOffsetY);
  });

  test('space+drag pans canvas in any mode', async ({ page, canvasHelpers }) => {
    // Stay in select mode (default)
    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('select');

    const initialOffsetX = state.viewport.offsetX;

    const canvas = await page.locator('canvas').boundingBox();
    expect(canvas).not.toBeNull();

    const startX = canvas!.x + canvas!.width / 2;
    const startY = canvas!.y + canvas!.height / 2;

    // Hold space and drag
    await page.keyboard.down(' ');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    await page.waitForTimeout(200);

    const updatedState = await canvasHelpers.getState(page);
    expect(updatedState.viewport.offsetX).not.toBe(initialOffsetX);
  });

  test('Escape returns from pan mode to select', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    let state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('pan');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('select');
  });

  test('zoom-to-fit button centers content', async ({ page, canvasHelpers }) => {
    // Place a device
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Zoom way out first
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(200);

    const beforeState = await canvasHelpers.getState(page);
    const beforeScale = beforeState.viewport.scale;

    // Click zoom-to-fit button
    await page.click('.zoom-fit-btn');
    await page.waitForTimeout(300);

    const afterState = await canvasHelpers.getState(page);
    // Scale should change after zoom-to-fit
    expect(afterState.viewport.scale).not.toBe(beforeScale);
  });

  test('zoom controls + and - buttons work', async ({ page, canvasHelpers }) => {
    const state = await canvasHelpers.getState(page);
    const initialScale = state.viewport.scale;

    // Click zoom in button (title-based selector for reliability)
    await page.click('button[title="Zoom In (+)"]');
    await page.waitForTimeout(200);

    let updated = await canvasHelpers.getState(page);
    expect(updated.viewport.scale).toBeGreaterThan(initialScale);

    // Click zoom out button twice to go below initial
    await page.click('button[title="Zoom Out (-)"]');
    await page.waitForTimeout(100);
    await page.click('button[title="Zoom Out (-)"]');
    await page.waitForTimeout(200);

    updated = await canvasHelpers.getState(page);
    expect(updated.viewport.scale).toBeLessThan(initialScale);
  });
});

import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Keyboard shortcuts', () => {
  test('V key switches to select mode', async ({ page, canvasHelpers }) => {
    // Start in a different mode
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    let state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('wire');

    // Press V
    await page.keyboard.press('v');
    await page.waitForTimeout(100);

    state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('select');
  });

  test('W key switches to wire mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('wire');
  });

  test('H key switches to pan mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('pan');
  });

  test('T key switches to text mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('text');
  });

  test('V key returns to select from wire mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('wire');

    // Wire mode: Escape only cancels wire start, doesn't change mode
    // Use V to explicitly switch back to select
    await page.keyboard.press('v');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('select');
  });

  test('Escape returns to select from text mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('text');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('select');
  });

  test('Escape returns to select from pan mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('pan');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect((await canvasHelpers.getState(page)).interactionMode).toBe('select');
  });

  test('? key toggles shortcuts help dialog', async ({ page }) => {
    await page.keyboard.press('?');
    await page.waitForTimeout(200);

    await expect(page.locator('.shortcuts-dialog')).toBeVisible();

    // Press ? again or close
    await page.keyboard.press('?');
    await page.waitForTimeout(200);

    await expect(page.locator('.shortcuts-dialog')).not.toBeVisible();
  });

  test('Delete key only works with selection', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Press Delete without selection — should not crash
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1); // Still there
  });

  test('Cmd+A selects all, Escape deselects all', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Select all
    await canvasHelpers.pressShortcut(page, 'a', ['Meta']);
    await page.waitForTimeout(200);
    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);

    // Escape deselects
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(0);
  });
});

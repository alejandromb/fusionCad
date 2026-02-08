import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Multi-select', () => {
  test('Shift+click adds to selection', async ({ page, canvasHelpers }) => {
    // Place two buttons
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Select first device
    await canvasHelpers.clickCanvas(page, 120, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(1);

    // Shift+click second device
    await canvasHelpers.clickCanvas(page, 320, 220, { modifiers: ['Shift'] });
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);
  });

  test('Cmd+A selects all devices', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 100);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'contactor', 300, 100);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.placeSymbol(page, 'motor', 500, 100);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Select all
    await canvasHelpers.pressShortcut(page, 'a', ['Meta']);
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(3);
  });

  test('Delete removes all selected devices', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.placeSymbol(page, 'contactor', 500, 200);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Select all
    await canvasHelpers.pressShortcut(page, 'a', ['Meta']);
    await page.waitForTimeout(200);

    // Delete all
    await page.keyboard.press('Delete');
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });
});

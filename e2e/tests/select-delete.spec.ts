import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Select and delete', () => {
  test('click to select a device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Click on the device to select it
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toContain('S1');
  });

  test('Delete key removes selected device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    // Press Delete
    await page.keyboard.press('Delete');
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });

  test('Backspace removes selected device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'contactor', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 230, 240);
    await page.waitForTimeout(200);

    // Press Backspace
    await page.keyboard.press('Backspace');
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });

  test('click empty space deselects', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices.length).toBeGreaterThan(0);

    // Click far away on empty space
    await canvasHelpers.clickCanvas(page, 500, 500);
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(0);
  });

  test('Escape deselects', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(0);
  });
});

import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Device transforms', () => {
  test('R key rotates selected device clockwise', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(1);
    const deviceId = state.selectedDevices[0];

    // Initial rotation should be 0
    const initialRotation = state.circuit.transforms?.[deviceId]?.rotation || 0;

    // Press R to rotate CW
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const newRotation = state.circuit.transforms?.[deviceId]?.rotation || 0;
    expect(newRotation).toBe(initialRotation + 90);
  });

  test('Shift+R rotates selected device counter-clockwise', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    const deviceId = state.selectedDevices[0];

    // Rotate CW first to get to 90
    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    state = await canvasHelpers.getState(page);
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(90);

    // Now rotate CCW (Shift+R)
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(0);
  });

  test('rotation persists in transforms across operations', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select and rotate twice (180 degrees)
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    const deviceId = state.selectedDevices[0];
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(180);

    // Deselect and reselect — rotation should still be there
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(180);
  });

  test('group rotation rotates multiple devices around center', async ({ page, canvasHelpers }) => {
    // Place two devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Select all
    await canvasHelpers.pressShortcut(page, 'a', ['Meta']);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);

    // Get initial positions
    const d0 = state.circuit.devices[0];
    const d1 = state.circuit.devices[1];
    const pos0Before = state.devicePositions[d0.id];
    const pos1Before = state.devicePositions[d1.id];

    // Rotate group
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const pos0After = state.devicePositions[d0.id];
    const pos1After = state.devicePositions[d1.id];

    // Positions should have changed (rotated around centroid)
    expect(pos0After.x !== pos0Before.x || pos0After.y !== pos0Before.y).toBe(true);
    expect(pos1After.x !== pos1Before.x || pos1After.y !== pos1Before.y).toBe(true);

    // Both devices should have rotation=90 in transforms
    expect(state.circuit.transforms?.[d0.id]?.rotation).toBe(90);
    expect(state.circuit.transforms?.[d1.id]?.rotation).toBe(90);
  });

  test('undo reverses rotation', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select and rotate
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    const deviceId = state.selectedDevices[0];
    expect(state.circuit.transforms?.[deviceId]?.rotation).toBe(90);

    // Undo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const rotation = state.circuit.transforms?.[deviceId]?.rotation || 0;
    expect(rotation).toBe(0);
  });
});

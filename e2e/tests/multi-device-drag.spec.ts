import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Multi-device drag', () => {
  test('dragging selected device moves it', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    const deviceId = state.circuit.devices[0].id;
    const posBefore = state.devicePositions[deviceId];

    // Drag from device position to new position
    const from = await canvasHelpers.worldToScreen(page, 220, 220);
    const to = await canvasHelpers.worldToScreen(page, 320, 320);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const posAfter = state.devicePositions[deviceId];

    // Position should have changed
    expect(posAfter.x !== posBefore.x || posAfter.y !== posBefore.y).toBe(true);
  });

  test('dragging with multiple selected moves all together', async ({ page, canvasHelpers }) => {
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

    const d0 = state.circuit.devices[0];
    const d1 = state.circuit.devices[1];
    const pos0Before = state.devicePositions[d0.id];
    const pos1Before = state.devicePositions[d1.id];
    const relativeXBefore = pos1Before.x - pos0Before.x;
    const relativeYBefore = pos1Before.y - pos0Before.y;

    // Drag from first device
    const from = await canvasHelpers.worldToScreen(page, 220, 220);
    const to = await canvasHelpers.worldToScreen(page, 320, 300);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const pos0After = state.devicePositions[d0.id];
    const pos1After = state.devicePositions[d1.id];

    // Both should have moved
    expect(pos0After.x !== pos0Before.x || pos0After.y !== pos0Before.y).toBe(true);
    expect(pos1After.x !== pos1Before.x || pos1After.y !== pos1Before.y).toBe(true);

    // Relative distance should be preserved (snapped to grid)
    const relativeXAfter = pos1After.x - pos0After.x;
    const relativeYAfter = pos1After.y - pos0After.y;
    expect(relativeXAfter).toBe(relativeXBefore);
    expect(relativeYAfter).toBe(relativeYBefore);
  });

  test('dragged device snaps to grid', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    // Drag to non-grid-aligned position
    const from = await canvasHelpers.worldToScreen(page, 220, 220);
    const to = await canvasHelpers.worldToScreen(page, 337, 253);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    const deviceId = state.circuit.devices[0].id;
    const pos = state.devicePositions[deviceId];

    // Position should be grid-aligned (multiples of 20)
    expect(pos.x % 20).toBe(0);
    expect(pos.y % 20).toBe(0);
  });
});

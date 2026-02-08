import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Copy and paste', () => {
  test('Cmd+C then Cmd+V duplicates device', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 220, 220);
    await page.waitForTimeout(200);

    // Copy
    await canvasHelpers.pressShortcut(page, 'c', ['Meta']);
    await page.waitForTimeout(100);

    // Move mouse to a new position then paste
    const screen = await canvasHelpers.worldToScreen(page, 400, 300);
    await page.mouse.move(screen.x, screen.y);
    await canvasHelpers.pressShortcut(page, 'v', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 2);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(2);
    const tags = state.circuit.devices.map((d: any) => d.tag).sort();
    expect(tags).toEqual(['S1', 'S2']);
  });

  test('Cmd+D duplicates in place', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'contactor', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device
    await canvasHelpers.clickCanvas(page, 230, 240);
    await page.waitForTimeout(200);

    // Duplicate
    await canvasHelpers.pressShortcut(page, 'd', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 2);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(2);
    const tags = state.circuit.devices.map((d: any) => d.tag).sort();
    expect(tags).toEqual(['K1', 'K2']);

    // Duplicated device should be at an offset from original
    const pos1 = state.devicePositions['K1'];
    const pos2 = state.devicePositions['K2'];
    expect(pos2.x).toBeGreaterThan(pos1.x);
    expect(pos2.y).toBeGreaterThan(pos1.y);
  });
});

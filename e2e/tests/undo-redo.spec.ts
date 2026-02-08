import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Undo and redo', () => {
  test('Cmd+Z undoes a placement', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Undo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });

  test('Cmd+Shift+Z redoes after undo', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Undo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 0);

    // Redo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta', 'Shift']);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1);
    expect(state.circuit.devices[0].tag).toBe('S1');
  });

  test('Cmd+Z undoes a deletion', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'motor', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select and delete
    await canvasHelpers.clickCanvas(page, 230, 230);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await canvasHelpers.waitForDeviceCount(page, 0);

    // Undo the deletion
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices[0].tag).toBe('M1');
  });
});

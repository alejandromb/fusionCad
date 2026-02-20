import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Undo/redo advanced', () => {
  test('multiple undos in sequence', async ({ page, canvasHelpers }) => {
    // Place 3 devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.placeSymbol(page, 'contactor', 600, 200);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Undo 3 times
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 0);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);
  });

  test('multiple redos in sequence', async ({ page, canvasHelpers }) => {
    // Place 2 devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Undo both
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 0);

    // Redo both
    await canvasHelpers.pressShortcut(page, 'z', ['Meta', 'Shift']);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.pressShortcut(page, 'z', ['Meta', 'Shift']);
    await canvasHelpers.waitForDeviceCount(page, 2);
  });

  test('new action after undo clears redo history', async ({ page, canvasHelpers }) => {
    // Place 2 devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Undo last placement
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Do new action (place contactor instead)
    await canvasHelpers.placeSymbol(page, 'contactor', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Redo should not bring back the old button
    await canvasHelpers.pressShortcut(page, 'z', ['Meta', 'Shift']);
    await page.waitForTimeout(200);

    // Should still have 2 devices (redo history was cleared)
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(2);
  });

  test('undo wire creation removes wire', async ({ page, canvasHelpers }) => {
    // Place two Manual Switch symbols vertically
    // Manual Switch: pins at (x+20, y+0) and (x+20, y+60)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 (220, 260) to S2 pin 1 (220, 400)
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // Undo — wire should be gone
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForConnectionCount(page, 0);

    const updatedState = await canvasHelpers.getState(page);
    expect(updatedState.circuit.connections).toHaveLength(0);
    // Devices should still exist
    expect(updatedState.circuit.devices).toHaveLength(2);
  });

  test('undo multi-delete restores all devices', async ({ page, canvasHelpers }) => {
    // Place 3 devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.placeSymbol(page, 'contactor', 600, 200);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Select all and delete
    await canvasHelpers.pressShortcut(page, 'a', ['Meta']);
    await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await canvasHelpers.waitForDeviceCount(page, 0);

    // Undo should restore all 3
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 3);
  });
});

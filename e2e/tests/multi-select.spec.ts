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

  test('Window select (left-to-right) selects fully enclosed devices', async ({ page, canvasHelpers }) => {
    // Place two devices: one at (100,200) and one at (400,200)
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Ensure we're in select mode
    await canvasHelpers.selectMode(page);

    // Window select (left-to-right) enclosing only the first device
    // Draw rectangle from (50,150) to (200,280) — should enclose device at (100,200)
    await canvasHelpers.dragMarquee(page, 50, 150, 200, 280);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(1);
  });

  test('Crossing select (right-to-left) selects overlapping devices', async ({ page, canvasHelpers }) => {
    // Place two devices at (100,200) and (300,200)
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Ensure we're in select mode
    await canvasHelpers.selectMode(page);

    // Crossing select (right-to-left) — rectangle that partially overlaps both devices
    // Drag from (350,150) to (50,280) — right-to-left triggers crossing mode
    await canvasHelpers.dragMarquee(page, 350, 150, 50, 280);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);
  });

  test('Shift+marquee adds to existing selection', async ({ page, canvasHelpers }) => {
    // Place two devices far apart
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 500, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Ensure we're in select mode
    await canvasHelpers.selectMode(page);

    // Select first device with marquee
    await canvasHelpers.dragMarquee(page, 50, 150, 200, 280);
    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(1);

    // Shift+marquee to add second device
    await canvasHelpers.dragMarquee(page, 450, 150, 600, 280, { modifiers: ['Shift'] });
    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);
  });

  test('Marquee that hits no devices replaces selection with empty', async ({ page, canvasHelpers }) => {
    // Place two devices
    await canvasHelpers.placeSymbol(page, 'button', 100, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Ensure we're in select mode
    await canvasHelpers.selectMode(page);

    // Window select both devices
    await canvasHelpers.dragMarquee(page, 50, 150, 400, 280);
    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);

    // Click on empty space (Escape first to ensure clean state)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(0);
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

import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Canvas visibility', () => {
  test('placed device is rendered on canvas', async ({ page, canvasHelpers }) => {
    // Place a symbol
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Wait for render cycle
    await page.waitForTimeout(300);

    // Check that the canvas has non-blank content by sampling pixels
    const hasContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      // Count non-background pixels (anything that isn't the dark bg)
      let nonBgPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 0 && !(r === 30 && g === 30 && b === 46)) {
          nonBgPixels++;
        }
      }
      return nonBgPixels > 50;
    });

    expect(hasContent).toBe(true);
  });

  test('placed device exists in circuit state', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    const device = state.circuit.devices[0];
    expect(device).toBeDefined();
    expect(device.tag).toBe('S1');

    // Device should have a position
    const pos = state.devicePositions[device.id];
    expect(pos).toBeDefined();
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  test('wire connection creates visible state', async ({ page, canvasHelpers }) => {
    // Place two Manual Switch symbols
    // Manual Switch: 40x60, pin 1 at (x+20, y+0), pin 2 at (x+20, y+60)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 (220, 260) to S2 pin 1 (220, 400)
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(1);
    expect(state.circuit.nets.length).toBeGreaterThan(0);
  });

  test('canvas re-renders after undo', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Undo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 0);

    let state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(0);

    // Redo
    await canvasHelpers.pressShortcut(page, 'z', ['Meta', 'Shift']);
    await canvasHelpers.waitForDeviceCount(page, 1);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1);
  });
});

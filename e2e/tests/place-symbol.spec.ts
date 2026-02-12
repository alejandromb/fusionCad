import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Place symbol', () => {
  test('place a button from the palette', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1);
    expect(state.circuit.devices[0].tag).toBe('S1');
  });

  test('placed symbol snaps to grid', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 213, 197);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    const pos = canvasHelpers.getPositionByTag(state, 'S1');
    expect(pos).toBeTruthy();
    // Grid size is 20, so 213 -> 220, 197 -> 200
    expect(pos!.x % 20).toBe(0);
    expect(pos!.y % 20).toBe(0);
  });

  test('place multiple symbols with auto-incrementing tags', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 100);
    await canvasHelpers.waitForDeviceCount(page, 1);

    await canvasHelpers.placeSymbol(page, 'button', 200, 100);
    await canvasHelpers.waitForDeviceCount(page, 2);

    await canvasHelpers.placeSymbol(page, 'contactor', 300, 100);
    await canvasHelpers.waitForDeviceCount(page, 3);

    const state = await canvasHelpers.getState(page);
    const tags = state.circuit.devices.map((d: any) => d.tag).sort();
    expect(tags).toEqual(['K1', 'S1', 'S2']);
  });

  test('returns to select mode after placing', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'motor', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('select');
  });
});

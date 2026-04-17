import { test, expect, type Page } from '../fixtures/fusion-cad.fixture';

// =============================================================================
// Movable tag labels — Option A (tight bbox + already-selected priority)
// =============================================================================
//
// Gesture model:
//   • Click a device body → selects the device.
//   • Click a tag whose device is ALREADY selected → starts a tag drag.
//   • Click a tag whose device is NOT selected AND the click misses the
//     device's symbol bbox (the tag-above-symbol case for most categories)
//     → starts a tag drag directly.
//   • Click a tag of an unselected terminal (tag INSIDE device body) → selects
//     the device first; a second click-drag then moves the tag.
//
// The fingerprint tests (render-fingerprint.spec.ts) guarantee devices without
// `labelOffsets` render at the original default anchor. These tests cover the
// drag interaction itself.
// =============================================================================

async function getDeviceByTag(page: Page, tag: string) {
  return page.evaluate((t) => {
    const s = (window as any).__fusionCadState;
    const dev = s.circuit.devices.find((d: any) => d.tag === t);
    return dev ? { id: dev.id, labelOffsets: dev.labelOffsets } : null;
  }, tag);
}

async function screenCoordsOf(page: Page, worldX: number, worldY: number): Promise<{ x: number; y: number }> {
  return page.evaluate(({ wx, wy }) => {
    const s = (window as any).__fusionCadState;
    const canvas = document.querySelectorAll('canvas')[1] as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const MM_TO_PX = 4;
    return {
      x: rect.x + wx * s.viewport.scale * MM_TO_PX + s.viewport.offsetX,
      y: rect.y + wy * s.viewport.scale * MM_TO_PX + s.viewport.offsetY,
    };
  }, { wx: worldX, wy: worldY });
}

test.describe('Movable tag labels', () => {
  test('dragging the tag of a selected device updates labelOffsets.tag', async ({ page, canvasHelpers }) => {
    // Place a Manual Switch at (100, 60). Its tag sits at the default anchor
    // (x + width/2, y + 5) = (105, 65) — above the symbol body.
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Verify baseline: no labelOffsets on the fresh device.
    let dev = await getDeviceByTag(page, 'S1');
    expect(dev?.labelOffsets).toBeUndefined();

    // Step 1: click device body to select it (click inside bounds — say (105, 72)).
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 105, 72);
    await page.waitForTimeout(100);
    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toContain(dev!.id);

    // Step 2: drag from the tag's anchor (105, 65) to (105, 55) — move tag up 10mm.
    const tagFrom = await screenCoordsOf(page, 105, 65);
    const tagTo = await screenCoordsOf(page, 105, 55);
    await page.mouse.move(tagFrom.x, tagFrom.y);
    await page.mouse.down();
    await page.mouse.move(tagTo.x, tagTo.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Assertion: labelOffsets.tag should now encode the drag delta (approx 0, -10).
    dev = await getDeviceByTag(page, 'S1');
    expect(dev?.labelOffsets?.tag, 'tag offset should be set after drag').toBeDefined();
    expect(dev!.labelOffsets!.tag!.x).toBeCloseTo(0, 0);
    expect(dev!.labelOffsets!.tag!.y).toBeCloseTo(-10, 0);
  });

  test('dragging a tag does NOT move the device body', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const before = await page.evaluate(() => {
      const s = (window as any).__fusionCadState;
      const dev = s.circuit.devices.find((d: any) => d.tag === 'S1');
      return { pos: s.devicePositions[dev.id], id: dev.id };
    });

    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 105, 72);
    await page.waitForTimeout(100);

    const tagFrom = await screenCoordsOf(page, 105, 65);
    const tagTo = await screenCoordsOf(page, 130, 50);
    await page.mouse.move(tagFrom.x, tagFrom.y);
    await page.mouse.down();
    await page.mouse.move(tagTo.x, tagTo.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await page.evaluate((id) => {
      const s = (window as any).__fusionCadState;
      return s.devicePositions[id];
    }, before.id);

    // Position unchanged — only the label moved.
    expect(after.x).toBe(before.pos.x);
    expect(after.y).toBe(before.pos.y);
  });

  test('Escape during tag drag cancels the drag and restores the previous offset', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 105, 72);
    await page.waitForTimeout(100);

    // Start a tag drag but don't release — press Escape instead.
    const tagFrom = await screenCoordsOf(page, 105, 65);
    const tagMid = await screenCoordsOf(page, 125, 55);
    await page.mouse.move(tagFrom.x, tagFrom.y);
    await page.mouse.down();
    await page.mouse.move(tagMid.x, tagMid.y, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Escape triggers undo() (history was pushed on mousedown), so the tag
    // should be back at the default — labelOffsets undefined or missing tag.
    const dev = await getDeviceByTag(page, 'S1');
    const tag = dev?.labelOffsets?.tag;
    expect(tag === undefined || (Math.abs(tag.x) < 0.01 && Math.abs(tag.y) < 0.01)).toBe(true);
  });
});

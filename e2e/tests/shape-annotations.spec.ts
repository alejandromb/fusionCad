import { test, expect } from '../fixtures/fusion-cad.fixture';

const MM_TO_PX = 4;

/**
 * Convert world mm coordinates to screen pixel coordinates.
 * Unlike the existing worldToScreen helper, this correctly applies MM_TO_PX.
 */
async function worldMmToScreen(page: any, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const state = await page.evaluate(() => (window as any).__fusionCadState);
  const vp = state.viewport;
  const canvas = await page.locator('canvas.canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not found');
  return {
    x: canvas.x + wx * vp.scale * MM_TO_PX + vp.offsetX,
    y: canvas.y + wy * vp.scale * MM_TO_PX + vp.offsetY,
  };
}

test.describe('Shape Annotations', () => {
  test('S key activates shape mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('s');
    await page.waitForTimeout(100);
    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('shape');
  });

  test('Escape exits shape mode back to select', async ({ page }) => {
    await page.keyboard.press('s');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state.interactionMode).toBe('select');
  });

  test('draw circle at correct position via drag', async ({ page }) => {
    // Enter shape mode, select circle tool
    await page.keyboard.press('s'); // shape mode (default: rectangle)
    await page.waitForTimeout(100);
    await page.keyboard.press('s'); // cycle to circle
    await page.waitForTimeout(100);

    // Draw circle: center at (50, 40)mm, drag 15mm to the right for radius
    const center = await worldMmToScreen(page, 50, 40);
    const edge = await worldMmToScreen(page, 65, 40);

    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(edge.x, edge.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Verify annotation was created
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    const annotations = state.circuit.annotations || [];
    const circles = annotations.filter((a: any) => a.annotationType === 'circle');
    expect(circles.length).toBe(1);

    const circle = circles[0];
    // Position should be near (50, 40) — the center where mouseDown happened
    expect(circle.position.x).toBeCloseTo(50, 0);
    expect(circle.position.y).toBeCloseTo(40, 0);
    // Radius should be ~15mm (distance dragged)
    expect(circle.style.radius).toBeCloseTo(15, 0);
  });

  test('draw rectangle at correct position via drag', async ({ page }) => {
    // Enter shape mode (default: rectangle)
    await page.keyboard.press('s');
    await page.waitForTimeout(100);

    // Draw rectangle: top-left (30, 20)mm to bottom-right (60, 50)mm
    const topLeft = await worldMmToScreen(page, 30, 20);
    const bottomRight = await worldMmToScreen(page, 60, 50);

    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(bottomRight.x, bottomRight.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => (window as any).__fusionCadState);
    const annotations = state.circuit.annotations || [];
    const rects = annotations.filter((a: any) => a.annotationType === 'rectangle');
    expect(rects.length).toBe(1);

    const rect = rects[0];
    // Position should be at top-left corner (30, 20)
    expect(rect.position.x).toBeCloseTo(30, 0);
    expect(rect.position.y).toBeCloseTo(20, 0);
    // Size should be 30x30mm
    expect(rect.style.width).toBeCloseTo(30, 0);
    expect(rect.style.height).toBeCloseTo(30, 0);
  });

  test('draw line at correct position via drag', async ({ page }) => {
    // Enter shape mode, cycle to line (rect → circle → line)
    await page.keyboard.press('s');
    await page.waitForTimeout(150);
    await page.keyboard.press('s');
    await page.waitForTimeout(150);
    await page.keyboard.press('s');
    await page.waitForTimeout(150);

    // Draw line: from (20, 30) to (70, 30)
    const start = await worldMmToScreen(page, 20, 30);
    const end = await worldMmToScreen(page, 70, 30);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => (window as any).__fusionCadState);
    const annotations = state.circuit.annotations || [];
    const lines = annotations.filter((a: any) => a.annotationType === 'line');
    expect(lines.length).toBe(1);

    const line = lines[0];
    expect(line.position.x).toBeCloseTo(20, 0);
    expect(line.position.y).toBeCloseTo(30, 0);
    expect(line.style.endX).toBeCloseTo(70, 0);
    expect(line.style.endY).toBeCloseTo(30, 0);
  });

  test('tiny drag (< 1mm) does not create shape', async ({ page }) => {
    await page.keyboard.press('s');
    await page.waitForTimeout(100);

    const start = await worldMmToScreen(page, 50, 50);
    // Drag only 0.5mm
    const end = await worldMmToScreen(page, 50.5, 50);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => (window as any).__fusionCadState);
    const annotations = state.circuit.annotations || [];
    expect(annotations.filter((a: any) => a.annotationType === 'rectangle').length).toBe(0);
  });

  test('select and delete shape', async ({ page }) => {
    // Draw a rectangle
    await page.keyboard.press('s');
    await page.waitForTimeout(100);

    const topLeft = await worldMmToScreen(page, 30, 20);
    const bottomRight = await worldMmToScreen(page, 60, 50);

    await page.mouse.move(topLeft.x, topLeft.y);
    await page.mouse.down();
    await page.mouse.move(bottomRight.x, bottomRight.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Switch to select mode
    await page.keyboard.press('v');
    await page.waitForTimeout(100);

    // Click on the rectangle border to select it (border-only hit testing)
    const center = await worldMmToScreen(page, 30, 35);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);

    let state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state.selectedAnnotationIds?.length).toBeTruthy();

    // Delete it
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    state = await page.evaluate(() => (window as any).__fusionCadState);
    const rects = (state.circuit.annotations || []).filter((a: any) => a.annotationType === 'rectangle');
    expect(rects.length).toBe(0);
  });
});

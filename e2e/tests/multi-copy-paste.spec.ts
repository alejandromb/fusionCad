import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Multi-device copy and paste', () => {
  test('Cmd+C with multiple selected devices copies all of them', async ({ page, canvasHelpers }) => {
    // Place 3 buttons in a row
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Marquee-select all 3 (drag from top-left to bottom-right)
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 180, 460, 320);
    await page.waitForTimeout(200);

    // Verify all 3 selected
    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(3);

    // Copy
    await canvasHelpers.pressShortcut(page, 'c', ['Meta']);
    await page.waitForTimeout(100);

    // Move mouse to new position and paste
    const screen = await canvasHelpers.worldToScreen(page, 200, 400);
    await page.mouse.move(screen.x, screen.y);
    await canvasHelpers.pressShortcut(page, 'v', ['Meta']);
    await page.waitForTimeout(100);
    // Click to commit paste preview
    await canvasHelpers.clickCanvas(page, 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 6);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(6);

    // All 6 should have unique tags: S1-S6
    const tags = state.circuit.devices.map((d: any) => d.tag).sort();
    expect(tags).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);

    // Pasted devices should be selected
    expect(state.selectedDevices).toHaveLength(3);
  });

  test('Cmd+D with multiple selected devices duplicates all of them', async ({ page, canvasHelpers }) => {
    // Place 2 devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.placeSymbol(page, 'contactor', 350, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Marquee-select both
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 180, 450, 320);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);

    // Duplicate
    await canvasHelpers.pressShortcut(page, 'd', ['Meta']);
    await canvasHelpers.waitForDeviceCount(page, 4);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(4);

    const tags = state.circuit.devices.map((d: any) => d.tag).sort();
    expect(tags).toEqual(['K1', 'K2', 'S1', 'S2']);
  });

  test('multi-device copy preserves wires between selected devices', async ({ page, canvasHelpers }) => {
    // Place 2 buttons
    await canvasHelpers.placeSymbol(page, 'button', 200, 100);
    await canvasHelpers.placeSymbol(page, 'button', 200, 250);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Inject a wire between S1 pin 2 and S2 pin 1 via state bridge
    // (avoids fragile pin-click hit detection in E2E)
    await page.evaluate(() => {
      const state = (window as any).__fusionCadState;
      if (!state) return;
      const s1 = state.circuit.devices.find((d: any) => d.tag === 'S1');
      const s2 = state.circuit.devices.find((d: any) => d.tag === 'S2');
      if (!s1 || !s2) return;
      // Use the createWireConnection function exposed on the state bridge
      // or directly mutate circuit
      const conn = {
        fromDevice: 'S1', fromDeviceId: s1.id, fromPin: '2',
        toDevice: 'S2', toDeviceId: s2.id, toPin: '1',
        netId: 'test-net-1',
      };
      state.circuit.connections.push(conn);
    });
    // Trigger a re-render by clicking empty space
    await canvasHelpers.clickCanvas(page, 500, 500);
    await page.waitForTimeout(300);

    let state = await canvasHelpers.getState(page);
    expect(state.circuit.connections).toHaveLength(1);

    // Marquee-select both devices
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 80, 280, 370);
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(2);

    // Copy
    await canvasHelpers.pressShortcut(page, 'c', ['Meta']);
    await page.waitForTimeout(100);

    // Paste at a new position (Cmd+V enters preview, click to commit)
    const screen = await canvasHelpers.worldToScreen(page, 400, 200);
    await page.mouse.move(screen.x, screen.y);
    await canvasHelpers.pressShortcut(page, 'v', ['Meta']);
    await page.waitForTimeout(100);
    await canvasHelpers.clickCanvas(page, 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 4);

    state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(4);
    // Original wire + copied wire = 2
    expect(state.circuit.connections).toHaveLength(2);

    // Verify the copied wire references the new devices (S3, S4), not the originals
    const newConn = state.circuit.connections.find(
      (c: any) => c.fromDevice === 'S3' || c.fromDevice === 'S4' || c.toDevice === 'S3' || c.toDevice === 'S4'
    );
    expect(newConn).toBeTruthy();
    // The wire should connect S3 and S4 (not S1 or S2)
    const connTags = [newConn.fromDevice, newConn.toDevice].sort();
    expect(connTags).toEqual(['S3', 'S4']);
  });
});

test.describe('Alignment tools', () => {
  test('align left aligns devices to leftmost edge', async ({ page, canvasHelpers }) => {
    // Place 3 buttons at different X positions
    await canvasHelpers.placeSymbol(page, 'button', 200, 100);
    await canvasHelpers.placeSymbol(page, 'button', 300, 200);
    await canvasHelpers.placeSymbol(page, 'button', 400, 300);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Marquee-select all
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 80, 460, 420);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(3);

    // Align left via state bridge (call the function directly)
    await page.evaluate(() => {
      (window as any).__fusionCadState?.alignSelectedDevices?.('left');
    });
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const pos1 = canvasHelpers.getPositionByTag(state, 'S1');
    const pos2 = canvasHelpers.getPositionByTag(state, 'S2');
    const pos3 = canvasHelpers.getPositionByTag(state, 'S3');

    // All should have the same X (aligned to the leftmost)
    expect(pos1!.x).toBe(pos2!.x);
    expect(pos2!.x).toBe(pos3!.x);

    // Y positions should be unchanged
    expect(pos1!.y).toBe(100);
    expect(pos2!.y).toBe(200);
    expect(pos3!.y).toBe(300);
  });

  test('align top aligns devices to topmost edge', async ({ page, canvasHelpers }) => {
    // Place 3 buttons at different Y positions
    await canvasHelpers.placeSymbol(page, 'button', 200, 150);
    await canvasHelpers.placeSymbol(page, 'button', 300, 250);
    await canvasHelpers.placeSymbol(page, 'button', 400, 350);
    await canvasHelpers.waitForDeviceCount(page, 3);

    // Marquee-select all
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 130, 460, 470);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedDevices).toHaveLength(3);

    // Align top
    await page.evaluate(() => {
      (window as any).__fusionCadState?.alignSelectedDevices?.('top');
    });
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    const pos1 = canvasHelpers.getPositionByTag(state, 'S1');
    const pos2 = canvasHelpers.getPositionByTag(state, 'S2');
    const pos3 = canvasHelpers.getPositionByTag(state, 'S3');

    // All should have the same Y (aligned to topmost)
    expect(pos1!.y).toBe(pos2!.y);
    expect(pos2!.y).toBe(pos3!.y);

    // X positions should be unchanged
    expect(pos1!.x).toBe(200);
    expect(pos2!.x).toBe(300);
    expect(pos3!.x).toBe(400);
  });

  test('align center-x centers devices horizontally', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 100);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Marquee-select both
    await canvasHelpers.selectMode(page);
    await canvasHelpers.dragMarquee(page, 180, 80, 460, 320);
    await page.waitForTimeout(200);

    // Align center-x
    await page.evaluate(() => {
      (window as any).__fusionCadState?.alignSelectedDevices?.('center-x');
    });
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    const pos1 = canvasHelpers.getPositionByTag(state, 'S1');
    const pos2 = canvasHelpers.getPositionByTag(state, 'S2');

    // Both should have the same X (centered between 200 and 400)
    expect(pos1!.x).toBe(pos2!.x);
  });
});

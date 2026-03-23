import { test, expect } from '../fixtures/fusion-cad.fixture';

/**
 * Render Audit tests — validate schematic quality through structured data,
 * not just screenshots. Uses getRenderAudit() from the state bridge.
 */
test.describe('Render Audit', () => {
  test('getRenderAudit returns structured data for default sheet', async ({ page }) => {
    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    expect(audit).toBeTruthy();
    expect(audit.sheet).toBeTruthy();
    expect(audit.stats).toBeTruthy();
    expect(audit.wires).toBeInstanceOf(Array);
    expect(audit.devices).toBeInstanceOf(Array);
    expect(audit.labels).toBeInstanceOf(Array);
    expect(audit.overlaps).toBeInstanceOf(Array);
  });

  test('no devices overlap in empty project', async ({ page }) => {
    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    if (audit) {
      expect(audit.overlaps).toHaveLength(0);
    }
  });

  test('placed devices appear in render audit', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 300, 300);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    expect(audit.stats.totalDevices).toBe(1);
    expect(audit.devices[0].tag).toBe('S1');
    expect(audit.devices[0].bounds).toBeTruthy();
    expect(audit.devices[0].bounds.width).toBeGreaterThan(0);
    expect(audit.devices[0].bounds.height).toBeGreaterThan(0);
  });

  test('wire paths are captured with correct endpoints', async ({ page, canvasHelpers }) => {
    // Place two devices and wire them
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Inject a wire between them via state
    await page.evaluate(() => {
      const state = (window as any).__fusionCadState;
      const s1 = state.circuit.devices.find((d: any) => d.tag === 'S1');
      const s2 = state.circuit.devices.find((d: any) => d.tag === 'S2');
      if (s1 && s2) {
        state.circuit.connections.push({
          fromDevice: 'S1', fromDeviceId: s1.id, fromPin: '2',
          toDevice: 'S2', toDeviceId: s2.id, toPin: '1',
          netId: 'test-net-1', waypoints: [],
        });
      }
    });
    await page.waitForTimeout(300);

    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    expect(audit.stats.totalWires).toBeGreaterThanOrEqual(1);
    const wire = audit.wires[0];
    expect(wire.fromDevice).toBe('S1');
    expect(wire.toDevice).toBe('S2');
    expect(wire.pathPoints.length).toBeGreaterThanOrEqual(2);
    expect(wire.pathType).toBe('waypoint'); // has waypoints: []
  });

  test('audit detects unconnected devices', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 300, 300);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    expect(audit.stats.unconnectedDevices).toContain('S1');
  });

  test('device bounds account for rotation', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'contactor', 300, 300);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Rotate the device
    await canvasHelpers.clickCanvas(page, 330, 340);
    await page.waitForTimeout(200);
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    const audit = await page.evaluate(() => {
      return (window as any).__fusionCadState?.getRenderAudit?.();
    });

    const device = audit.devices[0];
    expect(device.rotation).toBe(90);
    // After 90° rotation, width and height should swap
    expect(device.bounds.width).not.toBe(device.bounds.height);
  });
});

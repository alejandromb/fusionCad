import { test, expect, type Page } from '../fixtures/fusion-cad.fixture';

// =============================================================================
// RENDER FINGERPRINT TEST — Phase 0 safety net for movable-labels feature
// =============================================================================
//
// Purpose: lock down the CURRENT rendering output (device bounds, tag/function
// label positions, pin world positions) so any unintended change to the render
// pipeline fails loudly. When the movable-labels feature lands, devices without
// an explicit offset must still produce EXACTLY these values — the feature
// must be purely additive.
//
// Label position rules from `render-audit.ts:244-259`:
//   tag:      { x: pos.x + bounds.width/2, y: pos.y - 3 }
//   function: { x: pos.x + bounds.width/2, y: pos.y - 18 }
//
// Test strategy: exercise Manual Switch (ANSI) thoroughly — the fixture
// defaults to the ANSI/NEMA standard filter in the right panel, so only ANSI
// symbols are immediately placeable. Manual Switch covers the full label +
// pin + bounds pipeline and has a deterministic 10×25 mm geometry.
//
// When rendering output changes intentionally (e.g., adding label offsets with
// new defaults):
//   1. Run this test to see the actual new values.
//   2. Update the expectations below.
//   3. Note WHY the numbers changed in the commit message.
// =============================================================================

type Fingerprint = {
  tag: string;
  symbol: string;
  rotation: number;
  bounds: { x: number; y: number; width: number; height: number };
  tagLabel: { x: number; y: number };
  pins: Array<{ pinId: string; x: number; y: number }>;
};

async function captureFingerprint(page: Page, tag: string): Promise<Fingerprint> {
  return page.evaluate((deviceTag) => {
    const audit = (window as any).__fusionCadState.getRenderAudit();
    const device = audit.devices.find((d: any) => d.tag === deviceTag);
    if (!device) throw new Error(`Device "${deviceTag}" not in audit`);
    const tagLabel = audit.labels.find((l: any) => l.type === 'tag' && l.text === deviceTag);
    if (!tagLabel) throw new Error(`Tag label for "${deviceTag}" not in audit`);
    return {
      tag: device.tag,
      symbol: device.symbol,
      rotation: device.rotation,
      bounds: device.bounds,
      tagLabel: { x: tagLabel.x, y: tagLabel.y },
      pins: device.pinPositions,
    };
  }, tag);
}

test.describe('Render fingerprint (Phase 0 safety net)', () => {
  test('Manual Switch at (100, 60) produces exact bounds + label + pins', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    const fp = await captureFingerprint(page, 'S1');

    expect(fp.tag).toBe('S1');
    expect(fp.symbol).toBe('ansi-manual-switch');
    expect(fp.rotation).toBe(0);
    // Manual Switch geometry: 10×25 mm, pins at local (10, 0) and (10, 25).
    expect(fp.bounds).toEqual({ x: 100, y: 60, width: 10, height: 25 });
    // Tag label = (pos.x + width/2, pos.y - 3).
    expect(fp.tagLabel).toEqual({ x: 105, y: 57 });
    expect(fp.pins).toEqual([
      { pinId: '1', x: 110, y: 60 },
      { pinId: '2', x: 110, y: 85 },
    ]);
  });

  test('Three devices: bounds, labels, pins are independent and deterministic', async ({ page, canvasHelpers }) => {
    // Multi-device layout baseline. The movable-labels feature must preserve
    // these label positions for any device without an explicit offset.
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.placeSymbol(page, 'button', 140, 60);
    await canvasHelpers.placeSymbol(page, 'button', 180, 60);
    await canvasHelpers.waitForDeviceCount(page, 3);

    const audit = await page.evaluate(() => (window as any).__fusionCadState.getRenderAudit());

    expect(audit.stats.totalDevices).toBe(3);
    expect(audit.overlaps).toHaveLength(0);
    expect(audit.stats.labelsOutsideSheet).toBe(0);
    expect(audit.stats.devicesOutsideSheet).toHaveLength(0);

    // Each device's tag label must sit exactly (pos.x + width/2, pos.y - 3).
    // This invariant is what the movable-labels feature must preserve for
    // unoffset devices.
    for (const dev of audit.devices) {
      const tagLabel = audit.labels.find(
        (l: any) => l.type === 'tag' && l.text === dev.tag,
      );
      expect(tagLabel, `tag label missing for ${dev.tag}`).toBeDefined();
      expect(tagLabel.x).toBe(dev.position.x + dev.bounds.width / 2);
      expect(tagLabel.y).toBe(dev.position.y - 3);
    }
  });

  test('Backward-compat: wired 2-device project without labelOffsets renders predictably', async ({ page, canvasHelpers }) => {
    // This is THE regression gate for the movable-labels feature. Devices
    // created BEFORE the feature land will not have a `labelOffsets` field.
    // After the feature lands, this same test must still pass — proving the
    // feature is purely additive and unoffset devices use the default anchor.
    //
    // If this test starts failing after a movable-labels merge, the commit
    // introduced a NEW default label position — which would visually shift
    // every device in every existing project.
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.placeSymbol(page, 'button', 100, 110);
    await canvasHelpers.waitForDeviceCount(page, 2);
    await canvasHelpers.createWire(page, 110, 85, 110, 110);
    await canvasHelpers.waitForConnectionCount(page, 1);

    const audit = await page.evaluate(() => (window as any).__fusionCadState.getRenderAudit());
    const state = await canvasHelpers.getState(page);

    // Circuit shape.
    expect(audit.stats.totalDevices).toBe(2);
    expect(audit.stats.totalWires).toBe(1);
    expect(audit.overlaps).toHaveLength(0);

    // Neither device has labelOffsets — they use the default position.
    for (const dev of state.circuit.devices) {
      expect(dev.labelOffsets, `${dev.tag} should have no labelOffsets`).toBeUndefined();
    }

    // Lock exact audit label positions for the 2 tags.
    const s1Tag = audit.labels.find((l: any) => l.type === 'tag' && l.text === 'S1');
    const s2Tag = audit.labels.find((l: any) => l.type === 'tag' && l.text === 'S2');
    expect(s1Tag).toEqual({ type: 'tag', text: 'S1', x: 105, y: 57 });
    expect(s2Tag).toEqual({ type: 'tag', text: 'S2', x: 105, y: 107 });

    // Lock the wire: 25mm total, classified as 'waypoint' (createWireConnection
    // stores waypoints as [] when none provided — see render-audit.ts:199; the
    // empty array triggers the 'waypoint' pathType branch even though visually
    // the path is straight). Intentional quirk, documenting here.
    expect(audit.wires).toHaveLength(1);
    const wire = audit.wires[0];
    expect(wire.pathType).toBe('waypoint');
    expect(wire.totalLength).toBe(25);
  });

  test('Rotated Manual Switch: bounds transpose, label follows rotated bounds', async ({ page, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 100, 60);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Select the device first, then rotate CW via keyboard shortcut.
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 105, 72);  // inside device bounds
    await page.waitForTimeout(100);
    await page.keyboard.press('r');
    await page.waitForTimeout(150);

    const fp = await captureFingerprint(page, 'S1');
    expect(fp.rotation).toBe(90);
    // After 90° rotation, bounds width ↔ height swap.
    expect(fp.bounds.width).toBe(25);
    expect(fp.bounds.height).toBe(10);
    // IMPORTANT — tag labels are anchored to the device's ORIGINAL position,
    // not the rotated bounds (see render-audit.ts:244-251). So for the device
    // placed at (100, 60) and rotated CW:
    //   tagLabel.y = position.y - 3 = 57  (NOT bounds.y - 3)
    //   tagLabel.x = position.x + bounds.width/2 = 100 + 25/2 = 112.5
    // This is a known quirk and must be preserved by movable-labels —
    // changing it would visually shift every rotated device's tag.
    expect(fp.tagLabel.y).toBe(57);
    expect(fp.tagLabel.x).toBe(112.5);
  });
});

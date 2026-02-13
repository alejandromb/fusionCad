/**
 * Canvas helpers for E2E tests.
 * Provides coordinate conversion and common canvas interactions.
 */

import type { Page } from '@playwright/test';

interface Viewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Get the current state from the dev-mode state bridge.
 */
export async function getState(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__fusionCadState);
}

/**
 * Wait for the state bridge to become available.
 */
export async function waitForStateBridge(page: Page, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    () => (window as any).__fusionCadState?.circuit !== null && (window as any).__fusionCadState?.circuit !== undefined,
    { timeout }
  );
}

/**
 * Convert world coordinates to screen (viewport) coordinates.
 */
export async function worldToScreen(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const state = await getState(page);
  const vp: Viewport = state.viewport;

  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not found');

  return {
    x: canvas.x + wx * vp.scale + vp.offsetX,
    y: canvas.y + wy * vp.scale + vp.offsetY,
  };
}

/**
 * Click on the canvas at the given world coordinates.
 */
export async function clickCanvas(page: Page, wx: number, wy: number, options?: { modifiers?: ('Shift' | 'Meta' | 'Control')[] }): Promise<void> {
  const screen = await worldToScreen(page, wx, wy);
  const mods = options?.modifiers || [];
  for (const mod of mods) await page.keyboard.down(mod);
  await page.mouse.click(screen.x, screen.y);
  for (const mod of mods) await page.keyboard.up(mod);
}

/**
 * Search for a symbol in the right panel, click to enter placement mode, then click canvas.
 */
export async function placeSymbol(page: Page, category: string, wx: number, wy: number): Promise<void> {
  // Get the label/name to search for
  const label = categoryToLabel(category);

  // Type in the right panel search box
  const searchInput = page.locator('.right-panel-search input');
  await searchInput.fill(label);
  await page.waitForTimeout(100);

  // Click the first matching symbol in the right panel grid
  await page.locator('.symbol-palette-item').first().click();
  await page.waitForTimeout(100);

  // Click canvas at world position
  await clickCanvas(page, wx, wy);

  // Wait for placement to register
  await page.waitForTimeout(200);
}

/**
 * Enter wire mode, click two pins to create a wire.
 */
export async function createWire(
  page: Page,
  fromWx: number, fromWy: number,
  toWx: number, toWy: number,
): Promise<void> {
  // Press W to enter wire mode
  await page.keyboard.press('w');
  await page.waitForTimeout(100);

  // Click from pin
  await clickCanvas(page, fromWx, fromWy);
  await page.waitForTimeout(100);

  // Click to pin
  await clickCanvas(page, toWx, toWy);
  await page.waitForTimeout(200);
}

/**
 * Wait until the device count in the state reaches the expected number.
 */
export async function waitForDeviceCount(page: Page, count: number, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__fusionCadState;
      return state?.circuit?.devices?.length === expected;
    },
    count,
    { timeout }
  );
}

/**
 * Wait until the connection count in the state reaches the expected number.
 */
export async function waitForConnectionCount(page: Page, count: number, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__fusionCadState;
      return state?.circuit?.connections?.length === expected;
    },
    count,
    { timeout }
  );
}

/**
 * Wait for save status to reach a specific value.
 */
export async function waitForSaveStatus(page: Page, status: string, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    (expected) => (window as any).__fusionCadState?.saveStatus === expected,
    status,
    { timeout }
  );
}

/**
 * Press a keyboard shortcut, adapting Meta vs Control for Mac.
 */
export async function pressShortcut(page: Page, key: string, modifiers: string[] = []): Promise<void> {
  const parts = [...modifiers, key];
  await page.keyboard.press(parts.join('+'));
}

/**
 * Switch to select mode by pressing the V keyboard shortcut.
 */
export async function selectMode(page: Page): Promise<void> {
  await page.keyboard.press('v');
  await page.waitForTimeout(50);
}

/**
 * Drag a marquee selection rectangle from one world position to another.
 * Uses steps: 5 to ensure the 3px drag threshold is crossed.
 */
export async function dragMarquee(
  page: Page,
  fromWx: number, fromWy: number,
  toWx: number, toWy: number,
  options?: { modifiers?: ('Shift' | 'Meta' | 'Control')[] }
): Promise<void> {
  const from = await worldToScreen(page, fromWx, fromWy);
  const to = await worldToScreen(page, toWx, toWy);
  // Marquee requires Shift (plain drag = pan). Merge with any extra modifiers.
  const mods = new Set(options?.modifiers || []);
  mods.add('Shift');

  for (const mod of mods) await page.keyboard.down(mod);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  for (const mod of mods) await page.keyboard.up(mod);

  await page.waitForTimeout(200);
}

/**
 * Get a device's position by its tag.
 * Resolves through device list since positions are keyed by device ID.
 */
export function getPositionByTag(state: any, tag: string): { x: number; y: number } | undefined {
  const device = state.circuit?.devices?.find((d: any) => d.tag === tag);
  if (!device) return undefined;
  return state.devicePositions[device.id];
}

/**
 * Check if a device with the given tag is selected.
 * selectedDevices contains device IDs, so we resolve via the device list.
 */
export function isSelectedByTag(state: any, tag: string): boolean {
  const device = state.circuit?.devices?.find((d: any) => d.tag === tag);
  if (!device) return false;
  return state.selectedDevices.includes(device.id);
}

function categoryToLabel(category: string): string {
  // Map old category names to search terms that will find symbols in the Insert Symbol dialog
  // Symbol names come from builtin-symbols.json
  // Important: Must match symbols with correct tagPrefix (e.g., button -> S, contactor -> K)
  const map: Record<string, string> = {
    contactor: 'Contactor 3P',
    button: 'Manual Switch',  // Has tagPrefix 'S' for S1, S2...
    overload: 'Thermal Overload',
    motor: 'Motor 3-Phase',
    terminal: 'Terminal Single',
    'power-supply': 'Power Supply',
  };
  return map[category] || category;
}

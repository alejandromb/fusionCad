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
 * Open Insert Symbol dialog, select a symbol, then click the canvas to place it.
 */
export async function placeSymbol(page: Page, category: string, wx: number, wy: number): Promise<void> {
  // Get the label/name to search for
  const label = categoryToLabel(category);

  // Click the "Insert Symbol..." button in sidebar
  await page.locator('.insert-btn').filter({ hasText: 'Insert Symbol' }).click();

  // Wait for dialog to open
  await page.locator('.insert-symbol-dialog').waitFor({ state: 'visible' });

  // Type in the search box to find the symbol
  await page.locator('.insert-symbol-search input').fill(label);
  await page.waitForTimeout(100);

  // Click the first matching symbol in the grid
  await page.locator('.symbol-grid-item').first().click();

  // Wait for dialog to close and mode to switch
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
  // Click wire tool
  await page.locator('.toolbar .tool-btn').filter({ hasText: 'Wire' }).click();
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
 * Switch to select mode by clicking the Select tool button.
 */
export async function selectMode(page: Page): Promise<void> {
  await page.locator('.toolbar .tool-btn').filter({ hasText: 'Select' }).click();
  await page.waitForTimeout(50);
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

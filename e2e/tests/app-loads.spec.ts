import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('App loads', () => {
  test('canvas is visible', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('toolbar tools are present', async ({ page }) => {
    await expect(page.locator('.toolbar .toolbar-btn').first()).toBeVisible();
  });

  test('right panel shows symbol palette', async ({ page }) => {
    // Verify right panel is visible
    const rightPanel = page.locator('.right-panel');
    await expect(rightPanel).toBeVisible();

    // Verify tabs (Symbols, Favorites, Parts)
    await expect(rightPanel.locator('.right-panel-tab').filter({ hasText: 'Symbols' })).toBeVisible();
    await expect(rightPanel.locator('.right-panel-tab').filter({ hasText: 'Favorites' })).toBeVisible();
    await expect(rightPanel.locator('.right-panel-tab').filter({ hasText: 'Parts' })).toBeVisible();

    // Verify search input
    await expect(rightPanel.locator('.right-panel-search input')).toBeVisible();

    // Verify standard filter chips
    await expect(rightPanel.locator('.standard-chip').filter({ hasText: 'All' })).toBeVisible();
    await expect(rightPanel.locator('.standard-chip').filter({ hasText: 'IEC 60617' })).toBeVisible();
    await expect(rightPanel.locator('.standard-chip').filter({ hasText: 'ANSI/NEMA' })).toBeVisible();

    // Verify category chips
    await expect(rightPanel.locator('.category-chip').filter({ hasText: 'All' })).toBeVisible();

    // Verify symbols are shown
    await expect(rightPanel.locator('.symbol-palette-item').first()).toBeVisible();

    // Test search functionality
    await rightPanel.locator('.right-panel-search input').fill('Motor');
    await page.waitForTimeout(100);
    await expect(rightPanel.locator('.symbol-palette-item').first()).toBeVisible();
  });

  test('state bridge is available in dev mode', async ({ page }) => {
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state).toBeTruthy();
    expect(state.circuit).toBeTruthy();
    expect(state.viewport).toBeTruthy();
    expect(state.interactionMode).toBe('select');
  });

  test('empty project starts with zero devices', async ({ page }) => {
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state.circuit.devices).toHaveLength(0);
    expect(state.circuit.connections).toHaveLength(0);
  });
});

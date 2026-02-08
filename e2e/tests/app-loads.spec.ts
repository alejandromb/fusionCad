import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('App loads', () => {
  test('canvas is visible', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('sidebar tools are present', async ({ page }) => {
    await expect(page.locator('.tool-btn').filter({ hasText: 'Select' })).toBeVisible();
    await expect(page.locator('.tool-btn').filter({ hasText: 'Wire' })).toBeVisible();
  });

  test('Insert Symbol dialog opens and shows symbols', async ({ page }) => {
    // Click the "Insert Symbol..." button
    await page.locator('.insert-btn').filter({ hasText: 'Insert Symbol' }).click();

    // Verify dialog opens
    const dialog = page.locator('.insert-symbol-dialog');
    await expect(dialog).toBeVisible();

    // Verify search input is present
    await expect(dialog.locator('.insert-symbol-search input')).toBeVisible();

    // Verify category filters are present
    await expect(dialog.locator('.insert-symbol-categories')).toBeVisible();
    await expect(dialog.locator('.category-btn').filter({ hasText: 'All' })).toBeVisible();

    // Verify symbols are shown in the grid
    await expect(dialog.locator('.symbol-grid-item').first()).toBeVisible();

    // Test search functionality
    await dialog.locator('.insert-symbol-search input').fill('Motor');
    await page.waitForTimeout(100);
    await expect(dialog.locator('.symbol-grid-item').first()).toBeVisible();

    // Close dialog
    await page.locator('.dialog-close').click();
    await expect(dialog).not.toBeVisible();
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

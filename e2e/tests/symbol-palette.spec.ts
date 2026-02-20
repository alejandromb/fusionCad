import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Symbol palette', () => {
  test('right panel shows symbols tab by default', async ({ page }) => {
    const tab = page.locator('.right-panel-tab.active');
    await expect(tab).toContainText('Symbols');
  });

  test('search filters symbols', async ({ page }) => {
    const searchInput = page.locator('.right-panel-search input');
    await searchInput.fill('Motor');
    await page.waitForTimeout(200);

    const items = page.locator('.symbol-palette-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // All visible items should relate to motor
    for (let i = 0; i < count; i++) {
      const name = await items.nth(i).locator('.symbol-palette-name').textContent();
      expect(name?.toLowerCase()).toContain('motor');
    }
  });

  test('clicking symbol enters placement mode', async ({ page, canvasHelpers }) => {
    // Click a symbol in the palette
    await page.locator('.symbol-palette-item').first().click();
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('place');
  });

  test('category chips filter symbols', async ({ page }) => {
    // Get initial count
    const allCount = await page.locator('.symbol-palette-item').count();

    // Click a specific category chip (not "All")
    const chips = page.locator('.category-chip');
    const chipCount = await chips.count();

    if (chipCount > 1) {
      // Click second chip (first is "All")
      await chips.nth(1).click();
      await page.waitForTimeout(200);

      const filteredCount = await page.locator('.symbol-palette-item').count();
      // Filtered should be fewer or equal
      expect(filteredCount).toBeLessThanOrEqual(allCount);

      // Click "All" to reset
      await chips.first().click();
      await page.waitForTimeout(200);

      const resetCount = await page.locator('.symbol-palette-item').count();
      expect(resetCount).toBe(allCount);
    }
  });

  test('right panel can be collapsed and expanded', async ({ page }) => {
    // Panel should start expanded
    const panel = page.locator('.right-panel');
    await expect(panel).toBeVisible();

    // Click toggle to collapse
    const toggle = page.locator('.right-panel-toggle');
    await toggle.click();
    await page.waitForTimeout(200);

    // Should be collapsed
    await expect(page.locator('.right-panel-collapsed')).toBeVisible();

    // Click toggle to expand
    await page.locator('.right-panel-toggle').click();
    await page.waitForTimeout(200);

    // Should be expanded again with content visible
    await expect(page.locator('.right-panel-content')).toBeVisible();
  });

  test('clear search restores all symbols', async ({ page }) => {
    const searchInput = page.locator('.right-panel-search input');

    // Get initial count
    const allCount = await page.locator('.symbol-palette-item').count();

    // Search for something specific
    await searchInput.fill('Contactor');
    await page.waitForTimeout(200);
    const filteredCount = await page.locator('.symbol-palette-item').count();
    expect(filteredCount).toBeLessThan(allCount);

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(200);
    const resetCount = await page.locator('.symbol-palette-item').count();
    expect(resetCount).toBe(allCount);
  });
});

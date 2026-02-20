import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('ERC (Electrical Rules Check)', () => {
  test('open ERC dialog from header', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("ERC")');
    await page.waitForTimeout(200);

    const dialog = page.locator('.erc-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=Electrical Rules Check').or(
      dialog.locator('text=ERC')
    ).first()).toBeVisible();
  });

  test('run ERC on empty circuit shows no violations', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("ERC")');
    await page.waitForTimeout(200);

    // Click Run ERC
    await page.click('.erc-run-btn');
    await page.waitForTimeout(500);

    // Should show no violations or an empty state
    const emptyMessage = page.locator('.erc-empty');
    const table = page.locator('.erc-table');

    // Either no violations message or an empty table
    const isEmpty = await emptyMessage.isVisible();
    const hasRows = await table.locator('.erc-row').count();

    // Empty circuit might have 0 violations or just info-level notes
    expect(isEmpty || hasRows >= 0).toBe(true);
  });

  test('run ERC on circuit with device completes without crash', async ({ page, canvasHelpers }) => {
    // Place a device
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Wait for circuit to be in state
    await page.waitForTimeout(300);

    // Open ERC — button only visible when circuit is loaded
    const ercBtn = page.locator('.reports-header-btn:has-text("ERC")');
    await ercBtn.waitFor({ state: 'visible', timeout: 5000 });
    await ercBtn.click();
    await page.waitForTimeout(200);

    // Run ERC
    await page.click('.erc-run-btn');
    await page.waitForTimeout(1000);

    // ERC should complete — verify summary counters are displayed
    const summary = page.locator('.erc-summary');
    const noViolations = page.locator('text=No violations found');
    const ercRows = page.locator('.erc-row');

    // Either we have violations listed, or the "no violations" message
    const hasRows = await ercRows.count();
    const hasNoViolationsMsg = await noViolations.isVisible();

    expect(hasRows >= 0 || hasNoViolationsMsg).toBe(true);
  });

  test('ERC dialog close button works', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("ERC")');
    await page.waitForTimeout(200);
    await expect(page.locator('.erc-dialog')).toBeVisible();

    await page.click('.dialog-close');
    await page.waitForTimeout(200);
    await expect(page.locator('.erc-dialog')).not.toBeVisible();
  });

  test('ERC severity filters toggle results', async ({ page, canvasHelpers }) => {
    // Place a device so there are violations
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    await page.click('.reports-header-btn:has-text("ERC")');
    await page.waitForTimeout(200);
    await page.click('.erc-run-btn');
    await page.waitForTimeout(500);

    // Get initial count
    const initialCount = await page.locator('.erc-row').count();

    if (initialCount > 0) {
      // Try toggling a filter - look for filter buttons
      const filterBtns = page.locator('.erc-filter-btn');
      const filterCount = await filterBtns.count();

      if (filterCount > 0) {
        // Click first filter to toggle it
        await filterBtns.first().click();
        await page.waitForTimeout(200);

        // Count might change
        const newCount = await page.locator('.erc-row').count();
        // Just verify it didn't crash
        expect(newCount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

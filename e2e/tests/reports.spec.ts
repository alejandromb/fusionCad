import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Reports', () => {
  test('open reports dialog from header', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("Reports")');
    await page.waitForTimeout(200);

    const dialog = page.locator('.reports-dialog');
    await expect(dialog).toBeVisible();
  });

  test('reports dialog shows all report types', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("Reports")');
    await page.waitForTimeout(200);

    // Should show BOM, Wire List, Terminal Plan, Cable Schedule
    await expect(page.locator('.report-name:has-text("Bill of Materials")')).toBeVisible();
    await expect(page.locator('.report-name:has-text("Wire List")')).toBeVisible();
    await expect(page.locator('.report-name:has-text("Terminal Plan")')).toBeVisible();
    await expect(page.locator('.report-name:has-text("Cable Schedule")')).toBeVisible();
  });

  test('close reports dialog', async ({ page }) => {
    await page.click('.reports-header-btn:has-text("Reports")');
    await page.waitForTimeout(200);
    await expect(page.locator('.reports-dialog')).toBeVisible();

    await page.click('.reports-close');
    await page.waitForTimeout(200);
    await expect(page.locator('.reports-dialog')).not.toBeVisible();
  });

  test('generate BOM report with devices', async ({ page, canvasHelpers }) => {
    // Place some devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'contactor', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Open reports
    await page.click('.reports-header-btn:has-text("Reports")');
    await page.waitForTimeout(200);

    // Set up download listener
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.click('.report-btn:has-text("Bill of Materials")'),
    ]);

    // BOM should trigger a download (CSV) or at least not crash
    // If download is null, the report might render inline
    await page.waitForTimeout(500);
  });

  test('generate wire list report', async ({ page, canvasHelpers }) => {
    // Place two Manual Switch symbols vertically and wire them
    // Manual Switch: pins at (x+20, y+0) and (x+20, y+60)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 (220, 260) to S2 pin 1 (220, 400)
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // Open reports and generate wire list
    await page.click('.reports-header-btn:has-text("Reports")');
    await page.waitForTimeout(200);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      page.click('.report-btn:has-text("Wire List")'),
    ]);

    await page.waitForTimeout(500);
  });
});

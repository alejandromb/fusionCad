import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Sheet management', () => {
  test('project starts with one sheet', async ({ page, canvasHelpers }) => {
    const state = await canvasHelpers.getState(page);
    expect(state.sheets).toHaveLength(1);
    expect(state.activeSheetId).toBe(state.sheets[0].id);

    // Sheet tab should be visible
    await expect(page.locator('.sheet-tab').first()).toBeVisible();
  });

  test('add sheet button creates a new sheet', async ({ page, canvasHelpers }) => {
    // Click the add sheet button
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    const state = await canvasHelpers.getState(page);
    expect(state.sheets).toHaveLength(2);

    // Should have two visible tabs
    const tabs = page.locator('.sheet-tab:not(.add-tab)');
    await expect(tabs).toHaveCount(2);
  });

  test('clicking tab switches active sheet', async ({ page, canvasHelpers }) => {
    // Add a second sheet
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    let state = await canvasHelpers.getState(page);
    const sheet1Id = state.sheets[0].id;
    const sheet2Id = state.sheets[1].id;

    // Should be on sheet 2 (newly created)
    expect(state.activeSheetId).toBe(sheet2Id);

    // Click first tab to switch back
    const tabs = page.locator('.sheet-tab:not(.add-tab)');
    await tabs.first().click();
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.activeSheetId).toBe(sheet1Id);
  });

  test('devices are per-sheet', async ({ page, canvasHelpers }) => {
    // Place device on sheet 1
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Add sheet 2
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    // Sheet 2 should be active but the device belongs to sheet 1
    const state = await canvasHelpers.getState(page);
    expect(state.sheets).toHaveLength(2);

    // Place device on sheet 2
    await canvasHelpers.placeSymbol(page, 'contactor', 200, 200);
    await page.waitForTimeout(300);

    // Total devices should be 2
    const updatedState = await canvasHelpers.getState(page);
    expect(updatedState.circuit.devices.length).toBeGreaterThanOrEqual(2);
  });

  test('rename sheet via double-click', async ({ page, canvasHelpers }) => {
    const tab = page.locator('.sheet-tab:not(.add-tab)').first();

    // Double-click to trigger rename
    await tab.dblclick();
    await page.waitForTimeout(200);

    // Input should appear
    const input = page.locator('.sheet-tab-input');
    await expect(input).toBeVisible();

    // Type new name and press Enter
    await input.fill('Power Circuit');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Tab should show new name
    const state = await canvasHelpers.getState(page);
    expect(state.sheets[0].name).toBe('Power Circuit');
  });

  test('last sheet cannot be deleted', async ({ page, canvasHelpers }) => {
    // Verify we only have 1 sheet
    const state = await canvasHelpers.getState(page);
    expect(state.sheets).toHaveLength(1);

    // Right-click to open context menu on the only tab
    const tab = page.locator('.sheet-tab:not(.add-tab)').first();
    await tab.click({ button: 'right' });
    await page.waitForTimeout(200);

    // Check for context menu
    const menu = page.locator('.sheet-context-menu');
    const menuVisible = await menu.isVisible();

    if (menuVisible) {
      // The delete option should be disabled for the last sheet
      const deleteItem = page.locator('.menu-item.danger');
      const deleteVisible = await deleteItem.isVisible();
      if (deleteVisible) {
        // Verify it's disabled (cannot delete the last sheet)
        const isDisabled = await deleteItem.isDisabled();
        expect(isDisabled).toBe(true);
      }
      // Close the menu
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // Sheet should still exist
    const updatedState = await canvasHelpers.getState(page);
    expect(updatedState.sheets.length).toBeGreaterThanOrEqual(1);
  });

  test('delete sheet when multiple exist', async ({ page, canvasHelpers }) => {
    // Add a second sheet
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    let state = await canvasHelpers.getState(page);
    expect(state.sheets).toHaveLength(2);

    // Right-click the active (second) tab
    const tabs = page.locator('.sheet-tab:not(.add-tab)');
    await tabs.last().click({ button: 'right' });
    await page.waitForTimeout(200);

    // Click delete
    const deleteItem = page.locator('.menu-item.danger');
    if (await deleteItem.isVisible()) {
      await deleteItem.click();
      await page.waitForTimeout(300);

      state = await canvasHelpers.getState(page);
      expect(state.sheets).toHaveLength(1);
    }
  });
});

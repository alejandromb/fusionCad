import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Project management', () => {
  test('project name is visible in header', async ({ page, canvasHelpers }) => {
    const state = await canvasHelpers.getState(page);
    const projectName = state.projectName;
    expect(projectName).toBeTruthy();

    await expect(page.locator('.project-name')).toContainText(projectName);
  });

  test('save status indicator shows saved state', async ({ page, canvasHelpers }) => {
    // Wait for initial save cycle to complete
    await canvasHelpers.waitForSaveStatus(page, 'saved');

    const saveStatus = page.locator('.save-status');
    await expect(saveStatus).toBeVisible();
    await expect(saveStatus).toHaveClass(/saved/);
  });

  test('placing device triggers save cycle', async ({ page, canvasHelpers }) => {
    // Wait for initial saved state
    await canvasHelpers.waitForSaveStatus(page, 'saved');

    // Place a device
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Should eventually return to saved
    await canvasHelpers.waitForSaveStatus(page, 'saved', 15000);

    const state = await canvasHelpers.getState(page);
    expect(state.saveStatus).toBe('saved');
  });

  test('header shows circuit stats', async ({ page, canvasHelpers }) => {
    // Place some devices
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'contactor', 400, 200);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Stats should show device count
    const stats = page.locator('.circuit-stats');
    await expect(stats).toContainText('2');
  });

  test('project menu opens and closes', async ({ page }) => {
    // Click project selector to open menu
    await page.click('.project-button');
    await page.waitForTimeout(200);

    const menu = page.locator('.project-menu');
    await expect(menu).toBeVisible();

    // Click backdrop to close
    await page.click('.menu-backdrop');
    await page.waitForTimeout(200);
    await expect(menu).not.toBeVisible();
  });
});

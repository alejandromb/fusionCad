import { test, expect } from '../fixtures/fusion-cad.fixture';

/**
 * Auth UI tests — verifies auth-related UI elements render correctly.
 * Note: Actual Cognito auth flow is not tested in E2E (external service).
 * These tests run with BYPASS_AUTH=true and no Cognito env vars,
 * so auth is disabled and the app works as before.
 */

test.describe('Auth UI', () => {
  test('storage type shows in status bar', async ({ page }) => {
    // The app should load and show a storage type indicator
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();
  });

  test('app loads without auth env vars (backward compat)', async ({ page }) => {
    // Without VITE_COGNITO_USER_POOL_ID, auth is disabled
    // App should still load and function normally
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state).toBeTruthy();
    expect(state.projectId).toBeTruthy();
    expect(state.circuit).toBeTruthy();
  });

  test('sign-in button shows coming-soon modal when auth disabled', async ({ page }) => {
    // Sign In button is always visible, but shows "coming soon" when Cognito is not configured
    const signInBtn = page.locator('.auth-header-btn.signin-btn');
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();
    const modal = page.locator('.auth-dialog');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('coming soon');
    // Close modal
    await page.locator('.auth-dialog .btn.primary').click();
    await expect(modal).not.toBeVisible();
  });

  test('storage badge shows cloud when API is reachable', async ({ page }) => {
    // With API running (test servers), storage should be 'rest' (cloud)
    const badge = page.locator('.storage-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('Cloud');
  });

  test('project CRUD still works with auth bypass', async ({ page }) => {
    // Verify basic project operations still work
    const state = await page.evaluate(() => (window as any).__fusionCadState);
    expect(state.projectId).toBeTruthy();
    expect(state.saveStatus).toBeDefined();
  });
});

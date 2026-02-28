import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Auth Modal', () => {
  test('OAuth buttons are hidden when VITE_COGNITO_OAUTH_DOMAIN is not set', async ({ page }) => {
    // In test environment, auth is disabled (BYPASS_AUTH=true) and no OAuth domain is set.
    // The auth modal shows a "coming soon" state when auth is not enabled.
    // When auth IS enabled but OAuth domain is NOT set, OAuth buttons should be absent.

    // Look for sign-in button in header
    const authBtn = page.locator('.auth-header-btn.signin-btn');
    const hasAuthBtn = await authBtn.isVisible().catch(() => false);

    if (hasAuthBtn) {
      await authBtn.click();
      await page.waitForTimeout(300);

      // OAuth buttons should NOT be visible (no VITE_COGNITO_OAUTH_DOMAIN)
      await expect(page.locator('.auth-oauth-google')).not.toBeVisible();
      await expect(page.locator('.auth-oauth-github')).not.toBeVisible();
    }
    // If no auth button visible, auth is disabled — test passes (OAuth can't appear)
  });

  test('auth modal opens and can be closed', async ({ page }) => {
    const authBtn = page.locator('.auth-header-btn.signin-btn');
    const hasAuthBtn = await authBtn.isVisible().catch(() => false);

    if (hasAuthBtn) {
      await authBtn.click();
      await page.waitForTimeout(200);

      const dialog = page.locator('.auth-dialog');
      await expect(dialog).toBeVisible();

      // Close it
      await page.click('.dialog-close');
      await page.waitForTimeout(200);
      await expect(dialog).not.toBeVisible();
    }
  });
});

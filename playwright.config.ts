import { defineConfig } from '@playwright/test';

const slowMo = parseInt(process.env.SLOWMO || '0', 10);

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  webServer: [
    {
      command: 'DB_NAME=fusion_cad_test PORT=3003 npm run dev:api',
      url: 'http://localhost:3003/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'VITE_API_URL=http://localhost:3003 npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      cwd: './apps/web',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});

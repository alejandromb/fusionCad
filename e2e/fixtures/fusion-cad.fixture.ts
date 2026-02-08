/**
 * Custom Playwright fixture for fusionCad E2E tests.
 * Every test gets a clean empty project and canvas helpers.
 */

import { test as base } from '@playwright/test';
import { deleteAllProjects, createEmptyProject } from '../helpers/api-helpers';
import * as canvas from '../helpers/canvas-helpers';

export interface FusionCadFixtures {
  /** The project ID created for this test */
  projectId: string;
  /** Canvas interaction helpers bound to the current page */
  canvasHelpers: typeof canvas;
}

export const test = base.extend<FusionCadFixtures>({
  // Auto-fixture: every test gets a clean project and navigated page
  projectId: [async ({ page }, use) => {
    // Clean slate: delete all projects, create a fresh empty one
    await deleteAllProjects();
    const id = await createEmptyProject();

    // Navigate to the project
    await page.goto(`/?project=${id}`);
    await canvas.waitForStateBridge(page);

    await use(id);
  }, { auto: true }],

  canvasHelpers: async ({}, use) => {
    await use(canvas);
  },
});

export { expect } from '@playwright/test';

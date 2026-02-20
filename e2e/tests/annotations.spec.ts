import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Annotations', () => {
  test('T key activates text mode', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    const state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('text');
  });

  test('create annotation via text mode click', async ({ page, canvasHelpers }) => {
    // Switch to text mode
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    // Set up dialog handler before clicking
    page.on('dialog', async (dialog) => {
      await dialog.accept('Test Annotation');
    });

    // Click canvas to place annotation
    await canvasHelpers.clickCanvas(page, 300, 300);
    await page.waitForTimeout(300);

    // Verify annotation was created
    const state = await canvasHelpers.getState(page);
    const annotations = state.circuit.annotations || [];
    expect(annotations.length).toBeGreaterThanOrEqual(1);

    const annotation = annotations[annotations.length - 1];
    expect(annotation.content).toBe('Test Annotation');
  });

  test('annotation appears in sidebar when selected', async ({ page, canvasHelpers }) => {
    // Create an annotation
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    page.on('dialog', async (dialog) => {
      await dialog.accept('My Note');
    });

    await canvasHelpers.clickCanvas(page, 300, 300);
    await page.waitForTimeout(300);

    // Switch to select mode
    await page.keyboard.press('v');
    await page.waitForTimeout(100);

    // Click on the annotation position to select it
    await canvasHelpers.clickCanvas(page, 300, 300);
    await page.waitForTimeout(300);

    // Check if annotation section appears in sidebar
    const state = await canvasHelpers.getState(page);
    if (state.selectedAnnotationId) {
      // Sidebar should show annotation properties
      const annotationSection = page.locator('.annotation-properties');
      await expect(annotationSection).toBeVisible();
    }
  });

  test('cancel annotation prompt does not create annotation', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    // Dismiss the dialog
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    await canvasHelpers.clickCanvas(page, 300, 300);
    await page.waitForTimeout(300);

    const state = await canvasHelpers.getState(page);
    const annotations = state.circuit.annotations || [];
    expect(annotations).toHaveLength(0);
  });

  test('Escape exits text mode back to select', async ({ page, canvasHelpers }) => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);

    let state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('text');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    state = await canvasHelpers.getState(page);
    expect(state.interactionMode).toBe('select');
  });
});

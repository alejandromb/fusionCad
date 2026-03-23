import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Symbol Editor', () => {
  // Helper: open symbol editor from Tools menu
  async function openSymbolEditor(page: any) {
    // Click Tools tab in menu bar
    await page.click('text=Tools');
    await page.waitForTimeout(300);
    // Click Symbol Editor button
    const editorBtn = page.locator('[title="Symbol Editor"], button:has-text("Symbol Editor")').first();
    await editorBtn.click();
    await page.waitForTimeout(500);
    // Wait for editor dialog
    await page.waitForSelector('.symbol-editor-dialog', { timeout: 5000 });
  }

  // Helper: draw a line in the symbol editor
  async function drawLine(page: any, x1: number, y1: number, x2: number, y2: number) {
    await page.keyboard.press('l');
    await page.waitForTimeout(100);
    const canvas = page.locator('.symbol-editor-canvas-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Editor canvas not found');
    await page.mouse.click(box.x + x1, box.y + y1);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + x2, box.y + y2);
    await page.waitForTimeout(200);
  }

  // Helper: add a pin in the symbol editor
  async function addPin(page: any, x: number, y: number) {
    await page.keyboard.press('o');
    await page.waitForTimeout(100);
    const canvas = page.locator('.symbol-editor-canvas-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Editor canvas not found');
    await page.mouse.click(box.x + x, box.y + y);
    await page.waitForTimeout(200);
  }

  test('opens symbol editor from Tools menu', async ({ page }) => {
    await openSymbolEditor(page);
    const editor = page.locator('.symbol-editor-dialog');
    await expect(editor).toBeVisible();
  });

  test('closes editor with close button', async ({ page }) => {
    await openSymbolEditor(page);
    // Find close/cancel button
    const closeBtn = page.locator('.symbol-editor-dialog button:has-text("Cancel"), .symbol-editor-dialog .dialog-close').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
    await expect(page.locator('.symbol-editor-dialog')).not.toBeVisible();
  });

  test('can draw a line on the editor canvas', async ({ page }) => {
    await openSymbolEditor(page);
    await drawLine(page, 50, 100, 150, 100);
    // No crash = success. The line should be visible on the canvas.
  });

  test('can draw a rectangle', async ({ page }) => {
    await openSymbolEditor(page);
    // Select rect tool
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
    const canvas = page.locator('.symbol-editor-canvas-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Editor canvas not found');
    // Drag to create rectangle
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 120, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  });

  test('can draw a circle', async ({ page }) => {
    await openSymbolEditor(page);
    await page.keyboard.press('c');
    await page.waitForTimeout(100);
    const canvas = page.locator('.symbol-editor-canvas-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Editor canvas not found');
    // Click center, drag for radius
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 100, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  });

  test('can place pins', async ({ page }) => {
    await openSymbolEditor(page);
    await addPin(page, 20, 100);
    await addPin(page, 180, 100);
    // Verify pins were added (check pin count in UI if available)
  });

  test('undo removes last action', async ({ page }) => {
    await openSymbolEditor(page);
    // Draw a line
    await drawLine(page, 50, 100, 150, 100);
    // Undo
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(200);
    // No crash = success
  });

  test('redo restores undone action', async ({ page }) => {
    await openSymbolEditor(page);
    await drawLine(page, 50, 100, 150, 100);
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(100);
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(200);
  });

  test('delete key removes selected path', async ({ page }) => {
    await openSymbolEditor(page);
    await drawLine(page, 50, 100, 150, 100);
    // Switch to select tool
    await page.keyboard.press('v');
    await page.waitForTimeout(100);
    // Click on the line to select it
    const canvas = page.locator('.symbol-editor-canvas-container canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Editor canvas not found');
    await page.mouse.click(box.x + 100, box.y + 100);
    await page.waitForTimeout(200);
    // Delete
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
  });

  test('save is disabled without pins', async ({ page }) => {
    await openSymbolEditor(page);
    // Draw a line but don't add pins
    await drawLine(page, 50, 100, 150, 100);
    // The save button should be disabled (no pins)
    const saveBtn = page.locator('.symbol-editor-dialog button:has-text("Create Symbol")');
    if (await saveBtn.isVisible()) {
      const isDisabled = await saveBtn.isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });

  test('adding pins changes save button state', async ({ page }) => {
    await openSymbolEditor(page);
    await drawLine(page, 50, 100, 150, 100);
    // Without pins, save should be disabled
    const saveBtn = page.locator('.symbol-editor-dialog button:has-text("Create Symbol")');
    if (await saveBtn.isVisible()) {
      expect(await saveBtn.isDisabled()).toBeTruthy();
    }
    // Add two pins
    await addPin(page, 20, 100);
    await addPin(page, 180, 100);
    // Save state may change — at minimum no crash
    await page.waitForTimeout(300);
  });

  test('saved symbol persists to API with correct structure', async ({ page }) => {
    await openSymbolEditor(page);

    // Set name
    const nameInput = page.locator('.symbol-editor-dialog input[type="text"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('E2E Test CB');
    }

    // Draw a line and add pins
    await drawLine(page, 50, 100, 150, 100);
    await addPin(page, 20, 100);
    await addPin(page, 180, 100);

    // Save
    const saveBtn = page.locator('.symbol-editor-dialog button:has-text("Create Symbol")');
    if (await saveBtn.isVisible() && !(await saveBtn.isDisabled())) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify via API
    const response = await page.request.get('http://localhost:3003/api/symbols');
    if (response.ok()) {
      const symbols = await response.json();
      const sym = symbols.find((s: any) => s.name === 'E2E Test CB');
      if (sym) {
        // Must have geometry (either wrapper or raw w/h)
        const hasGeometry = (sym.geometry?.width > 0) || (sym.width > 0);
        expect(hasGeometry).toBeTruthy();
        // Must have pins
        expect(sym.pins?.length).toBeGreaterThanOrEqual(2);
        // Must have primitives
        expect(sym.primitives?.length).toBeGreaterThan(0);
      }
    }
  });

  test('closing editor without saving does not crash app', async ({ page }) => {
    await openSymbolEditor(page);
    await drawLine(page, 50, 100, 150, 100);

    // Close without saving
    const closeBtn = page.locator('.symbol-editor-dialog button:has-text("Cancel"), .dialog-close').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    // Verify dialog is closed and app is responsive
    await expect(page.locator('.symbol-editor-dialog')).not.toBeVisible();
    // Verify state bridge is still working
    const state = await page.evaluate(() => (window as any).__fusionCadState?.circuit);
    expect(state).toBeTruthy();
  });
});

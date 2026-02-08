import { test, expect } from '../fixtures/fusion-cad.fixture';
import { getProject } from '../helpers/api-helpers';

test.describe('Persistence', () => {
  test('placed symbol auto-saves to the API', async ({ page, projectId, canvasHelpers }) => {
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Wait for auto-save to complete (debounce is 1000ms)
    await canvasHelpers.waitForSaveStatus(page, 'saved', 15000);

    // Verify via API
    const project = await getProject(projectId);
    expect(project.circuitData.devices).toHaveLength(1);
    expect(project.circuitData.devices[0].tag).toBe('S1');
  });

  test('data persists across page reload', async ({ page, projectId, canvasHelpers }) => {
    // Place a symbol
    await canvasHelpers.placeSymbol(page, 'contactor', 300, 300);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Wait for save
    await canvasHelpers.waitForSaveStatus(page, 'saved', 15000);

    // Reload the page
    await page.reload();
    await canvasHelpers.waitForStateBridge(page);

    // Verify device is still there
    const state = await canvasHelpers.getState(page);
    expect(state.circuit.devices).toHaveLength(1);
    expect(state.circuit.devices[0].tag).toBe('K1');
  });

  test('save status indicator shows correct states', async ({ page, canvasHelpers }) => {
    // Wait for initial load save cycle to settle
    await canvasHelpers.waitForSaveStatus(page, 'saved', 15000);

    // Place a symbol (triggers unsaved → saving → saved)
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);

    // Should eventually reach saved again
    await canvasHelpers.waitForSaveStatus(page, 'saved', 15000);

    const finalState = await canvasHelpers.getState(page);
    expect(finalState.saveStatus).toBe('saved');
  });
});

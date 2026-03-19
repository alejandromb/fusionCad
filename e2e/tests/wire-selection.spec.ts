import { test, expect } from '../fixtures/fusion-cad.fixture';

test.describe('Wire selection', () => {
  test('clicking a wire selects it and shows correct properties', async ({ page, canvasHelpers }) => {
    // Place two buttons and wire them
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // Switch to select mode and click on the wire (midpoint between pins)
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 220, 330);
    await page.waitForTimeout(200);

    const state = await canvasHelpers.getState(page);
    expect(state.selectedWireIndex).toBe(0);

    // The selected wire in sheetConnections should match the actual connection
    const sheetConn = state.sheetConnections[state.selectedWireIndex];
    expect(sheetConn.fromDevice).toBe('S1');
    expect(sheetConn.toDevice).toBe('S2');
  });

  test('wire selection on multi-sheet project selects correct wire', async ({ page, canvasHelpers }) => {
    // === Sheet 1: place two buttons and wire them ===
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    // Wire S1 pin 2 → S2 pin 1 on sheet 1
    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // === Sheet 2: add sheet, place two more buttons at DIFFERENT positions ===
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    // Use offset positions (400, 200) to avoid pin collision with sheet 1 devices
    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await page.waitForTimeout(300);
    await canvasHelpers.placeSymbol(page, 'button', 400, 400);
    await page.waitForTimeout(300);

    // Wire S3 pin 2 (420, 260) → S4 pin 1 (420, 400) on sheet 2
    await canvasHelpers.createWire(page, 420, 260, 420, 400);
    await page.waitForTimeout(300);

    let state = await canvasHelpers.getState(page);
    // We should have 4 devices total and 2 connections total
    expect(state.circuit.devices.length).toBeGreaterThanOrEqual(4);
    expect(state.circuit.connections.length).toBe(2);

    // Sheet 2 should only show 1 connection (the one on this sheet)
    expect(state.sheetConnections).toHaveLength(1);

    // === Click the wire on sheet 2 ===
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 420, 330);
    await page.waitForTimeout(200);

    state = await canvasHelpers.getState(page);
    expect(state.selectedWireIndex).toBe(0); // index 0 in filtered array

    // The selected wire should be the sheet 2 wire (S3→S4), NOT the sheet 1 wire (S1→S2)
    const selectedConn = state.sheetConnections[state.selectedWireIndex];
    expect(selectedConn).toBeDefined();
    // Sheet 2 wire connects S3/S4 (the 3rd and 4th buttons placed)
    expect(selectedConn.fromDevice).not.toBe('S1');
    expect(selectedConn.toDevice).not.toBe('S2');

    // The _globalIndex should point to the correct entry in circuit.connections
    const globalConn = state.circuit.connections[selectedConn._globalIndex];
    expect(globalConn.fromDevice).toBe(selectedConn.fromDevice);
    expect(globalConn.toDevice).toBe(selectedConn.toDevice);
  });

  test('deleting a wire on sheet 2 does not affect sheet 1 wires', async ({ page, canvasHelpers }) => {
    // === Sheet 1: place two buttons and wire them ===
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // === Sheet 2: add sheet, place two buttons at different positions, wire them ===
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await page.waitForTimeout(300);
    await canvasHelpers.placeSymbol(page, 'button', 400, 400);
    await page.waitForTimeout(300);

    await canvasHelpers.createWire(page, 420, 260, 420, 400);
    await page.waitForTimeout(300);

    let state = await canvasHelpers.getState(page);
    expect(state.circuit.connections.length).toBe(2);

    // Select the wire on sheet 2
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 420, 330);
    await page.waitForTimeout(200);

    // Delete it
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Should have 1 connection remaining (the sheet 1 wire)
    state = await canvasHelpers.getState(page);
    expect(state.circuit.connections.length).toBe(1);

    // Switch to sheet 1 and verify its wire is intact
    const tabs = page.locator('.sheet-tab:not(.add-tab)');
    await tabs.first().click();
    await page.waitForTimeout(300);

    state = await canvasHelpers.getState(page);
    expect(state.sheetConnections).toHaveLength(1);
    expect(state.sheetConnections[0].fromDevice).toBe('S1');
    expect(state.sheetConnections[0].toDevice).toBe('S2');
  });

  test('wire operations on multi-sheet use correct global index', async ({ page, canvasHelpers }) => {
    // Place two buttons on sheet 1 and wire them
    await canvasHelpers.placeSymbol(page, 'button', 200, 200);
    await canvasHelpers.waitForDeviceCount(page, 1);
    await canvasHelpers.placeSymbol(page, 'button', 200, 400);
    await canvasHelpers.waitForDeviceCount(page, 2);

    await canvasHelpers.createWire(page, 220, 260, 220, 400);
    await canvasHelpers.waitForConnectionCount(page, 1);

    // Add sheet 2 with a wire at different positions
    await page.click('.add-tab');
    await page.waitForTimeout(300);

    await canvasHelpers.placeSymbol(page, 'button', 400, 200);
    await page.waitForTimeout(300);
    await canvasHelpers.placeSymbol(page, 'button', 400, 400);
    await page.waitForTimeout(300);
    await canvasHelpers.createWire(page, 420, 260, 420, 400);
    await page.waitForTimeout(300);

    // Select the wire on sheet 2
    await canvasHelpers.selectMode(page);
    await canvasHelpers.clickCanvas(page, 420, 330);
    await page.waitForTimeout(200);

    let state = await canvasHelpers.getState(page);
    expect(state.selectedWireIndex).toBe(0); // filtered index 0

    // The sheetConnections._globalIndex should be 1 (second connection globally)
    const sheetConn = state.sheetConnections[0];
    expect(sheetConn._globalIndex).toBe(1);

    // Verify the global connection at that index matches
    const globalConn = state.circuit.connections[sheetConn._globalIndex];
    expect(globalConn.fromDevice).toBe(sheetConn.fromDevice);
    expect(globalConn.toDevice).toBe(sheetConn.toDevice);
    expect(globalConn.fromPin).toBe(sheetConn.fromPin);
    expect(globalConn.toPin).toBe(sheetConn.toPin);
  });
});

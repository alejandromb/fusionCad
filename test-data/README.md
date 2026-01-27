# Test Data - Golden Circuits

This directory contains reference circuits used for:
- End-to-end testing
- Regression testing
- Development validation

## Golden Circuit 1: Three-Wire Motor Starter

**File**: `golden-circuit-motor-starter.json`

**Description**: Classic 3-wire control circuit for motor starter with E-stop functionality.

**Components**:
- K1: Motor contactor (24VDC coil)
- S1: Start button (NO)
- S2: Stop button (NC)
- F1: Overload relay
- M1: Motor (3-phase)
- X1: Terminal strip (8 terminals)
- Power: 24VDC supply

**Tests**:
- BOM generation (7 devices, grouped by part)
- Wire list generation (~10 connections)
- Validation rules (no errors expected)

**Created**: Phase 1

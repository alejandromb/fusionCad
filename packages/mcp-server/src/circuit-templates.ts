/**
 * Circuit Templates — common circuit patterns as composable functions.
 *
 * Each template uses the low-level circuit-helpers to place devices,
 * define rungs, create wires, and auto-layout. They return the mutated
 * circuitData so the MCP tool can save it in one shot.
 *
 * Pin conventions for IEC symbols (from builtin-symbols.json):
 * - Contacts (NO/NC): pin "1" (top/input) → pin "2" (bottom/output)
 * - Coils: pin "1" (A1/top) → pin "2" (A2/bottom)
 * - OL relay: pin "1" (top) → pin "2" (bottom)
 * - Pilot light: pin "1" (top) → pin "2" (bottom)
 * - Timers: pin "1" (A1/top) → pin "2" (A2/bottom)
 * - 3P power devices (CB, contactor, OL): L1/T1, L2/T2, L3/T3
 * - Motor 3-phase: pins "1"(U1), "2"(V1), "3"(W1)
 *
 * In ladder diagrams, current flows left→right through each rung.
 * Pin "1" is the input side (connected toward L1), pin "2" is output (toward L2).
 * Devices are wired in series: device[n].pin "2" → device[n+1].pin "1".
 */

import type { CircuitData } from './api-client.js';
import type { MotorStarterResult } from '@fusion-cad/core-model';
import {
  placeDevice,
  placeLinkedDevice,
  createWire,
  setSheetType,
  addSheet,
  addRung,
  addAnnotation,
  autoLayoutLadder,
  createLadderRails,
  assignPart,
  createLadderBlock,
} from './circuit-helpers.js';

/**
 * Generate a complete 3-wire motor starter with power + control sections.
 *
 * Creates two sheets:
 *   Sheet 1 "Power" (schematic): CB1 → K1 → F1 → M1 with 9 phase wires
 *   Sheet 2 "Control" (ladder):  3 rungs with linked K1/F1 devices
 *
 * See docs/circuit-specs/motor-starter-3wire.md for full spec.
 */
export function generateMotorStarter(
  circuit: CircuitData,
  controlVoltage: '24VDC' | '120VAC',
  _motorTag: string,
  motorData?: MotorStarterResult,
): { circuit: CircuitData; summary: string; powerSheetId: string; controlSheetId: string } {
  let cd = circuit;

  // ================================================================
  //  Create sheets
  // ================================================================
  const powerSheet = addSheet(cd, 'Power');
  cd = powerSheet.circuit;
  const powerSheetId = powerSheet.sheetId;

  const controlSheet = addSheet(cd, 'Control');
  cd = controlSheet.circuit;
  const controlSheetId = controlSheet.sheetId;

  // Set power sheet type (schematic — no block needed)
  cd = setSheetType(cd, powerSheetId, 'schematic');

  // Create ladder block on control sheet (replaces setSheetType for ladder)
  const ladderBlock = createLadderBlock(cd, controlSheetId, {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
  }, undefined, 'Motor Control');
  cd = ladderBlock.circuit;
  const controlBlockId = ladderBlock.blockId;

  // ================================================================
  //  SHEET 1 — Power Section (schematic, top-to-bottom)
  // ================================================================

  // Place 3-phase power devices vertically
  const cb1 = placeDevice(cd, 'iec-circuit-breaker-3p', 100, 60, powerSheetId, 'CB1');
  cd = cb1.circuit;

  const k1power = placeDevice(cd, 'iec-contactor-3p', 100, 180, powerSheetId, 'K1');
  cd = k1power.circuit;

  const f1power = placeDevice(cd, 'iec-thermal-overload-relay-3p', 100, 300, powerSheetId, 'F1');
  cd = f1power.circuit;

  const m1 = placeDevice(cd, 'iec-motor-3ph', 100, 420, powerSheetId, 'M1');
  cd = m1.circuit;

  // Wire 9 phase connections (3 phases × 3 hops)
  // Phase L1
  cd = createWire(cd, 'CB1', 'T1', 'K1', 'L1', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T1', 'F1', 'L1', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T1', 'M1', '1', f1power.deviceId, m1.deviceId);
  // Phase L2
  cd = createWire(cd, 'CB1', 'T2', 'K1', 'L2', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T2', 'F1', 'L2', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T2', 'M1', '2', f1power.deviceId, m1.deviceId);
  // Phase L3
  cd = createWire(cd, 'CB1', 'T3', 'K1', 'L3', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T3', 'F1', 'L3', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T3', 'M1', '3', f1power.deviceId, m1.deviceId);

  // ================================================================
  //  SHEET 2 — Control Section (ladder diagram)
  // ================================================================

  // OL aux NC contact — linked to F1 overload relay on power sheet
  const ol = placeLinkedDevice(cd, 'F1', 'iec-normally-closed-contact', 0, 0, controlSheetId);
  cd = ol.circuit;

  // Stop pushbutton (NC)
  const stop = placeDevice(cd, 'iec-normally-closed-contact', 0, 0, controlSheetId, 'S2');
  cd = stop.circuit;

  // Start pushbutton (NO)
  const start = placeDevice(cd, 'iec-normally-open-contact', 0, 0, controlSheetId, 'S1');
  cd = start.circuit;

  // Junction node (T-branch point between S1 and K1)
  const junction = placeDevice(cd, 'junction', 0, 0, controlSheetId, 'J1');
  cd = junction.circuit;

  // Contactor coil — linked to K1 contactor on power sheet
  const coil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, controlSheetId);
  cd = coil.circuit;

  // Seal-in contact (K1 NO — linked to K1)
  const sealin = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, controlSheetId);
  cd = sealin.circuit;

  // OL aux (rung 2 — linked to F1)
  const ol2 = placeLinkedDevice(cd, 'F1', 'iec-normally-closed-contact', 0, 0, controlSheetId);
  cd = ol2.circuit;

  // K1 aux NO contact for pilot light (linked to K1)
  const k1aux = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, controlSheetId);
  cd = k1aux.circuit;

  // Pilot light
  const pilot = placeDevice(cd, 'iec-pilot-light', 0, 0, controlSheetId, 'PL1');
  cd = pilot.circuit;

  // Define rungs
  // Rung 1: F1(OL) → Stop → Start → J1 (junction) → K1 coil
  // Use addRung for rung 1 (it resolves tags to device IDs by sheet)
  // But F1 and K1 have multiple devices — addRung finds by sheet, so control sheet devices match.
  // We need to build rung 1 manually with explicit device IDs.
  const rung1Ids = [ol.deviceId, stop.deviceId, start.deviceId, junction.deviceId, coil.deviceId];
  const rung1Rung = {
    id: require_generateId(),
    type: 'rung' as const,
    number: 1,
    sheetId: controlSheetId,
    blockId: controlBlockId,
    deviceIds: rung1Ids,
    description: 'Motor starter control',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung1Rung] };

  // Rung 2: OL2 → K1 seal-in (branch of rung 1)
  const rung2Ids = [ol2.deviceId, sealin.deviceId];
  const rung2Rung = {
    id: require_generateId(),
    type: 'rung' as const,
    number: 2,
    sheetId: controlSheetId,
    blockId: controlBlockId,
    deviceIds: rung2Ids,
    description: 'Seal-in circuit',
    branchOf: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung2Rung] };

  // Rung 3: K1 aux → PL1
  const rung3Ids = [k1aux.deviceId, pilot.deviceId];
  const rung3Rung = {
    id: require_generateId(),
    type: 'rung' as const,
    number: 3,
    sheetId: controlSheetId,
    blockId: controlBlockId,
    deviceIds: rung3Ids,
    description: 'Running indicator',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung3Rung] };

  // Auto-layout control sheet using block
  const layout = autoLayoutLadder(cd, controlSheetId, controlBlockId);
  cd = layout.circuit;

  // Wire rung 1: F1.2→S2.1, S2.2→S1.1, S1.2→J1.1, J1.1→K1.1
  cd = createWire(cd, 'F1', '2', 'S2', '1', ol.deviceId, stop.deviceId);
  cd = createWire(cd, 'S2', '2', 'S1', '1', stop.deviceId, start.deviceId);
  cd = createWire(cd, 'S1', '2', 'J1', '1', start.deviceId, junction.deviceId);
  cd = createWire(cd, 'J1', '1', 'K1', '1', junction.deviceId, coil.deviceId);

  // Wire rung 2: OL2.2→K1-sealin.1, K1-sealin.2→J1.1
  cd = createWire(cd, 'F1', '2', 'K1', '1', ol2.deviceId, sealin.deviceId);
  cd = createWire(cd, 'K1', '2', 'J1', '1', sealin.deviceId, junction.deviceId);

  // Wire rung 3: K1aux.2→PL1.1
  cd = createWire(cd, 'K1', '2', 'PL1', '1', k1aux.deviceId, pilot.deviceId);

  // Create L1/L2 rail junctions and wires
  cd = createLadderRails(cd, controlSheetId, controlBlockId);

  // ================================================================
  //  Assign real parts (if motor data provided)
  // ================================================================
  const partLines: string[] = [];
  if (motorData) {
    const { components } = motorData;
    // Circuit breaker
    cd = assignPart(cd, 'CB1', components.circuitBreaker.manufacturer,
      components.circuitBreaker.partNumber, components.circuitBreaker.description,
      components.circuitBreaker.category);
    partLines.push(`    CB1: ${components.circuitBreaker.partNumber} (${components.circuitBreaker.description})`);

    // Contactor
    cd = assignPart(cd, 'K1', components.contactor.manufacturer,
      components.contactor.partNumber, components.contactor.description,
      components.contactor.category);
    partLines.push(`    K1:  ${components.contactor.partNumber} (${components.contactor.description})`);

    // Overload relay
    cd = assignPart(cd, 'F1', components.overloadRelay.manufacturer,
      components.overloadRelay.partNumber, components.overloadRelay.description,
      components.overloadRelay.category);
    partLines.push(`    F1:  ${components.overloadRelay.partNumber} (${components.overloadRelay.description})`);

    // Motor (generic description)
    cd = assignPart(cd, 'M1', 'Generic',
      `MOTOR-${motorData.spec.hp}HP-${motorData.spec.voltage}`,
      `${motorData.spec.hp} HP ${motorData.spec.voltage} ${motorData.spec.phase === 'three' ? '3-Phase' : '1-Phase'} Motor`,
      'motor');
    partLines.push(`    M1:  ${motorData.spec.hp} HP ${motorData.spec.voltage} Motor`);
  }

  const summary = [
    'Complete 3-wire motor starter generated (2 sheets):',
    '',
    '  Sheet 1 "Power" (schematic):',
    '    CB1(Circuit Breaker 3P) → K1(Contactor 3P) → F1(Overload 3P) → M1(Motor 3Ph)',
    '    9 phase wires (3 phases × 3 hops)',
    '',
    `  Sheet 2 "Control" (ladder, ${controlVoltage}):`,
    '    Rung 1: F1(OL NC) → S2(Stop NC) → S1(Start NO) → J1(Junction) → K1(Coil)',
    '    Rung 2: F1(OL NC) → K1(Seal-in NO) → J1(Junction) [branch]',
    '    Rung 3: K1(Aux NO) → PL1(Running Light)',
    '    7 rung wires + 8 rail wires',
    '',
    '  Linked devices: K1 (power ↔ coil + seal-in + aux), F1 (power ↔ OL contacts)',
    '  Totals: 18 devices (4 power + 9 control + 5 rail), 24 wires',
    ...(motorData ? [
      '',
      `  Motor: ${motorData.spec.hp} HP @ ${motorData.spec.voltage}, FLA: ${motorData.motorFLA}A, Wire: ${motorData.wireSize} AWG`,
      '  Assigned parts (Schneider Electric):',
      ...partLines,
    ] : []),
  ].join('\n');

  return { circuit: cd, summary, powerSheetId, controlSheetId };
}

/**
 * Add a standard control rung to an existing ladder diagram.
 */
export function addControlRung(
  circuit: CircuitData,
  sheetId: string,
  rungType: 'indicator' | 'timer-on-delay' | 'timer-off-delay',
  rungNumber: number,
  config?: { tag?: string; contactTag?: string; description?: string },
): { circuit: CircuitData; deviceTags: string[] } {
  let cd = circuit;
  const deviceTags: string[] = [];

  switch (rungType) {
    case 'indicator': {
      // Contact (NO) → Pilot Light
      const contactSymbol = 'iec-normally-open-contact';
      const contactTag = config?.contactTag;

      let contactDeviceId: string;
      if (contactTag) {
        // Link to existing device (e.g., K1 aux contact)
        const linked = placeLinkedDevice(cd, contactTag, contactSymbol, 0, 0, sheetId);
        cd = linked.circuit;
        contactDeviceId = linked.deviceId;
        deviceTags.push(contactTag);
      } else {
        const contact = placeDevice(cd, contactSymbol, 0, 0, sheetId);
        cd = contact.circuit;
        contactDeviceId = contact.deviceId;
        deviceTags.push(contact.tag);
      }

      const pilotTag = config?.tag || undefined;
      const pilot = placeDevice(cd, 'iec-pilot-light', 0, 0, sheetId, pilotTag);
      cd = pilot.circuit;
      deviceTags.push(pilot.tag);

      // Build rung with device IDs
      const rungObj = {
        id: require_generateId(),
        type: 'rung' as const,
        number: rungNumber,
        sheetId,
        deviceIds: [contactDeviceId, pilot.deviceId],
        description: config?.description || 'Indicator',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      cd = { ...cd, rungs: [...(cd.rungs || []), rungObj] };

      // Wire
      cd = createWire(cd, deviceTags[0], '2', pilot.tag, '1', contactDeviceId, pilot.deviceId);
      break;
    }

    case 'timer-on-delay':
    case 'timer-off-delay': {
      const timerSymbol = rungType === 'timer-on-delay' ? 'iec-on-delay-timer' : 'iec-off-delay-timer';
      const contactTag = config?.contactTag;

      let contactDeviceId: string;
      if (contactTag) {
        const linked = placeLinkedDevice(cd, contactTag, 'iec-normally-open-contact', 0, 0, sheetId);
        cd = linked.circuit;
        contactDeviceId = linked.deviceId;
        deviceTags.push(contactTag);
      } else {
        const contact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId);
        cd = contact.circuit;
        contactDeviceId = contact.deviceId;
        deviceTags.push(contact.tag);
      }

      const timerTag = config?.tag || undefined;
      const timer = placeDevice(cd, timerSymbol, 0, 0, sheetId, timerTag);
      cd = timer.circuit;
      deviceTags.push(timer.tag);

      // Build rung
      const rungObj = {
        id: require_generateId(),
        type: 'rung' as const,
        number: rungNumber,
        sheetId,
        deviceIds: [contactDeviceId, timer.deviceId],
        description: config?.description || `${rungType === 'timer-on-delay' ? 'On-delay' : 'Off-delay'} timer`,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      cd = { ...cd, rungs: [...(cd.rungs || []), rungObj] };

      // Wire
      cd = createWire(cd, deviceTags[0], '2', timer.tag, '1', contactDeviceId, timer.deviceId);
      break;
    }
  }

  // Auto-layout after adding rung
  const layout = autoLayoutLadder(cd, sheetId);
  cd = layout.circuit;

  return { circuit: cd, deviceTags };
}

/**
 * Generate a motor starter panel with configurable options.
 *
 * Creates a single sheet with power on top and a control ladder block below.
 * Supports optional HOA switch, pilot light, PLC remote contact, and E-stop.
 *
 * Power section (top of sheet, schematic):
 *   CB1 → K1(3P) → F1(OL) → M1(Motor)
 *
 * Control ladder (bottom of sheet):
 *   Rung 1: F1(OL NC) → E-STOP(NC) → S2(Stop NC) → S1(Start NO) → J1 → K1(Coil)
 *   Rung 2: K1(Seal-in NO) → J1 [branch of rung 1]
 *   Rung 3 (if HOA): HOA-H(Selector) → K1(Coil) — manual override
 *   Rung 4 (if HOA+PLC): HOA-A(Selector) → PLC(NO contact) → K1(Coil) — auto mode
 *   Last rung (if pilotLight): K1(Aux NO) → PL1(Pilot Light)
 *
 * If panelLayout is true, creates Sheet 2 with enclosure and component footprints.
 */
export function generateMotorStarterPanel(
  circuit: CircuitData,
  options: {
    hp: string;
    voltage: string;
    phase?: 'single' | 'three';
    controlVoltage?: '24VDC' | '120VAC';
    country?: 'USA' | 'Canada';
    starterType?: string;
    hoaSwitch?: boolean;
    pilotLight?: boolean;
    plcRemote?: boolean;
    eStop?: boolean;
    panelLayout?: boolean;
  },
  motorData?: MotorStarterResult,
): { circuit: CircuitData; summary: string } {
  let cd = circuit;
  const controlVoltage = options.controlVoltage || '120VAC';
  const hasEStop = options.eStop !== false; // default true
  const hasHOA = options.hoaSwitch || false;
  const hasPLC = options.plcRemote || false;
  const hasPilot = options.pilotLight !== false; // default true

  // ================================================================
  //  Create sheet (single sheet: power on top, control below)
  // ================================================================
  const mainSheet = addSheet(cd, 'Motor Starter');
  cd = mainSheet.circuit;
  const sheetId = mainSheet.sheetId;
  cd = setSheetType(cd, sheetId, 'schematic');

  // ================================================================
  //  Power Section (top of sheet, y=60..420)
  // ================================================================
  const cb1 = placeDevice(cd, 'iec-circuit-breaker-3p', 100, 60, sheetId, 'CB1');
  cd = cb1.circuit;

  const k1power = placeDevice(cd, 'iec-contactor-3p', 100, 180, sheetId, 'K1');
  cd = k1power.circuit;

  const f1power = placeDevice(cd, 'iec-thermal-overload-relay-3p', 100, 300, sheetId, 'F1');
  cd = f1power.circuit;

  const m1 = placeDevice(cd, 'iec-motor-3ph', 100, 420, sheetId, 'M1');
  cd = m1.circuit;

  // Wire 9 phase connections (3 phases × 3 hops)
  cd = createWire(cd, 'CB1', 'T1', 'K1', 'L1', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T1', 'F1', 'L1', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T1', 'M1', '1', f1power.deviceId, m1.deviceId);
  cd = createWire(cd, 'CB1', 'T2', 'K1', 'L2', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T2', 'F1', 'L2', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T2', 'M1', '2', f1power.deviceId, m1.deviceId);
  cd = createWire(cd, 'CB1', 'T3', 'K1', 'L3', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T3', 'F1', 'L3', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T3', 'M1', '3', f1power.deviceId, m1.deviceId);

  // ================================================================
  //  Control Section (ladder block below power, starting at y=560)
  // ================================================================
  const ladderBlock = createLadderBlock(cd, sheetId, {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
    firstRungY: 100,
    rungSpacing: 120,
  }, { x: 0, y: 560 }, 'Motor Control');
  cd = ladderBlock.circuit;
  const controlBlockId = ladderBlock.blockId;

  // -- Rung 1: OL → (E-Stop) → Stop → Start → Junction → K1 Coil --
  let rungNumber = 1;
  const rung1DeviceIds: string[] = [];

  // OL aux NC contact (linked to F1)
  const ol = placeLinkedDevice(cd, 'F1', 'iec-normally-closed-contact', 0, 0, sheetId);
  cd = ol.circuit;
  rung1DeviceIds.push(ol.deviceId);

  // E-Stop (NC)
  let eStopDeviceId: string | undefined;
  if (hasEStop) {
    const estop = placeDevice(cd, 'iec-emergency-stop', 0, 0, sheetId, 'ES1');
    cd = estop.circuit;
    eStopDeviceId = estop.deviceId;
    rung1DeviceIds.push(estop.deviceId);
  }

  // Stop pushbutton (NC)
  const stop = placeDevice(cd, 'iec-normally-closed-contact', 0, 0, sheetId, 'S2');
  cd = stop.circuit;
  rung1DeviceIds.push(stop.deviceId);

  // Start pushbutton (NO)
  const start = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'S1');
  cd = start.circuit;
  rung1DeviceIds.push(start.deviceId);

  // Junction (T-branch point)
  const junction = placeDevice(cd, 'junction', 0, 0, sheetId, 'J1');
  cd = junction.circuit;
  rung1DeviceIds.push(junction.deviceId);

  // K1 coil (linked to K1 contactor)
  const coil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
  cd = coil.circuit;
  rung1DeviceIds.push(coil.deviceId);

  const rung1 = {
    id: require_generateId(),
    type: 'rung' as const,
    number: rungNumber,
    sheetId,
    blockId: controlBlockId,
    deviceIds: rung1DeviceIds,
    description: 'Motor starter control',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung1] };

  // -- Rung 2: Seal-in (branch of rung 1) --
  rungNumber++;
  const sealin = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
  cd = sealin.circuit;

  const rung2 = {
    id: require_generateId(),
    type: 'rung' as const,
    number: rungNumber,
    sheetId,
    blockId: controlBlockId,
    deviceIds: [sealin.deviceId],
    description: 'Seal-in circuit',
    branchOf: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung2] };

  // -- Rung 3 (if HOA): HOA-Hand → K1 Coil (manual override) --
  let hoaHandDeviceId: string | undefined;
  let hoaHandCoilId: string | undefined;
  if (hasHOA) {
    rungNumber++;
    const hoaHand = placeDevice(cd, 'iec-selector-switch', 0, 0, sheetId, 'HOA-H');
    cd = hoaHand.circuit;
    hoaHandDeviceId = hoaHand.deviceId;

    const hoaCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = hoaCoil.circuit;
    hoaHandCoilId = hoaCoil.deviceId;

    const rungHOA = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [hoaHand.deviceId, hoaCoil.deviceId],
      description: 'HOA - Hand (manual override)',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rungHOA] };
  }

  // -- Rung 4 (if HOA+PLC): HOA-Auto → PLC contact → K1 Coil --
  let hoaAutoDeviceId: string | undefined;
  let plcDeviceId: string | undefined;
  let plcCoilId: string | undefined;
  if (hasHOA && hasPLC) {
    rungNumber++;
    const hoaAuto = placeDevice(cd, 'iec-selector-switch', 0, 0, sheetId, 'HOA-A');
    cd = hoaAuto.circuit;
    hoaAutoDeviceId = hoaAuto.deviceId;

    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;

    const plcAutoCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcAutoCoil.circuit;
    plcCoilId = plcAutoCoil.deviceId;

    const rungAuto = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [hoaAuto.deviceId, plcContact.deviceId, plcAutoCoil.deviceId],
      description: 'HOA - Auto (PLC remote)',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rungAuto] };
  } else if (hasPLC && !hasHOA) {
    // PLC contact without HOA — add standalone PLC rung
    rungNumber++;
    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;

    const plcCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcCoil.circuit;
    plcCoilId = plcCoil.deviceId;

    const rungPLC = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [plcContact.deviceId, plcCoil.deviceId],
      description: 'PLC remote start',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rungPLC] };
  }

  // -- Pilot light rung: K1(Aux NO) → PL1 --
  let pilotDeviceId: string | undefined;
  let k1AuxDeviceId: string | undefined;
  if (hasPilot) {
    rungNumber++;
    const k1aux = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
    cd = k1aux.circuit;
    k1AuxDeviceId = k1aux.deviceId;

    const pilot = placeDevice(cd, 'iec-pilot-light', 0, 0, sheetId, 'PL1');
    cd = pilot.circuit;
    pilotDeviceId = pilot.deviceId;

    const rungPilot = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [k1aux.deviceId, pilot.deviceId],
      description: 'Running indicator',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rungPilot] };
  }

  // Auto-layout control section
  const layout = autoLayoutLadder(cd, sheetId, controlBlockId);
  cd = layout.circuit;

  // ================================================================
  //  Wire control rungs
  // ================================================================

  // Rung 1: chain devices — each device's pin "2" → next device's pin "1"
  for (let i = 0; i < rung1DeviceIds.length - 1; i++) {
    const fromId = rung1DeviceIds[i];
    const toId = rung1DeviceIds[i + 1];
    const fromDev = cd.devices.find(d => d.id === fromId)!;
    const toDev = cd.devices.find(d => d.id === toId)!;
    // Junction uses pin "1" for both connections
    const fromPin = fromDev.tag.startsWith('J') ? '1' : '2';
    const toPin = toDev.tag.startsWith('J') ? '1' : '1';
    cd = createWire(cd, fromDev.tag, fromPin, toDev.tag, toPin, fromId, toId);
  }

  // Rung 2: Seal-in → Junction
  cd = createWire(cd, 'K1', '2', 'J1', '1', sealin.deviceId, junction.deviceId);

  // Rung 3 (HOA Hand): wire HOA-H.2 → K1 coil.1
  if (hasHOA && hoaHandDeviceId && hoaHandCoilId) {
    cd = createWire(cd, 'HOA-H', '2', 'K1', '1', hoaHandDeviceId, hoaHandCoilId);
  }

  // Rung 4 (HOA Auto + PLC): HOA-A.2 → PLC1.1, PLC1.2 → K1 coil.1
  if (hasHOA && hasPLC && hoaAutoDeviceId && plcDeviceId && plcCoilId) {
    cd = createWire(cd, 'HOA-A', '2', 'PLC1', '1', hoaAutoDeviceId, plcDeviceId);
    cd = createWire(cd, 'PLC1', '2', 'K1', '1', plcDeviceId, plcCoilId);
  } else if (hasPLC && !hasHOA && plcDeviceId && plcCoilId) {
    cd = createWire(cd, 'PLC1', '2', 'K1', '1', plcDeviceId, plcCoilId);
  }

  // Pilot light rung: K1 aux.2 → PL1.1
  if (hasPilot && k1AuxDeviceId && pilotDeviceId) {
    cd = createWire(cd, 'K1', '2', 'PL1', '1', k1AuxDeviceId, pilotDeviceId);
  }

  // Create L1/L2 rail junctions and wires
  cd = createLadderRails(cd, sheetId, controlBlockId);

  // ================================================================
  //  Assign real parts (if motor data provided)
  // ================================================================
  if (motorData) {
    const { components } = motorData;
    cd = assignPart(cd, 'CB1', components.circuitBreaker.manufacturer,
      components.circuitBreaker.partNumber, components.circuitBreaker.description,
      components.circuitBreaker.category);
    cd = assignPart(cd, 'K1', components.contactor.manufacturer,
      components.contactor.partNumber, components.contactor.description,
      components.contactor.category);
    cd = assignPart(cd, 'F1', components.overloadRelay.manufacturer,
      components.overloadRelay.partNumber, components.overloadRelay.description,
      components.overloadRelay.category);
    cd = assignPart(cd, 'M1', 'Generic',
      `MOTOR-${motorData.spec.hp}HP-${motorData.spec.voltage}`,
      `${motorData.spec.hp} HP ${motorData.spec.voltage} ${motorData.spec.phase === 'three' ? '3-Phase' : '1-Phase'} Motor`,
      'motor');
  }

  // ================================================================
  //  Panel layout sheet (if requested)
  // ================================================================
  if (options.panelLayout) {
    cd = addPanelLayoutSheet(cd, options, motorData);
  }

  // ================================================================
  //  Summary
  // ================================================================
  const rungDescriptions: string[] = [];
  rungDescriptions.push('Rung 1: F1(OL NC)' +
    (hasEStop ? ' → ES1(E-Stop NC)' : '') +
    ' → S2(Stop NC) → S1(Start NO) → J1 → K1(Coil)');
  rungDescriptions.push('Rung 2: K1(Seal-in NO) → J1 [branch]');
  if (hasHOA) rungDescriptions.push(`Rung 3: HOA-H(Hand) → K1(Coil)`);
  if (hasHOA && hasPLC) rungDescriptions.push(`Rung 4: HOA-A(Auto) → PLC1 → K1(Coil)`);
  else if (hasPLC) rungDescriptions.push(`Rung ${hasHOA ? 4 : 3}: PLC1 → K1(Coil)`);
  if (hasPilot) rungDescriptions.push(`Rung ${rungNumber}: K1(Aux NO) → PL1(Running Light)`);

  const summary = [
    `Motor starter panel generated (${options.hp} HP @ ${options.voltage}):`,
    '',
    '  Power: CB1 → K1(Contactor 3P) → F1(Overload 3P) → M1(Motor)',
    `  Control (${controlVoltage}):`,
    ...rungDescriptions.map(r => `    ${r}`),
    `  Options: E-Stop=${hasEStop}, HOA=${hasHOA}, PLC=${hasPLC}, Pilot=${hasPilot}`,
    `  Devices: ${cd.devices.length}, Wires: ${cd.connections.length}`,
    ...(motorData ? [`  Parts: Schneider Electric (${motorData.motorFLA}A FLA, ${motorData.wireSize} AWG)`] : []),
    ...(options.panelLayout ? ['  Panel layout: Sheet 2'] : []),
  ].join('\n');

  return { circuit: cd, summary };
}

/**
 * Add a panel layout sheet with enclosure, DIN rails, and component footprints.
 */
function addPanelLayoutSheet(
  circuit: CircuitData,
  options: { hp: string; voltage: string },
  _motorData?: MotorStarterResult,
): CircuitData {
  let cd = circuit;

  const sheet = addSheet(cd, 'Panel Layout');
  cd = sheet.circuit;
  const layoutSheetId = sheet.sheetId;

  // Choose enclosure size based on HP
  const hp = parseFloat(options.hp) || 5;
  let enclosureSymbol = 'panel-enclosure-20x16';
  let subpanelSymbol = 'panel-subpanel-20x16';
  if (hp > 10) {
    enclosureSymbol = 'panel-enclosure-24x20';
    subpanelSymbol = 'panel-subpanel-24x20';
  }
  if (hp > 30) {
    enclosureSymbol = 'panel-enclosure-30x24';
    subpanelSymbol = 'panel-subpanel-30x24';
  }

  // Place enclosure
  const encl = placeDevice(cd, enclosureSymbol, 60, 60, layoutSheetId, 'PNL1');
  cd = encl.circuit;

  // Place subpanel inside enclosure
  const sub = placeDevice(cd, subpanelSymbol, 70, 70, layoutSheetId, 'SP1');
  cd = sub.circuit;

  // Place component footprints on DIN rails using annotations
  const annotations = [
    { x: 100, y: 135, text: 'CB1' },
    { x: 180, y: 135, text: 'K1' },
    { x: 280, y: 135, text: 'F1' },
    { x: 100, y: 225, text: 'Terminal Block' },
  ];
  for (const a of annotations) {
    const ann = addAnnotation(cd, layoutSheetId, a.x, a.y, a.text);
    cd = ann.circuit;
  }

  return cd;
}

// Import generateId — need to use the same ID generator
import { generateId } from '@fusion-cad/core-model';
function require_generateId(): string {
  return generateId();
}

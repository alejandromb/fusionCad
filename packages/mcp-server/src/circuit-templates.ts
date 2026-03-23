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
import { alignDeviceToPin, getPinWorldY } from '@fusion-cad/core-model';
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
  //  Pin-based alignment: each device's input pin aligns with the
  //  previous device's output pin. No hardcoded Y offsets.
  // ================================================================
  const POWER_X = 100;       // center column X
  const POWER_START_Y = 40;  // starting Y for supply terminals
  const POWER_GAP = 20;      // vertical gap between output pin and next input pin

  // Supply terminals (strip X1) — panel boundary for incoming cables
  const x1_1 = placeDevice(cd, 'iec-terminal-single', POWER_X - 40, POWER_START_Y, powerSheetId, 'X1:1');
  cd = x1_1.circuit;
  const x1_2 = placeDevice(cd, 'iec-terminal-single', POWER_X, POWER_START_Y, powerSheetId, 'X1:2');
  cd = x1_2.circuit;
  const x1_3 = placeDevice(cd, 'iec-terminal-single', POWER_X + 40, POWER_START_Y, powerSheetId, 'X1:3');
  cd = x1_3.circuit;

  // Chain devices pin-to-pin: X1 pin1 → CB1 L1, CB1 T1 → K1 L1, etc.
  const x1Pin2Y = getPinWorldY('iec-terminal-single', '1', POWER_START_Y);
  const cb1Y = alignDeviceToPin('iec-circuit-breaker-3p', 'L1', x1Pin2Y + POWER_GAP);
  const cb1 = placeDevice(cd, 'iec-circuit-breaker-3p', POWER_X, cb1Y, powerSheetId, 'CB1');
  cd = cb1.circuit;

  const cb1T1Y = getPinWorldY('iec-circuit-breaker-3p', 'T1', cb1Y);
  const k1Y = alignDeviceToPin('iec-contactor-3p', 'L1', cb1T1Y + POWER_GAP);
  const k1power = placeDevice(cd, 'iec-contactor-3p', POWER_X, k1Y, powerSheetId, 'K1');
  cd = k1power.circuit;

  const k1T1Y = getPinWorldY('iec-contactor-3p', 'T1', k1Y);
  const f1Y = alignDeviceToPin('iec-thermal-overload-relay-3p', 'L1', k1T1Y + POWER_GAP);
  const f1power = placeDevice(cd, 'iec-thermal-overload-relay-3p', POWER_X, f1Y, powerSheetId, 'F1');
  cd = f1power.circuit;

  // Motor output terminals (strip X2) — panel boundary for motor leads
  const f1T1Y = getPinWorldY('iec-thermal-overload-relay-3p', 'T1', f1Y);
  const x2Y = alignDeviceToPin('iec-terminal-single', '1', f1T1Y + POWER_GAP);
  const x2_1 = placeDevice(cd, 'iec-terminal-single', POWER_X - 40, x2Y, powerSheetId, 'X2:1');
  cd = x2_1.circuit;
  const x2_2 = placeDevice(cd, 'iec-terminal-single', POWER_X, x2Y, powerSheetId, 'X2:2');
  cd = x2_2.circuit;
  const x2_3 = placeDevice(cd, 'iec-terminal-single', POWER_X + 40, x2Y, powerSheetId, 'X2:3');
  cd = x2_3.circuit;

  const x2Pin1Y = getPinWorldY('iec-terminal-single', '1', x2Y);
  const m1Y = alignDeviceToPin('iec-motor-3ph', '1', x2Pin1Y + POWER_GAP);
  const m1 = placeDevice(cd, 'iec-motor-3ph', POWER_X, m1Y, powerSheetId, 'M1');
  cd = m1.circuit;

  // Ground terminal (PE) — beside motor
  const pe1 = placeDevice(cd, 'iec-terminal-ground', POWER_X + 100, m1Y, powerSheetId, 'PE1');
  cd = pe1.circuit;

  // Wire 15 phase connections (3 phases × 5 hops through terminals)
  // Phase L1: X1:1 → CB1 → K1 → F1 → X2:1 → M1
  cd = createWire(cd, 'X1:1', '1', 'CB1', 'L1', x1_1.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T1', 'K1', 'L1', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T1', 'F1', 'L1', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T1', 'X2:1', '1', f1power.deviceId, x2_1.deviceId);
  cd = createWire(cd, 'X2:1', '1', 'M1', '1', x2_1.deviceId, m1.deviceId);
  // Phase L2: X1:2 → CB1 → K1 → F1 → X2:2 → M1
  cd = createWire(cd, 'X1:2', '1', 'CB1', 'L2', x1_2.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T2', 'K1', 'L2', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T2', 'F1', 'L2', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T2', 'X2:2', '1', f1power.deviceId, x2_2.deviceId);
  cd = createWire(cd, 'X2:2', '1', 'M1', '2', x2_2.deviceId, m1.deviceId);
  // Phase L3: X1:3 → CB1 → K1 → F1 → X2:3 → M1
  cd = createWire(cd, 'X1:3', '1', 'CB1', 'L3', x1_3.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T3', 'K1', 'L3', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T3', 'F1', 'L3', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T3', 'X2:3', '1', f1power.deviceId, x2_3.deviceId);
  cd = createWire(cd, 'X2:3', '1', 'M1', '3', x2_3.deviceId, m1.deviceId);

  // ================================================================
  //  SHEET 2 — Control Section (ladder diagram)
  // ================================================================

  // Control circuit breaker (1P) — protects control wiring
  const cb2 = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, controlSheetId, 'CB2');
  cd = cb2.circuit;

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
  // Rung 1: CB2 → F1(OL) → Stop → Start → J1 (junction) → K1 coil
  // Use addRung for rung 1 (it resolves tags to device IDs by sheet)
  // But F1 and K1 have multiple devices — addRung finds by sheet, so control sheet devices match.
  // We need to build rung 1 manually with explicit device IDs.
  const rung1Ids = [cb2.deviceId, ol.deviceId, stop.deviceId, start.deviceId, junction.deviceId, coil.deviceId];
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

  // Wire rung 1: CB2.2→F1.1, F1.2→S2.1, S2.2→S1.1, S1.2→J1.1, J1.1→K1.1
  cd = createWire(cd, 'CB2', '2', 'F1', '1', cb2.deviceId, ol.deviceId);
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
    '    X1:1-3(Supply Terminals) → CB1(Breaker 3P) → K1(Contactor 3P) → F1(Overload 3P) → X2:1-3(Motor Terminals) → M1(Motor 3Ph)',
    '    PE1(Ground Terminal)',
    '    15 phase wires (3 phases × 5 hops through terminals)',
    '',
    `  Sheet 2 "Control" (ladder, ${controlVoltage}):`,
    '    Rung 1: CB2(Breaker 1P) → F1(OL NC) → S2(Stop NC) → S1(Start NO) → J1(Junction) → K1(Coil)',
    '    Rung 2: F1(OL NC) → K1(Seal-in NO) → J1(Junction) [branch]',
    '    Rung 3: K1(Aux NO) → PL1(Running Light)',
    '    8 rung wires + 8 rail wires',
    '',
    '  Linked devices: K1 (power ↔ coil + seal-in + aux), F1 (power ↔ OL contacts)',
    '  Totals: 26 devices (11 power + 10 control + 5 rail), 31 wires',
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
 *   Rung 3 (if HOA): SS1(Hand contact) → K1(Coil) — manual override
 *   Rung 4 (if HOA+PLC): SS1(Auto contact) → PLC(NO contact) → K1(Coil) — auto mode
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
  //  Power Section (top of sheet, pin-based alignment)
  // ================================================================
  const POWER_X = 100;
  const POWER_START_Y = 40;
  const POWER_GAP = 20;

  // Supply terminals (strip X1)
  const x1_1 = placeDevice(cd, 'iec-terminal-single', POWER_X - 40, POWER_START_Y, sheetId, 'X1:1');
  cd = x1_1.circuit;
  const x1_2 = placeDevice(cd, 'iec-terminal-single', POWER_X, POWER_START_Y, sheetId, 'X1:2');
  cd = x1_2.circuit;
  const x1_3 = placeDevice(cd, 'iec-terminal-single', POWER_X + 40, POWER_START_Y, sheetId, 'X1:3');
  cd = x1_3.circuit;

  // Chain devices pin-to-pin
  const x1Pin2Y = getPinWorldY('iec-terminal-single', '1', POWER_START_Y);
  const cb1Y = alignDeviceToPin('iec-circuit-breaker-3p', 'L1', x1Pin2Y + POWER_GAP);
  const cb1 = placeDevice(cd, 'iec-circuit-breaker-3p', POWER_X, cb1Y, sheetId, 'CB1');
  cd = cb1.circuit;

  const cb1T1Y = getPinWorldY('iec-circuit-breaker-3p', 'T1', cb1Y);
  const k1Y = alignDeviceToPin('iec-contactor-3p', 'L1', cb1T1Y + POWER_GAP);
  const k1power = placeDevice(cd, 'iec-contactor-3p', POWER_X, k1Y, sheetId, 'K1');
  cd = k1power.circuit;

  const k1T1Y = getPinWorldY('iec-contactor-3p', 'T1', k1Y);
  const f1Y = alignDeviceToPin('iec-thermal-overload-relay-3p', 'L1', k1T1Y + POWER_GAP);
  const f1power = placeDevice(cd, 'iec-thermal-overload-relay-3p', POWER_X, f1Y, sheetId, 'F1');
  cd = f1power.circuit;

  const f1T1Y = getPinWorldY('iec-thermal-overload-relay-3p', 'T1', f1Y);
  const x2Y = alignDeviceToPin('iec-terminal-single', '1', f1T1Y + POWER_GAP);
  const x2_1 = placeDevice(cd, 'iec-terminal-single', POWER_X - 40, x2Y, sheetId, 'X2:1');
  cd = x2_1.circuit;
  const x2_2 = placeDevice(cd, 'iec-terminal-single', POWER_X, x2Y, sheetId, 'X2:2');
  cd = x2_2.circuit;
  const x2_3 = placeDevice(cd, 'iec-terminal-single', POWER_X + 40, x2Y, sheetId, 'X2:3');
  cd = x2_3.circuit;

  const x2Pin1Y = getPinWorldY('iec-terminal-single', '1', x2Y);
  const m1Y = alignDeviceToPin('iec-motor-3ph', '1', x2Pin1Y + POWER_GAP);
  const m1 = placeDevice(cd, 'iec-motor-3ph', POWER_X, m1Y, sheetId, 'M1');
  cd = m1.circuit;

  const pe1 = placeDevice(cd, 'iec-terminal-ground', POWER_X + 100, m1Y, sheetId, 'PE1');
  cd = pe1.circuit;

  // Wire 15 phase connections (3 phases × 5 hops through terminals)
  // Phase L1: X1:1 → CB1 → K1 → F1 → X2:1 → M1
  cd = createWire(cd, 'X1:1', '1', 'CB1', 'L1', x1_1.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T1', 'K1', 'L1', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T1', 'F1', 'L1', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T1', 'X2:1', '1', f1power.deviceId, x2_1.deviceId);
  cd = createWire(cd, 'X2:1', '1', 'M1', '1', x2_1.deviceId, m1.deviceId);
  // Phase L2: X1:2 → CB1 → K1 → F1 → X2:2 → M1
  cd = createWire(cd, 'X1:2', '1', 'CB1', 'L2', x1_2.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T2', 'K1', 'L2', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T2', 'F1', 'L2', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T2', 'X2:2', '1', f1power.deviceId, x2_2.deviceId);
  cd = createWire(cd, 'X2:2', '1', 'M1', '2', x2_2.deviceId, m1.deviceId);
  // Phase L3: X1:3 → CB1 → K1 → F1 → X2:3 → M1
  cd = createWire(cd, 'X1:3', '1', 'CB1', 'L3', x1_3.deviceId, cb1.deviceId);
  cd = createWire(cd, 'CB1', 'T3', 'K1', 'L3', cb1.deviceId, k1power.deviceId);
  cd = createWire(cd, 'K1', 'T3', 'F1', 'L3', k1power.deviceId, f1power.deviceId);
  cd = createWire(cd, 'F1', 'T3', 'X2:3', '1', f1power.deviceId, x2_3.deviceId);
  cd = createWire(cd, 'X2:3', '1', 'M1', '3', x2_3.deviceId, m1.deviceId);

  // ================================================================
  //  Control Section (ladder block below power section)
  // ================================================================
  // Position ladder below last power device with gap
  const motorBottomY = m1Y + 83 + POWER_GAP; // motor height (83) + gap
  const ladderStartY = Math.ceil(motorBottomY / 20) * 20; // snap to grid
  const ladderBlock = createLadderBlock(cd, sheetId, {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
    firstRungY: 100,
    rungSpacing: 120,
  }, { x: 0, y: ladderStartY }, 'Motor Control');
  cd = ladderBlock.circuit;
  const controlBlockId = ladderBlock.blockId;

  // -- Rung 1: CB2 → OL → (E-Stop) → Stop → Start → Junction → K1 Coil --
  let rungNumber = 1;
  const rung1DeviceIds: string[] = [];

  // Control circuit breaker (1P) — protects control wiring
  const cb2 = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, 'CB2');
  cd = cb2.circuit;
  rung1DeviceIds.push(cb2.deviceId);

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

  // -- Rung 3 (if HOA): SS1(Hand) → K1 Coil (manual override) --
  let hoaHandDeviceId: string | undefined;
  let hoaHandCoilId: string | undefined;
  if (hasHOA) {
    rungNumber++;
    const hoaHand = placeDevice(cd, 'iec-selector-switch-3pos', 0, 0, sheetId, 'SS1');
    cd = hoaHand.circuit;
    cd = updateDeviceFunction(cd, hoaHand.deviceId, 'Selector Switch - Hand Contact');
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

  // -- Rung 4 (if HOA+PLC): SS1(Auto) → PLC contact → K1 Coil --
  let hoaAutoDeviceId: string | undefined;
  let plcDeviceId: string | undefined;
  let plcCoilId: string | undefined;
  let termInDeviceId: string | undefined;
  let termOutDeviceId: string | undefined;
  if (hasHOA && hasPLC) {
    rungNumber++;
    const hoaAuto = placeLinkedDevice(cd, 'SS1', 'iec-selector-switch-3pos', 0, 0, sheetId);
    cd = hoaAuto.circuit;
    cd = updateDeviceFunction(cd, hoaAuto.deviceId, 'Selector Switch - Auto Contact');
    hoaAutoDeviceId = hoaAuto.deviceId;

    // Terminal blocks at panel boundary (local ↔ remote/PLC)
    const termIn = placeDevice(cd, 'iec-terminal-single', 0, 0, sheetId, 'X3:1');
    cd = termIn.circuit;
    termInDeviceId = termIn.deviceId;
    const termOut = placeDevice(cd, 'iec-terminal-single', 0, 0, sheetId, 'X3:2');
    cd = termOut.circuit;
    termOutDeviceId = termOut.deviceId;

    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;

    const plcAutoCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcAutoCoil.circuit;
    plcCoilId = plcAutoCoil.deviceId;

    // Mark PLC contact as dashed (IEC: remote/external device)
    const plcTransforms1: Record<string, { rotation: number; mirrorH?: boolean; dashed?: boolean }> = {
      ...(cd.transforms || {}),
    };
    plcTransforms1[plcContact.deviceId] = { rotation: 0, dashed: true };
    cd = { ...cd, transforms: plcTransforms1 };

    const rungAuto = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [hoaAuto.deviceId, termIn.deviceId, plcContact.deviceId, termOut.deviceId, plcAutoCoil.deviceId],
      description: 'HOA - Auto (PLC remote)',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rungAuto] };
  } else if (hasPLC && !hasHOA) {
    // PLC contact without HOA — add standalone PLC rung
    rungNumber++;

    // Terminal blocks at panel boundary (local ↔ remote/PLC)
    const termIn2 = placeDevice(cd, 'iec-terminal-single', 0, 0, sheetId, 'X3:1');
    cd = termIn2.circuit;
    termInDeviceId = termIn2.deviceId;
    const termOut2 = placeDevice(cd, 'iec-terminal-single', 0, 0, sheetId, 'X3:2');
    cd = termOut2.circuit;
    termOutDeviceId = termOut2.deviceId;

    const plcContact = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'PLC1');
    cd = plcContact.circuit;
    plcDeviceId = plcContact.deviceId;

    // Mark PLC contact as dashed (IEC: remote/external device)
    const plcTransforms2: Record<string, { rotation: number; mirrorH?: boolean; dashed?: boolean }> = {
      ...(cd.transforms || {}),
    };
    plcTransforms2[plcContact.deviceId] = { rotation: 0, dashed: true };
    cd = { ...cd, transforms: plcTransforms2 };

    const plcCoil = placeLinkedDevice(cd, 'K1', 'iec-coil', 0, 0, sheetId);
    cd = plcCoil.circuit;
    plcCoilId = plcCoil.deviceId;

    const rungPLC = {
      id: require_generateId(),
      type: 'rung' as const,
      number: rungNumber,
      sheetId,
      blockId: controlBlockId,
      deviceIds: [termIn2.deviceId, plcContact.deviceId, termOut2.deviceId, plcCoil.deviceId],
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

  // Rung 3 (HOA Hand): wire SS1.2 → K1 coil.1
  if (hasHOA && hoaHandDeviceId && hoaHandCoilId) {
    cd = createWire(cd, 'SS1', '2', 'K1', '1', hoaHandDeviceId, hoaHandCoilId);
  }

  // Rung 4 (HOA Auto + PLC): SS1.2 → X3:1.1, X3:1.2 → PLC1.1, PLC1.2 → X3:2.1, X3:2.2 → K1 coil.1
  if (hasHOA && hasPLC && hoaAutoDeviceId && plcDeviceId && plcCoilId && termInDeviceId && termOutDeviceId) {
    cd = createWire(cd, 'SS1', '2', 'X3:1', '1', hoaAutoDeviceId, termInDeviceId);
    cd = createWire(cd, 'X3:1', '1', 'PLC1', '1', termInDeviceId, plcDeviceId);
    cd = createWire(cd, 'PLC1', '2', 'X3:2', '1', plcDeviceId, termOutDeviceId);
    cd = createWire(cd, 'X3:2', '1', 'K1', '1', termOutDeviceId, plcCoilId);
  } else if (hasPLC && !hasHOA && plcDeviceId && plcCoilId && termInDeviceId && termOutDeviceId) {
    cd = createWire(cd, 'X3:1', '1', 'PLC1', '1', termInDeviceId, plcDeviceId);
    cd = createWire(cd, 'PLC1', '2', 'X3:2', '1', plcDeviceId, termOutDeviceId);
    cd = createWire(cd, 'X3:2', '1', 'K1', '1', termOutDeviceId, plcCoilId);
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
  rungDescriptions.push('Rung 1: CB2(Breaker 1P)' +
    ' → F1(OL NC)' +
    (hasEStop ? ' → ES1(E-Stop NC)' : '') +
    ' → S2(Stop NC) → S1(Start NO) → J1 → K1(Coil)');
  rungDescriptions.push('Rung 2: K1(Seal-in NO) → J1 [branch]');
  if (hasHOA) rungDescriptions.push(`Rung 3: SS1(HOA Hand) → K1(Coil)`);
  if (hasHOA && hasPLC) rungDescriptions.push(`Rung 4: SS1(HOA Auto) → X3:1 → PLC1(dashed) → X3:2 → K1(Coil)`);
  else if (hasPLC) rungDescriptions.push(`Rung ${hasHOA ? 4 : 3}: X3:1 → PLC1(dashed) → X3:2 → K1(Coil)`);
  if (hasPilot) rungDescriptions.push(`Rung ${rungNumber}: K1(Aux NO) → PL1(Running Light)`);

  const summary = [
    `Motor starter panel generated (${options.hp} HP @ ${options.voltage}):`,
    '',
    '  Power: X1:1-3(Supply) → CB1 → K1(Contactor 3P) → F1(Overload 3P) → X2:1-3(Motor) → M1, PE1(Ground)',
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

/**
 * Generate a power distribution page using ladder layout (L1/N rails).
 *
 * Creates a single sheet with a ladder block:
 *   - L1 (hot) rail on the left, N (neutral) rail on the right
 *   - Each branch circuit is a horizontal rung between the rails
 *   - Dynamically enabled rungs based on options:
 *       SPD, outlet, light, fan, PS1, PS2, transformer
 *   - Multi-pin devices (power supply, transformer) get output terminals
 *     placed below their rung position
 *
 * Uses the same ladder infrastructure as motor starter control diagrams:
 *   createLadderBlock → rungs → autoLayoutLadder → createLadderRails
 */
export function generatePowerDistribution(
  circuit: CircuitData,
  options: {
    supplyVoltage: string;
    controlVoltage?: '120VAC' | '24VDC';
    transformer?: boolean;
    powerSupplyCount?: 1 | 2;
    convenienceOutlet?: boolean;
    cabinetLight?: boolean;
    cabinetFan?: boolean;
    surgeProtection?: boolean;
  },
): { circuit: CircuitData; summary: string } {
  let cd = circuit;
  const controlVoltage = options.controlVoltage || '120VAC';
  const hasTransformer = options.transformer || false;
  const hasSPD = options.surgeProtection !== false; // default true
  const psCount = options.powerSupplyCount || 1;
  const hasOutlet = options.convenienceOutlet !== false; // default true
  const hasLight = options.cabinetLight !== false; // default true
  const hasFan = options.cabinetFan || false;

  // Ladder config constants — leave room for rung numbers on the left margin
  const RUNG_SPACING = 140;
  const FIRST_RUNG_Y = 100;
  const RAIL_L1X = 200;
  const RAIL_L2X = 1100;
  // Junction pin "1" is at position (0,0) relative to symbol origin — no offset needed
  const PIN_OFFSET = 0;

  // ================================================================
  //  Create sheet + ladder block
  // ================================================================
  const sheet = addSheet(cd, 'Power Distribution');
  cd = sheet.circuit;
  const sheetId = sheet.sheetId;

  const ladderBlock = createLadderBlock(cd, sheetId, {
    railLabelL1: 'L1',
    railLabelL2: 'N',
    voltage: options.supplyVoltage,
    rungSpacing: RUNG_SPACING,
    firstRungY: FIRST_RUNG_Y,
    railL1X: RAIL_L1X,
    railL2X: RAIL_L2X,
  }, undefined, 'Power Distribution');
  cd = ladderBlock.circuit;
  const blockId = ladderBlock.blockId;

  // ================================================================
  //  Place devices at (0,0) and build rung definitions dynamically
  // ================================================================
  let cbNumber = 1;
  let rungNum = 1;
  const now = Date.now();

  // Track rung definitions for wiring and summary
  interface RungDef {
    number: number;
    deviceIds: string[];
    description: string;
  }
  const rungDefs: RungDef[] = [];

  // Track special device IDs for post-layout handling
  let ps1DeviceId: string | undefined;
  let ps2DeviceId: string | undefined;
  const branchDescriptions: string[] = [];

  // --- Surge Protection (SPD) ---
  if (hasSPD) {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'SPD Breaker');

    const spd = placeDevice(cd, 'iec-surge-arrester', 0, 0, sheetId, 'F1');
    cd = spd.circuit;
    cd = updateDeviceFunction(cd, spd.deviceId, 'Surge Protection');

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, spd.deviceId], description: 'Surge protection' });
    branchDescriptions.push(`${cbTag} → F1(Surge Arrester)`);
  }

  // --- Convenience Outlet ---
  if (hasOutlet) {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'Outlet Breaker');

    const outlet = placeDevice(cd, 'iec-receptacle', 0, 0, sheetId, 'XS1');
    cd = outlet.circuit;
    cd = updateDeviceFunction(cd, outlet.deviceId, 'Convenience Outlet');

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, outlet.deviceId], description: 'Convenience outlet' });
    branchDescriptions.push(`${cbTag} → XS1(Outlet)`);
  }

  // --- Cabinet Light ---
  if (hasLight) {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'Light Breaker');

    const light = placeDevice(cd, 'iec-pilot-light', 0, 0, sheetId, 'LT1');
    cd = light.circuit;
    cd = updateDeviceFunction(cd, light.deviceId, 'Cabinet Light');

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, light.deviceId], description: 'Cabinet light' });
    branchDescriptions.push(`${cbTag} → LT1(Cabinet Light)`);
  }

  // --- Cabinet Fan ---
  if (hasFan) {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'Fan Breaker');

    const fan = placeDevice(cd, 'iec-motor-1ph', 0, 0, sheetId, 'FAN1');
    cd = fan.circuit;
    cd = updateDeviceFunction(cd, fan.deviceId, 'Cabinet Fan');

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, fan.deviceId], description: 'Cabinet fan' });
    branchDescriptions.push(`${cbTag} → FAN1(Cabinet Fan)`);
  }

  // --- 24VDC Power Supply 1 ---
  {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'PS1 Breaker');

    const ps1 = placeDevice(cd, 'iec-power-supply-ac-dc', 0, 0, sheetId, 'PS1');
    cd = ps1.circuit;
    cd = updateDeviceFunction(cd, ps1.deviceId, '24VDC Power Supply');
    ps1DeviceId = ps1.deviceId;

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, ps1.deviceId], description: '24VDC Power Supply 1' });
    branchDescriptions.push(`${cbTag} → PS1(24VDC Power Supply)`);
  }

  // --- 24VDC Power Supply 2 (if dual) ---
  if (psCount >= 2) {
    const cbTag = `CB${cbNumber++}`;
    const cb = placeDevice(cd, 'iec-circuit-breaker-1p', 0, 0, sheetId, cbTag);
    cd = cb.circuit;
    cd = updateDeviceFunction(cd, cb.deviceId, 'PS2 Breaker');

    const ps2 = placeDevice(cd, 'iec-power-supply-ac-dc', 0, 0, sheetId, 'PS2');
    cd = ps2.circuit;
    cd = updateDeviceFunction(cd, ps2.deviceId, '24VDC Power Supply (Redundant)');
    ps2DeviceId = ps2.deviceId;

    rungDefs.push({ number: rungNum++, deviceIds: [cb.deviceId, ps2.deviceId], description: '24VDC Power Supply 2' });
    branchDescriptions.push(`${cbTag} → PS2(24VDC Power Supply Redundant)`);
  }

  // ================================================================
  //  Build rung objects (same pattern as generateMotorStarter)
  // ================================================================
  for (const def of rungDefs) {
    const rung = {
      id: require_generateId(),
      type: 'rung' as const,
      number: def.number,
      sheetId,
      blockId,
      deviceIds: def.deviceIds,
      description: def.description,
      createdAt: now,
      modifiedAt: now,
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rung] };
  }

  // ================================================================
  //  Auto-layout (positions all rung devices)
  // ================================================================
  const layout = autoLayoutLadder(cd, sheetId, blockId);
  cd = layout.circuit;

  // ================================================================
  //  Wire devices in series on each rung (CB.pin2 → load.pin1)
  //  Add horizontal waypoints at rung Y to force clean straight wires
  // ================================================================
  for (let di = 0; di < rungDefs.length; di++) {
    const def = rungDefs[di];
    const rungY = FIRST_RUNG_Y + di * RUNG_SPACING;
    for (let i = 0; i < def.deviceIds.length - 1; i++) {
      const fromDev = cd.devices.find(d => d.id === def.deviceIds[i])!;
      const toDev = cd.devices.find(d => d.id === def.deviceIds[i + 1])!;
      const fromPos = cd.positions[fromDev.id];
      const toPos = cd.positions[toDev.id];
      const wp = (fromPos && toPos) ? [
        { x: fromPos.x + 60, y: rungY },  // past the from device
        { x: toPos.x, y: rungY },          // at the to device
      ] : undefined;
      cd = createWire(cd, fromDev.tag, '2', toDev.tag, '1', fromDev.id, toDev.id, wp);
    }
  }

  // ================================================================
  //  Create L1/N rails (junctions + vertical rail wires + rung stubs)
  // ================================================================
  cd = createLadderRails(cd, sheetId, blockId);

  // ================================================================
  //  Transformer (if enabled) — handled separately (H1/H2 pins)
  //  Placed after standard rungs, manually wired to rail extensions
  // ================================================================
  if (hasTransformer) {
    const xfmrRungY = FIRST_RUNG_Y + (rungNum - 1) * RUNG_SPACING;
    const centerX = (RAIL_L1X + RAIL_L2X) / 2;

    // Place transformer
    const xfmr = placeDevice(cd, 'iec-transformer-1ph', 0, 0, sheetId, 'T1');
    cd = xfmr.circuit;
    cd = updateDeviceFunction(cd, xfmr.deviceId,
      `Control Transformer ${options.supplyVoltage}→${controlVoltage}`);

    // Position centered on rung, rotated -90 for ladder orientation
    cd = {
      ...cd,
      positions: { ...cd.positions, [xfmr.deviceId]: { x: centerX - 25, y: xfmrRungY - 35 } },
      transforms: { ...(cd.transforms || {}), [xfmr.deviceId]: { rotation: -90 } },
    };

    // Create L1/L2 junctions for transformer rung
    const l1Tag = `JL${rungNum}`;
    const l1J = placeDevice(cd, 'junction', 0, 0, sheetId, l1Tag);
    cd = l1J.circuit;
    cd = { ...cd, positions: { ...cd.positions,
      [l1J.deviceId]: { x: RAIL_L1X - PIN_OFFSET, y: xfmrRungY - PIN_OFFSET },
    }};

    const l2Tag = `JR${rungNum}`;
    const l2J = placeDevice(cd, 'junction', 0, 0, sheetId, l2Tag);
    cd = l2J.circuit;
    cd = { ...cd, positions: { ...cd.positions,
      [l2J.deviceId]: { x: RAIL_L2X - PIN_OFFSET, y: xfmrRungY - PIN_OFFSET },
    }};

    // Connect transformer junctions to existing rails
    const prevRung = rungNum - 1;
    const prevL1 = cd.devices.find(d => d.tag === `JL${prevRung}` && d.sheetId === sheetId);
    const prevL2 = cd.devices.find(d => d.tag === `JR${prevRung}` && d.sheetId === sheetId);
    if (prevL1) {
      cd = createWire(cd, prevL1.tag, '1', l1Tag, '1', prevL1.id, l1J.deviceId);
    }
    if (prevL2) {
      cd = createWire(cd, prevL2.tag, '1', l2Tag, '1', prevL2.id, l2J.deviceId);
    }

    // Wire junctions to transformer pins
    cd = createWire(cd, l1Tag, '1', 'T1', 'H1', l1J.deviceId, xfmr.deviceId);
    cd = createWire(cd, 'T1', 'H2', l2Tag, '1', xfmr.deviceId, l2J.deviceId);

    // Output terminals below transformer for secondary winding
    const xfmrOutputPinY = getPinWorldY('iec-transformer-1ph', 'X1', xfmrRungY - 35);
    const termY = alignDeviceToPin('iec-terminal-single', '1', xfmrOutputPinY + 20);
    const xt1 = placeDevice(cd, 'iec-terminal-single', centerX - 40, termY, sheetId, 'XT:1');
    cd = xt1.circuit;
    const xt2 = placeDevice(cd, 'iec-terminal-single', centerX + 10, termY, sheetId, 'XT:2');
    cd = xt2.circuit;

    cd = createWire(cd, 'T1', 'X1', 'XT:1', '1', xfmr.deviceId, xt1.deviceId);
    cd = createWire(cd, 'T1', 'X2', 'XT:2', '1', xfmr.deviceId, xt2.deviceId);

    // Annotation for secondary voltage
    const xfmrAnn = addAnnotation(cd, sheetId, centerX - 60, termY + 40,
      `Secondary: ${controlVoltage}`);
    cd = xfmrAnn.circuit;

    branchDescriptions.push(`T1(Transformer ${options.supplyVoltage}→${controlVoltage}) → XT:1/XT:2`);
    rungNum++;
  }

  // ================================================================
  //  Power supply output terminals (placed below PS devices)
  // ================================================================
  if (ps1DeviceId) {
    const ps1Pos = cd.positions[ps1DeviceId];
    if (ps1Pos) {
      const ps1OutputPinY = getPinWorldY('iec-power-supply-ac-dc', '3', ps1Pos.y);
      const termY = alignDeviceToPin('iec-terminal-single', '1', ps1OutputPinY + 20);
      const xPlus = placeDevice(cd, 'iec-terminal-single', ps1Pos.x - 10, termY, sheetId, 'X2:+');
      cd = xPlus.circuit;
      const xMinus = placeDevice(cd, 'iec-terminal-single', ps1Pos.x + 20, termY, sheetId, 'X2:-');
      cd = xMinus.circuit;

      cd = createWire(cd, 'PS1', '3', 'X2:+', '1', ps1DeviceId, xPlus.deviceId);
      cd = createWire(cd, 'PS1', '4', 'X2:-', '1', ps1DeviceId, xMinus.deviceId);
    }
  }

  if (ps2DeviceId) {
    const ps2Pos = cd.positions[ps2DeviceId];
    if (ps2Pos) {
      const ps2OutputPinY = getPinWorldY('iec-power-supply-ac-dc', '3', ps2Pos.y);
      const termY = alignDeviceToPin('iec-terminal-single', '1', ps2OutputPinY + 20);
      const xPlus = placeDevice(cd, 'iec-terminal-single', ps2Pos.x - 10, termY, sheetId, 'X3:+');
      cd = xPlus.circuit;
      const xMinus = placeDevice(cd, 'iec-terminal-single', ps2Pos.x + 20, termY, sheetId, 'X3:-');
      cd = xMinus.circuit;

      cd = createWire(cd, 'PS2', '3', 'X3:+', '1', ps2DeviceId, xPlus.deviceId);
      cd = createWire(cd, 'PS2', '4', 'X3:-', '1', ps2DeviceId, xMinus.deviceId);
    }
  }

  // ================================================================
  //  Summary
  // ================================================================
  const summary = [
    `Power distribution page generated (${options.supplyVoltage}, ladder layout L1/N):`,
    '',
    `  Ladder block: L1 (left rail) / N (right rail), ${rungDefs.length} rungs`,
    '',
    '  Branch circuits (each rung = breaker → load):',
    ...branchDescriptions.map(d => `    ${d}`),
    '',
    `  Options: SPD=${hasSPD}, Transformer=${hasTransformer}, PSCount=${psCount}, Outlet=${hasOutlet}, Light=${hasLight}, Fan=${hasFan}`,
    `  Devices: ${cd.devices.length}, Wires: ${cd.connections.length}`,
  ].join('\n');

  // Populate title block
  cd = populateTitleBlock(cd, sheetId, 'Power Distribution', 'PWR-001');

  // ================================================================
  //  Source & Destination Arrows (voltage labels for inter-sheet reference)
  // ================================================================
  const arrowTopY = FIRST_RUNG_Y - 80;
  const lastRungY = FIRST_RUNG_Y + (rungDefs.length - 1) * RUNG_SPACING;
  const arrowBottomY = lastRungY + 120;

  // Source arrow: incoming supply voltage at top of L1 rail
  const sa1 = placeDevice(cd, 'source-arrow', 0, 0, sheetId, 'SA1');
  cd = sa1.circuit;
  cd = updateDeviceFunction(cd, sa1.deviceId, options.supplyVoltage);
  cd = { ...cd, positions: { ...cd.positions, [sa1.deviceId]: { x: RAIL_L1X - 10, y: arrowTopY } } };

  // Destination arrow: neutral return at bottom of L2 rail
  const da1 = placeDevice(cd, 'destination-arrow', 0, 0, sheetId, 'DA1');
  cd = da1.circuit;
  cd = updateDeviceFunction(cd, da1.deviceId, options.supplyVoltage);
  cd = { ...cd, positions: { ...cd.positions, [da1.deviceId]: { x: RAIL_L1X - 10, y: arrowBottomY } } };

  // Destination arrow: +24VDC output (if PSU exists)
  if (psCount >= 1) {
    const da2 = placeDevice(cd, 'destination-arrow', 0, 0, sheetId, 'DA2');
    cd = da2.circuit;
    cd = updateDeviceFunction(cd, da2.deviceId, '+24VDC');
    cd = { ...cd, positions: { ...cd.positions, [da2.deviceId]: { x: RAIL_L2X - 100, y: arrowBottomY } } };

    const da3 = placeDevice(cd, 'destination-arrow', 0, 0, sheetId, 'DA3');
    cd = da3.circuit;
    cd = updateDeviceFunction(cd, da3.deviceId, '0V');
    cd = { ...cd, positions: { ...cd.positions, [da3.deviceId]: { x: RAIL_L2X, y: arrowBottomY } } };
  }

  return { circuit: cd, summary };
}

// ================================================================
//  SHARED LADDER TEMPLATE BUILDER
// ================================================================

/**
 * Rung definition for the ladder template builder.
 */
interface RungDef {
  number: number;
  deviceIds: string[];
  description: string;
}

/**
 * Build a complete ladder sheet from rung definitions.
 * Handles the shared boilerplate: create sheet → ladder block → rung objects →
 * auto-layout → device-to-device wiring with waypoints → L1/L2 rails → title block.
 *
 * Templates call this after placing devices and building rungDefs.
 */
function buildLadderSheet(
  circuit: CircuitData,
  options: {
    sheetName: string;
    voltage: string;
    railLabelL1?: string;
    railLabelL2?: string;
    rungSpacing?: number;
    firstRungY?: number;
    railL1X?: number;
    railL2X?: number;
    rungDefs: RungDef[];
    titleBlock?: { title: string; drawingNumber: string };
    /** Skip automatic device-to-device wiring (pin 2 → pin 1). Use when devices have non-standard pins (e.g., PLC modules). */
    skipDeviceWiring?: boolean;
  },
): { circuit: CircuitData; sheetId: string; blockId: string } {
  let cd = circuit;
  const RUNG_SPACING = options.rungSpacing ?? 140;
  const FIRST_RUNG_Y = options.firstRungY ?? 100;
  const RAIL_L1X = options.railL1X ?? 200;
  const RAIL_L2X = options.railL2X ?? 1100;
  const now = Date.now();

  // Create sheet + ladder block
  const sheet = addSheet(cd, options.sheetName);
  cd = sheet.circuit;
  const sheetId = sheet.sheetId;

  const ladderBlock = createLadderBlock(cd, sheetId, {
    railLabelL1: options.railLabelL1 ?? 'L1',
    railLabelL2: options.railLabelL2 ?? 'N',
    voltage: options.voltage,
    rungSpacing: RUNG_SPACING,
    firstRungY: FIRST_RUNG_Y,
    railL1X: RAIL_L1X,
    railL2X: RAIL_L2X,
  }, undefined, options.sheetName);
  cd = ladderBlock.circuit;
  const blockId = ladderBlock.blockId;

  // Build rung objects
  for (const def of options.rungDefs) {
    const rung = {
      id: require_generateId(),
      type: 'rung' as const,
      number: def.number,
      sheetId,
      blockId,
      deviceIds: def.deviceIds,
      description: def.description || undefined,
      createdAt: now,
      modifiedAt: now,
    };
    cd = { ...cd, rungs: [...(cd.rungs || []), rung] };
  }

  // Auto-layout: positions all rung devices
  const layout = autoLayoutLadder(cd, sheetId, blockId);
  cd = layout.circuit;

  // Wire devices in series on each rung (pin 2 → pin 1) with horizontal waypoints.
  // Skipped when devices have non-standard pins (e.g., PLC modules with DO0, DI0 pins).
  if (!options.skipDeviceWiring) {
    for (let di = 0; di < options.rungDefs.length; di++) {
      const def = options.rungDefs[di];
      const rungY = FIRST_RUNG_Y + di * RUNG_SPACING;
      for (let i = 0; i < def.deviceIds.length - 1; i++) {
        const fromDev = cd.devices.find(d => d.id === def.deviceIds[i])!;
        const toDev = cd.devices.find(d => d.id === def.deviceIds[i + 1])!;
        const fromPos = cd.positions[fromDev.id];
        const toPos = cd.positions[toDev.id];
        const wp = (fromPos && toPos) ? [
          { x: fromPos.x + 60, y: rungY },
          { x: toPos.x, y: rungY },
        ] : undefined;
        cd = createWire(cd, fromDev.tag, '2', toDev.tag, '1', fromDev.id, toDev.id, wp);
      }
    }
  }

  // Create L1/L2 rails (junctions + vertical wires + rung stubs)
  cd = createLadderRails(cd, sheetId, blockId);

  // Populate title block
  if (options.titleBlock) {
    cd = populateTitleBlock(cd, sheetId, options.titleBlock.title, options.titleBlock.drawingNumber);
  }

  return { circuit: cd, sheetId, blockId };
}

// ================================================================
//  RELAY OUTPUT SHEET GENERATOR
// ================================================================

/**
 * Generate a relay output sheet with N relay coils driven by PLC outputs.
 * Each relay gets 2 rungs: coil rung + contact rung.
 * Full wiring: L1→coil→L2, L1→contact→L2, vertical rails.
 */
export function generateRelayOutputSheet(
  circuit: CircuitData,
  options: {
    sheetName: string;
    relayStartNumber: number;
    relayCount: number;
    voltage?: string;
    railLabelL1?: string;
    railLabelL2?: string;
  },
): { circuit: CircuitData; summary: string } {
  let cd = circuit;
  const voltage = options.voltage || '24VDC';

  // Tabloid usable height ~950px. Each relay = 2 rungs (coil + spacer).
  const totalRungs = options.relayCount * 2;
  const rungSpacing = Math.min(120, Math.floor(900 / totalRungs));

  // Determine sheetId for device placement (will be created by buildLadderSheet)
  // Place devices first with temporary sheetId, buildLadderSheet will set correct one
  const tempSheetId = '__temp__';
  let rungNum = 1;
  const rungDefs: RungDef[] = [];

  // Place relay coils — one per rung, clean ladder layout.
  for (let i = 0; i < options.relayCount; i++) {
    const relayNum = options.relayStartNumber + i;
    const coilTag = `CR${relayNum}`;

    const coil = placeDevice(cd, 'ansi-coil', 0, 0, tempSheetId, coilTag);
    cd = coil.circuit;
    cd = updateDeviceFunction(cd, coil.deviceId, `OUTPUT ${relayNum}`);

    rungDefs.push({
      number: rungNum++,
      deviceIds: [coil.deviceId],
      description: `OUTPUT ${relayNum}`,
    });

    // Spacer rung between relays
    rungDefs.push({ number: rungNum++, deviceIds: [], description: '' });
  }

  // Build the ladder sheet (handles all boilerplate)
  const result = buildLadderSheet(cd, {
    sheetName: options.sheetName,
    voltage,
    railLabelL1: options.railLabelL1 || '+24V',
    railLabelL2: options.railLabelL2 || '0V',
    rungSpacing,
    firstRungY: 80,
    rungDefs,
    titleBlock: { title: options.sheetName, drawingNumber: `RLY-${String(options.relayStartNumber).padStart(3, '0')}` },
  });
  cd = result.circuit;

  // Fix device sheetIds (were placed with tempSheetId)
  cd = {
    ...cd,
    devices: cd.devices.map(d => d.sheetId === tempSheetId ? { ...d, sheetId: result.sheetId } : d),
  };

  const summary = `Relay output sheet "${options.sheetName}": CR${options.relayStartNumber}-CR${options.relayStartNumber + options.relayCount - 1}, ${voltage}, fully wired`;
  return { circuit: cd, summary };
}

// ================================================================
//  PLC + RELAY COILS SHEET GENERATOR
// ================================================================

/**
 * Generate a PLC relay output sheet: Micro800 PLC on left, relay coils on right.
 * Each rung: PLC DO pin → relay coil (ANSI circle style).
 * Optionally adds input rungs for DI pins with terminal blocks.
 */
export function generatePLCRelaySheet(
  circuit: CircuitData,
  options: {
    sheetName: string;
    plcModel?: string;       // e.g., 'micro870' → ab-micro870-cpu
    relayCount: number;      // DO0..DO(N-1) → CR1..CRN
    relayStartNumber?: number;
    inputCount?: number;     // DI0..DI(N-1) with terminal blocks
    voltage?: string;
  },
): { circuit: CircuitData; summary: string } {
  let cd = circuit;
  const voltage = options.voltage || '24VDC';
  const relayStart = options.relayStartNumber ?? 1;
  const inputCount = options.inputCount ?? 0;
  const plcSymbol = `ab-${options.plcModel || 'micro870'}-cpu`;

  // Total rungs = relays + inputs + spacer between sections
  const totalRungs = options.relayCount + inputCount + (inputCount > 0 ? 1 : 0);
  const rungSpacing = Math.min(100, Math.floor(900 / Math.max(totalRungs, 1)));

  const tempSheetId = '__temp__';
  let rungNum = 1;
  const rungDefs: RungDef[] = [];

  // Place PLC device (multi-rung, left side)
  const plc = placeDevice(cd, plcSymbol, 0, 0, tempSheetId, 'PLC1');
  cd = plc.circuit;
  cd = updateDeviceFunction(cd, plc.deviceId, `Micro800 ${(options.plcModel || 'L70E').toUpperCase()}`);

  // Place relay coils and build relay rungs
  for (let i = 0; i < options.relayCount; i++) {
    const relayNum = relayStart + i;
    const coilTag = `CR${relayNum}`;

    const coil = placeDevice(cd, 'ansi-coil', 0, 0, tempSheetId, coilTag);
    cd = coil.circuit;
    cd = updateDeviceFunction(cd, coil.deviceId, `OUTPUT ${relayNum}`);

    // PLC DO pin and coil on same rung
    rungDefs.push({
      number: rungNum++,
      deviceIds: [plc.deviceId, coil.deviceId],
      description: `OUTPUT ${relayNum}`,
    });
  }

  // Spacer between relay and input sections
  if (inputCount > 0) {
    rungDefs.push({ number: rungNum++, deviceIds: [], description: '' });
  }

  // Place input terminal blocks and build input rungs
  for (let i = 0; i < inputCount; i++) {
    const tbTag = `TB${i + 1}`;
    const tb = placeDevice(cd, 'iec-terminal-single', 0, 0, tempSheetId, tbTag);
    cd = tb.circuit;
    cd = updateDeviceFunction(cd, tb.deviceId, `INPUT ${i + 1}`);

    rungDefs.push({
      number: rungNum++,
      deviceIds: [plc.deviceId, tb.deviceId],
      description: `INPUT ${i + 1} (24VDC)`,
    });
  }

  // Build the ladder sheet — skip automatic device wiring (PLC has non-standard pins)
  const result = buildLadderSheet(cd, {
    sheetName: options.sheetName,
    voltage,
    railLabelL1: '+24V',
    railLabelL2: '0V',
    rungSpacing,
    firstRungY: 80,
    rungDefs,
    titleBlock: { title: options.sheetName, drawingNumber: 'PLC-001' },
    skipDeviceWiring: true,
  });
  cd = result.circuit;

  // Fix device sheetIds
  cd = {
    ...cd,
    devices: cd.devices.map(d => d.sheetId === tempSheetId ? { ...d, sheetId: result.sheetId } : d),
  };

  // Custom PLC wiring: PLC DO pins → relay coils, PLC DI pins ← terminal blocks
  let doIndex = 0;
  let diIndex = 0;
  const FIRST_RUNG_Y = 80;
  for (let di = 0; di < rungDefs.length; di++) {
    const def = rungDefs[di];
    if (def.deviceIds.length < 2) continue; // spacer rung

    const plcDev = cd.devices.find(d => d.id === def.deviceIds[0]);
    const otherDev = cd.devices.find(d => d.id === def.deviceIds[1]);
    if (!plcDev || !otherDev) continue;

    const rungY = 80 + di * rungSpacing;
    const plcPos = cd.positions[plcDev.id];
    const otherPos = cd.positions[otherDev.id];

    // Determine if this is a relay rung or input rung
    const isRelay = otherDev.tag.startsWith('CR');
    const isInput = otherDev.tag.startsWith('TB');

    if (isRelay && doIndex < options.relayCount) {
      // PLC DO → relay coil pin 1
      const doPin = `DO${doIndex}`;
      const wp = (plcPos && otherPos) ? [
        { x: plcPos.x + 230, y: rungY },
        { x: otherPos.x, y: rungY },
      ] : undefined;
      try {
        cd = createWire(cd, plcDev.tag, doPin, otherDev.tag, '1', plcDev.id, otherDev.id, wp);
      } catch { /* pin validation may fail — skip */ }
      doIndex++;
    } else if (isInput && diIndex < inputCount) {
      // Terminal → PLC DI
      const diPin = `DI${diIndex}`;
      const wp = (plcPos && otherPos) ? [
        { x: otherPos.x + 40, y: rungY },
        { x: plcPos.x, y: rungY },
      ] : undefined;
      try {
        cd = createWire(cd, otherDev.tag, '1', plcDev.tag, diPin, otherDev.id, plcDev.id, wp);
      } catch { /* skip */ }
      diIndex++;
    }
  }

  const summary = `PLC relay sheet "${options.sheetName}": ${options.relayCount} relay outputs (CR${relayStart}-CR${relayStart + options.relayCount - 1}), ${inputCount} inputs, ${voltage}`;
  return { circuit: cd, summary };
}

import { generateId } from '@fusion-cad/core-model';
function require_generateId(): string {
  return generateId();
}

function updateDeviceFunction(circuit: CircuitData, deviceId: string, fn: string): CircuitData {
  return { ...circuit, devices: circuit.devices.map(d =>
    d.id === deviceId ? { ...d, function: fn, modifiedAt: Date.now() } : d
  )};
}

function populateTitleBlock(
  circuit: CircuitData,
  sheetId: string,
  title: string,
  drawingNumber: string,
  sheetNumber?: number,
  totalSheets?: number,
): CircuitData {
  const today = new Date().toISOString().split('T')[0];
  return {
    ...circuit,
    sheets: (circuit.sheets || []).map(s => s.id === sheetId ? {
      ...s,
      titleBlock: {
        title,
        drawingNumber,
        revision: 'A',
        date: today,
        drawnBy: 'fusionCad',
        ...(totalSheets ? { sheetOf: `${sheetNumber} of ${totalSheets}` } : {}),
      }
    } : s),
  };
}

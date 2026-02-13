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
import {
  placeDevice,
  placeLinkedDevice,
  createWire,
  setSheetType,
  addSheet,
  addRung,
  autoLayoutLadder,
  createLadderRails,
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

  // Set sheet types
  cd = setSheetType(cd, powerSheetId, 'schematic');
  cd = setSheetType(cd, controlSheetId, 'ladder', {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
  });

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
    deviceIds: rung3Ids,
    description: 'Running indicator',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung3Rung] };

  // Auto-layout control sheet
  const layout = autoLayoutLadder(cd, controlSheetId);
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
  cd = createLadderRails(cd, controlSheetId);

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

// Import generateId — need to use the same ID generator
import { generateId } from '@fusion-cad/core-model';
function require_generateId(): string {
  return generateId();
}

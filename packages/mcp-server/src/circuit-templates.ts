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
  addRung,
  autoLayoutLadder,
} from './circuit-helpers.js';

/**
 * Generate a complete 3-wire motor starter ladder diagram.
 *
 * Standard rungs:
 * - Rung 1: OL(NC) → Stop(NC) → Start(NO) → K1 Coil
 * - Rung 2: OL(NC) → K1 Seal-in(NO) → K1 Coil (parallel to start)
 * - Rung 3: K1 aux(NO) → Pilot Light "Running"
 */
export function generateMotorStarter(
  circuit: CircuitData,
  sheetId: string,
  controlVoltage: '24VDC' | '120VAC',
  motorTag: string,
): { circuit: CircuitData; summary: string } {
  let cd = circuit;

  // 1. Set sheet to ladder type
  cd = setSheetType(cd, sheetId, 'ladder', {
    voltage: controlVoltage,
    railLabelL1: controlVoltage === '24VDC' ? '+24V' : 'L1',
    railLabelL2: controlVoltage === '24VDC' ? '0V' : 'L2',
  });

  // 2. Place devices
  // OL aux NC contact (overload relay auxiliary contact)
  const ol = placeDevice(cd, 'iec-normally-closed-contact', 0, 0, sheetId, 'OL');
  cd = ol.circuit;

  // Stop pushbutton (NC)
  const stop = placeDevice(cd, 'iec-normally-closed-contact', 0, 0, sheetId, 'S2');
  cd = stop.circuit;

  // Start pushbutton (NO)
  const start = placeDevice(cd, 'iec-normally-open-contact', 0, 0, sheetId, 'S1');
  cd = start.circuit;

  // Contactor coil
  const coil = placeDevice(cd, 'iec-coil', 0, 0, sheetId, 'K1');
  cd = coil.circuit;

  // Seal-in contact (K1 NO — linked to coil)
  const sealin = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
  cd = sealin.circuit;

  // OL aux (rung 2 — linked to OL)
  const ol2 = placeLinkedDevice(cd, 'OL', 'iec-normally-closed-contact', 0, 0, sheetId);
  cd = ol2.circuit;

  // K1 aux NO contact for pilot light (linked to K1)
  const k1aux = placeLinkedDevice(cd, 'K1', 'iec-normally-open-contact', 0, 0, sheetId);
  cd = k1aux.circuit;

  // Pilot light
  const pilot = placeDevice(cd, 'iec-pilot-light', 0, 0, sheetId, 'PL1');
  cd = pilot.circuit;

  // 3. Define rungs
  // Rung 1: OL → Stop → Start → K1 coil
  const rung1 = addRung(cd, sheetId, 1, ['OL', 'S2', 'S1', 'K1'], 'Motor starter control');
  cd = rung1.circuit;

  // Rung 2: OL2 → K1 seal-in (branch of rung 1 — coil is on rung 1)
  // The seal-in contact output wires UP to K1 coil on rung 1.
  const rung2Ids = [ol2.deviceId, sealin.deviceId];
  const rung2Rung = {
    id: require_generateId(),
    type: 'rung' as const,
    number: 2,
    sheetId,
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
    sheetId,
    deviceIds: rung3Ids,
    description: 'Running indicator',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  cd = { ...cd, rungs: [...(cd.rungs || []), rung3Rung] };

  // 4. Auto-layout
  const layout = autoLayoutLadder(cd, sheetId);
  cd = layout.circuit;

  // 5. Wire rung 1: OL.2→S2.1, S2.2→S1.1, S1.2→K1.1
  cd = createWire(cd, 'OL', '2', 'S2', '1', ol.deviceId, stop.deviceId);
  cd = createWire(cd, 'S2', '2', 'S1', '1', stop.deviceId, start.deviceId);
  cd = createWire(cd, 'S1', '2', 'K1', '1', start.deviceId, coil.deviceId);

  // 6. Wire rung 2: OL2.2→K1-sealin.1, K1-sealin.2→K1-coil.1
  cd = createWire(cd, 'OL', '2', 'K1', '1', ol2.deviceId, sealin.deviceId);
  cd = createWire(cd, 'K1', '2', 'K1', '1', sealin.deviceId, coil.deviceId);

  // 7. Wire rung 3: K1aux.2→PL1.1
  cd = createWire(cd, 'K1', '2', 'PL1', '1', k1aux.deviceId, pilot.deviceId);

  const summary = [
    'Motor starter ladder diagram generated:',
    `  Rung 1: OL(NC) → S2(Stop NC) → S1(Start NO) → K1(Coil) — ${controlVoltage}`,
    '  Rung 2: OL(NC) → K1(Seal-in NO) → K1(Coil)',
    '  Rung 3: K1(Aux NO) → PL1(Running Light)',
    `  8 devices, 3 rungs, 6 wires`,
  ].join('\n');

  return { circuit: cd, summary };
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

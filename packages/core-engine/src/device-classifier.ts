/**
 * Device classification for ERC circuit analysis.
 *
 * Classifies devices into electrical roles to determine whether
 * a path between power rails constitutes a short circuit.
 */

import type { Device, Part } from '@fusion-cad/core-model';

export type DeviceRole = 'load' | 'protection' | 'switching' | 'passive' | 'source' | 'unknown';

/**
 * Classify a device by its symbol ID, part category, or tag prefix.
 *
 * Priority: symbolId keyword → part category keyword → tag prefix fallback.
 * Returns 'unknown' for unrecognized devices (conservative — won't flag false positives).
 */
export function classifyDevice(device: Device, parts: Part[]): DeviceRole {
  // 1. Try classification by symbolId (most reliable)
  const symbolId = (device as any).symbolId as string | undefined;
  if (symbolId) {
    const role = classifyByKeyword(symbolId);
    if (role !== 'unknown') return role;
  }

  // 2. Try classification by part category
  const part = device.partId ? parts.find(p => p.id === device.partId) : undefined;
  const category = part?.category || (part as any)?.symbolCategory;
  if (category) {
    const role = classifyByKeyword(category);
    if (role !== 'unknown') return role;
  }

  // 3. Fallback: classify by tag prefix
  return classifyByTagPrefix(device.tag);
}

/**
 * Classify by keyword matching against a symbol ID or category string.
 */
export function classifyByKeyword(id: string): DeviceRole {
  const s = id.toLowerCase();

  // Load devices (dissipate power)
  if (s.includes('motor')) return 'load';
  if (s.includes('vfd')) return 'load';
  if (s.includes('pilot-light') || s.includes('pilot_light')) return 'load';
  if (s.includes('horn')) return 'load';
  if (s.includes('heater')) return 'load';
  if (s.includes('solenoid')) return 'load';
  if (s.includes('led') && !s.includes('sled')) return 'load';
  if (s.includes('lamp')) return 'load';

  // Protection devices (interrupt fault current)
  if (s.includes('circuit-breaker') || s.includes('circuit_breaker')) return 'protection';
  if (s.includes('fuse')) return 'protection';
  if (s.includes('overload') || s.includes('thermal-overload') || s.includes('thermal_overload')) return 'protection';

  // Switching/control devices (may be open/closed)
  if (s.includes('contactor')) return 'switching';
  if (s.includes('coil')) return 'switching';
  if (s.includes('contact') && !s.includes('contactor')) return 'switching';
  if (s.includes('relay') && !s.includes('overload')) return 'switching';
  if (s.includes('switch')) return 'switching';
  if (s.includes('button')) return 'switching';
  if (s.includes('timer')) return 'switching';
  if (s.includes('selector')) return 'switching';
  if (s.includes('emergency-stop') || s.includes('e-stop') || s.includes('estop')) return 'switching';
  if (s.includes('disconnector')) return 'switching';

  // Source devices (generate power)
  if (s.includes('power-supply') || s.includes('power_supply')) return 'source';
  if (s.includes('transformer')) return 'source';

  // Passive/transparent devices (don't affect power flow)
  if (s.includes('terminal')) return 'passive';
  if (s.includes('junction')) return 'passive';
  if (s.includes('ground') || s.includes('earth')) return 'passive';
  if (s.includes('no-connect') || s.includes('no_connect') || s.includes('noconnect')) return 'passive';
  if (s.includes('resistor')) return 'load';
  if (s.includes('capacitor')) return 'passive';
  if (s.includes('inductor')) return 'load';
  if (s.includes('diode')) return 'passive';

  // Meters (load — they draw some current)
  if (s.includes('voltmeter') || s.includes('ammeter') || s.includes('meter')) return 'load';

  // PLC modules (they consume power)
  if (s.includes('plc')) return 'load';

  return 'unknown';
}

/**
 * Fallback classification by device tag prefix.
 */
export function classifyByTagPrefix(tag: string): DeviceRole {
  const prefix = tag.replace(/\d+$/, '').toUpperCase();

  switch (prefix) {
    // Load
    case 'M':     // Motor
    case 'H':     // Heater / Horn
    case 'PL':    // Pilot light
    case 'L':     // Lamp (when used as indicator)
    case 'VFD':   // Variable frequency drive
    case 'R':     // Resistor
      return 'load';

    // Protection
    case 'CB':    // Circuit breaker
    case 'QF':    // Circuit breaker (IEC)
    case 'FU':    // Fuse
    case 'F':     // Overload relay / fuse
    case 'OL':    // Overload
      return 'protection';

    // Switching
    case 'K':     // Contactor / relay
    case 'KM':    // Motor contactor
    case 'KA':    // Auxiliary contactor
    case 'S':     // Switch / pushbutton
    case 'SS':    // Selector switch
    case 'CR':    // Control relay
    case 'TR':    // Timer relay
    case 'T':     // Timer
      return 'switching';

    // Passive
    case 'X':     // Terminal
    case 'J':     // Junction / connector
    case 'W':     // Wire label
    case 'TB':    // Terminal block
      return 'passive';

    // Source
    case 'PS':    // Power supply
    case 'XF':    // Transformer
      return 'source';

    default:
      return 'unknown';
  }
}

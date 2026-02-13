/**
 * Motor Starter Lookup Engine
 *
 * Queries the Schneider Electric motor database to find the correct
 * components for a given motor specification (HP, voltage, country, phase, starter type).
 */

import type {
  MotorSpec,
  MotorStarterResult,
  ComponentSelection,
  MotorDatabase,
} from './types.js';
import motorDb from './motor-database.json' with { type: 'json' };

const database = motorDb as unknown as MotorDatabase;

const SE_URL_BASE = 'https://www.se.com/us/en/product/';

/** Fraction-to-decimal mapping for HP normalization */
const FRACTION_TO_DECIMAL: Record<string, string> = {
  '1/6': '0.167',
  '1/4': '0.25',
  '1/3': '0.333',
  '1/2': '0.5',
  '3/4': '0.75',
};
const DECIMAL_TO_FRACTION: Record<string, string> = {
  '0.167': '1/6',
  '0.25': '1/4',
  '0.333': '1/3',
  '0.5': '1/2',
  '0.75': '3/4',
};

/**
 * Build the region key for the motor database.
 * E.g., "USA_ThreePhase_208V", "Canada_SinglePhase_115V"
 */
function buildRegionKey(country: string, phase: string, voltage: string): string {
  const phaseKey = phase === 'single' ? 'SinglePhase' : 'ThreePhase';
  return `${country}_${phaseKey}_${voltage}`;
}

/**
 * Normalize HP input to the format used in the database.
 * Single-phase uses fraction format ("1/2 HP"), three-phase uses decimal ("0.5 HP").
 */
function normalizeHp(hp: string, phase: string): string {
  // Strip trailing " HP" or "HP" if present
  let cleaned = hp.replace(/\s*HP$/i, '').trim();

  if (phase === 'single') {
    // Single-phase DB uses fractions: "1/6 HP", "1/4 HP", etc. (plus "1 HP", "1.5 HP"...)
    if (DECIMAL_TO_FRACTION[cleaned]) {
      cleaned = DECIMAL_TO_FRACTION[cleaned];
    }
  } else {
    // Three-phase DB uses decimals: "0.5 HP", "0.75 HP", etc.
    if (FRACTION_TO_DECIMAL[cleaned]) {
      // Map "1/2" → "0.5", etc.
      const decimal = FRACTION_TO_DECIMAL[cleaned];
      // But DB uses "0.5" not "0.167", check if the decimal is in a simpler form
      if (cleaned === '1/2') cleaned = '0.5';
      else if (cleaned === '3/4') cleaned = '0.75';
      else cleaned = decimal;
    }
  }

  return `${cleaned} HP`;
}

function seUrl(partNumber: string): string {
  return `${SE_URL_BASE}${partNumber}/`;
}

function makeComponent(
  partNumber: string,
  description: string,
  category: string,
  symbolCategory: string,
): ComponentSelection | undefined {
  if (!partNumber || partNumber === '-') return undefined;
  return {
    partNumber,
    manufacturer: 'Schneider Electric',
    description,
    category,
    symbolCategory,
    datasheetUrl: seUrl(partNumber),
  };
}

/**
 * Look up motor starter components for a given specification.
 * Returns null if the combination is not found or not supported.
 */
export function lookupMotorStarter(spec: MotorSpec): MotorStarterResult | null {
  const country = spec.country || 'USA';
  const phase = spec.phase || 'three';
  const starterType = spec.starterType || 'iec-open';
  const voltage = spec.voltage;

  const regionKey = buildRegionKey(country, phase, voltage);
  const region = database[regionKey];
  if (!region) return null;

  const hpKey = normalizeHp(spec.hp, phase);
  const motorEntry = region.motorData[hpKey];
  if (!motorEntry) return null;

  const { common, enclosed, open } = motorEntry;
  const motorFLA = parseFloat(common.motorFLA);
  const wireSize = common.wireSize;
  const breakerSize = parseFloat(common.thermalBreakerSize);
  const safetySwitchSize = common.safetySwitchSize;

  // Circuit breaker is always from common
  const circuitBreaker = makeComponent(
    common.breakerCatalogNumber,
    `PowerPact ${common.breakerCatalogNumber} - ${common.thermalBreakerSize}A Thermal-Magnetic Breaker`,
    'circuit-breaker',
    'circuit-breaker',
  );
  if (!circuitBreaker) return null;

  let contactor: ComponentSelection | undefined;
  let overloadRelay: ComponentSelection | undefined;
  let disconnectSwitch: ComponentSelection | undefined;
  let manualStarter: ComponentSelection | undefined;
  let nemaStarter: ComponentSelection | undefined;
  let thermalUnit: ComponentSelection | undefined;
  let starterKit: ComponentSelection | undefined;

  if (phase === 'three') {
    switch (starterType) {
      case 'iec-open': {
        contactor = makeComponent(
          open.IECContactorTeSysDF,
          `TeSys D/F Contactor ${open.IECContactorTeSysDF} - ${common.IECContactorAC3Rating}A AC-3`,
          'contactor',
          'contactor',
        );
        // LRD overload first, fall back to LR9 electronic for large motors
        overloadRelay = makeComponent(
          open.LRDClass10OverloadForIECCont,
          `TeSys LRD Overload Relay ${open.LRDClass10OverloadForIECCont} - Class 10`,
          'overload',
          'overload',
        ) ?? makeComponent(
          open.LR9ElectronicOverloadForIECCont,
          `TeSys LR9 Electronic Overload ${open.LR9ElectronicOverloadForIECCont}`,
          'overload',
          'overload',
        );
        manualStarter = makeComponent(
          open.IECTypeEManualStarter,
          `TeSys GV2/GV3 Manual Starter ${open.IECTypeEManualStarter}`,
          'manual-starter',
          'circuit-breaker',
        );
        break;
      }
      case 'iec-enclosed': {
        starterKit = makeComponent(
          enclosed.instakitsIECStarterType1Encl,
          `TeSys LE1D Starter Kit ${enclosed.instakitsIECStarterType1Encl} - Type 1 Enclosed`,
          'starter-kit',
          'contactor',
        );
        overloadRelay = makeComponent(
          enclosed.LRDClass10OverloadForLE1DStarter,
          `TeSys LRD Overload Relay ${enclosed.LRDClass10OverloadForLE1DStarter} - Class 10 for LE1D`,
          'overload',
          'overload',
        ) ?? makeComponent(
          enclosed.LRDClass20OverloadForLE1DStarter,
          `TeSys LRD Overload Relay ${enclosed.LRDClass20OverloadForLE1DStarter} - Class 20 for LE1D`,
          'overload',
          'overload',
        );
        disconnectSwitch = makeComponent(
          enclosed.heavyDutySwitchType1Encl,
          `Heavy Duty Safety Switch ${enclosed.heavyDutySwitchType1Encl} - Type 1`,
          'disconnect-switch',
          'disconnect-switch',
        );
        // For enclosed, the LE1D kit includes the contactor
        contactor = starterKit;
        break;
      }
      case 'nema-open': {
        contactor = makeComponent(
          open.NEMASizedTeSysNContactor,
          `TeSys N NEMA Contactor ${open.NEMASizedTeSysNContactor} - Size ${common.NEMAcontactorSize}`,
          'contactor',
          'contactor',
        );
        overloadRelay = makeComponent(
          open.LRDClass20OverloadForNEMACont,
          `TeSys LRD Overload Relay ${open.LRDClass20OverloadForNEMACont} - Class 20 for NEMA`,
          'overload',
          'overload',
        ) ?? makeComponent(
          open.LR9ElectronicOverloadForNEMACont,
          `TeSys LR9 Electronic Overload ${open.LR9ElectronicOverloadForNEMACont}`,
          'overload',
          'overload',
        );
        break;
      }
      case 'nema-enclosed': {
        nemaStarter = makeComponent(
          enclosed.NEMAStarter8536Type1Encl,
          `NEMA Starter 8536 ${enclosed.NEMAStarter8536Type1Encl} - Type 1 Enclosed`,
          'nema-starter',
          'contactor',
        );
        thermalUnit = makeComponent(
          enclosed.thermalUnitFor8536NEMAStarter,
          `Thermal Unit ${enclosed.thermalUnitFor8536NEMAStarter} for 8536 Starter`,
          'thermal-unit',
          'overload',
        );
        disconnectSwitch = makeComponent(
          enclosed.heavyDutySwitchType1Encl,
          `Heavy Duty Safety Switch ${enclosed.heavyDutySwitchType1Encl} - Type 1`,
          'disconnect-switch',
          'disconnect-switch',
        );
        // For NEMA enclosed, starter includes contactor+overload
        contactor = nemaStarter;
        overloadRelay = thermalUnit;
        break;
      }
    }
  } else {
    // Single-phase: only NEMA starters available
    switch (starterType) {
      case 'nema-enclosed': {
        nemaStarter = makeComponent(
          enclosed['8536MagneticStarterType1Encl'],
          `NEMA 8536 Magnetic Starter ${enclosed['8536MagneticStarterType1Encl']} - Type 1`,
          'nema-starter',
          'contactor',
        );
        thermalUnit = makeComponent(
          enclosed.thermalUnitFor8536NEMAStarter,
          `Thermal Unit ${enclosed.thermalUnitFor8536NEMAStarter} for 8536 Starter`,
          'thermal-unit',
          'overload',
        );
        disconnectSwitch = makeComponent(
          enclosed.heavyDutySwitchType1Encl,
          `Heavy Duty Safety Switch ${enclosed.heavyDutySwitchType1Encl} - Type 1`,
          'disconnect-switch',
          'disconnect-switch',
        );
        contactor = nemaStarter;
        overloadRelay = thermalUnit;
        break;
      }
      case 'nema-open': {
        manualStarter = makeComponent(
          open['2510ManualIntegralHPOS'],
          `Manual Starter 2510 ${open['2510ManualIntegralHPOS']} - Open Type`,
          'manual-starter',
          'circuit-breaker',
        );
        thermalUnit = makeComponent(
          open.thermalUnitFor2510Integral,
          `Thermal Unit ${open.thermalUnitFor2510Integral} for 2510 Starter`,
          'thermal-unit',
          'overload',
        );
        contactor = manualStarter;
        overloadRelay = thermalUnit;
        break;
      }
      case 'iec-open':
      case 'iec-enclosed':
        // IEC starters not available for single-phase in this catalog
        return null;
    }
  }

  // Validate we got the minimum required components
  if (!contactor || !overloadRelay) return null;

  return {
    spec: { hp: spec.hp, voltage, country, phase, starterType },
    motorFLA,
    wireSize,
    breakerSize,
    safetySwitchSize,
    components: {
      circuitBreaker,
      contactor,
      overloadRelay,
      disconnectSwitch,
      manualStarter,
      nemaStarter,
      thermalUnit,
      starterKit,
    },
  };
}

/** Available motor spec entry for UI dropdowns */
export interface AvailableMotorSpec {
  hp: string;
  voltage: string;
  country: string;
  phase: string;
  motorFLA: string;
}

/**
 * List all valid HP/voltage/country/phase combinations in the database.
 * Useful for populating UI dropdowns.
 */
export function listAvailableMotorSpecs(): AvailableMotorSpec[] {
  const specs: AvailableMotorSpec[] = [];

  for (const [, region] of Object.entries(database)) {
    for (const [hpKey, data] of Object.entries(region.motorData)) {
      specs.push({
        hp: hpKey.replace(' HP', ''),
        voltage: region.voltage,
        country: region.country,
        phase: region.phase === 'Single Phase' ? 'single' : 'three',
        motorFLA: data.common.motorFLA,
      });
    }
  }

  return specs;
}

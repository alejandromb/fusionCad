/**
 * Motor Starter Data Types
 *
 * Types for looking up motor starter components from the Schneider Electric
 * motor data catalog. Supports USA/Canada, single/three-phase, multiple
 * voltages, and four starter types (IEC open/enclosed, NEMA open/enclosed).
 */

/** Input specification for a motor starter lookup */
export interface MotorSpec {
  /** Motor horsepower: "20", "0.5", "1/2", "3/4", etc. */
  hp: string;
  /** Supply voltage: "115V", "208V", "230V", "460V", "480V", "575V", "600V" */
  voltage: string;
  /** Country code (default: 'USA') */
  country?: 'USA' | 'Canada';
  /** Phase configuration (default: 'three') */
  phase?: 'single' | 'three';
  /** Starter type (default: 'iec-open') */
  starterType?: 'iec-open' | 'iec-enclosed' | 'nema-open' | 'nema-enclosed';
}

/** A single selected component with catalog info */
export interface ComponentSelection {
  partNumber: string;
  manufacturer: string;
  description: string;
  category: string;
  /** Maps to IEC symbol ID for schematic placement */
  symbolCategory: string;
  datasheetUrl?: string;
}

/** Complete result from a motor starter lookup */
export interface MotorStarterResult {
  spec: MotorSpec;
  /** Full-load amperage */
  motorFLA: number;
  /** Wire size in AWG (e.g., "14", "4", "2/0") */
  wireSize: string;
  /** Thermal breaker size in amps */
  breakerSize: number;
  /** Safety switch size in amps ("-" if N/A) */
  safetySwitchSize: string;
  /** Selected components by role */
  components: {
    circuitBreaker: ComponentSelection;
    contactor: ComponentSelection;
    overloadRelay: ComponentSelection;
    disconnectSwitch?: ComponentSelection;
    manualStarter?: ComponentSelection;
    nemaStarter?: ComponentSelection;
    thermalUnit?: ComponentSelection;
    starterKit?: ComponentSelection;
  };
}

/** Raw motor database JSON structure */
export interface MotorDatabaseEntry {
  country: string;
  phase: string;
  voltage: string;
  motorData: Record<string, {
    common: {
      motorFLA: string;
      wireSize: string;
      thermalBreakerSize: string;
      safetySwitchSize: string;
      dualElementTimeDelayFuse?: string;
      breakerCatalogNumber: string;
      NEMAcontactorSize?: string;
      IECContactorAC3Rating?: string;
    };
    enclosed: Record<string, string>;
    open: Record<string, string>;
  }>;
}

export type MotorDatabase = Record<string, MotorDatabaseEntry>;

/**
 * Circuit Blueprint — Declarative circuit template system
 *
 * Blueprints define circuits as data (JSON), not code.
 * The Blueprint Engine instantiates them using existing circuit-helpers primitives.
 */

/** Typed parameter accepted when instantiating a blueprint */
export interface BlueprintParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  description?: string;
  enum?: (string | number)[];
}

/** Position relative to an anchor device, absolute, or pin-aligned */
export type BlueprintPosition =
  | { type: 'absolute'; x: number; y: number }
  | { type: 'relative'; anchor: string; dx?: number; dy?: number }
  | {
      type: 'align-pin';
      anchor: string;       // ref of device to align with
      anchorPin: string;    // pin on anchor device
      selfPin: string;      // pin on this device to align
      dx?: number;          // horizontal offset from anchor
    };

/** A device to place within the blueprint */
export interface BlueprintDevice {
  ref: string;              // local reference: "coil", "contact", "tbIn"
  symbolId: string;         // symbol ID or template: "{{plcSymbolId}}"
  tag?: string;             // tag template: "{{relayTag}}"
  function?: string;        // description: "{{relayTag}} Coil"
  linkedTo?: string;        // ref of device this is a linked representation of
  rung?: number;            // ladder rung number (1-based)
  sheet?: string;           // sheet ref (for multi-sheet blueprints)
  position?: BlueprintPosition;
}

/** A logical wire between two device pins */
export interface BlueprintWire {
  from: { ref: string; pin: string };
  to: { ref: string; pin: string };
}

/** Boundary port — exposed connection point for composition */
export interface BlueprintPort {
  name: string;
  ref: string;              // device ref within this blueprint
  pin: string;              // pin ID on that device
  direction: 'in' | 'out' | 'bidirectional';
}

/** Layout mode */
export type BlueprintLayout =
  | {
      type: 'ladder';
      voltage?: string;
      railLabelL1?: string;
      railLabelL2?: string;
      rungSpacing?: number;
      createRails?: boolean;
    }
  | { type: 'free-form'; paperSize?: string }
  | { type: 'vertical-chain'; startY?: number; gap?: number };

/** Annotation with templated content */
export interface BlueprintAnnotation {
  content: string;          // template: "RELAY OUTPUT {{relayTag}}"
  position: BlueprintPosition;
}

/** Sheet definition for multi-sheet blueprints */
export interface BlueprintSheet {
  ref: string;              // local ref: "power", "outputs"
  name: string;             // template: "DO{{_sheetIndex}} Outputs"
  size?: string;            // "Tabloid", "A3", etc.
}

/** A repeated sub-blueprint (e.g., N relay outputs) */
export interface BlueprintRepeat {
  ref: string;              // ref prefix — instances get "ref_0", "ref_1"
  blueprint: string;        // blueprint ID to repeat
  count: string;            // param name or literal: "{{relayCount}}"
  params?: Record<string, string>;  // param mappings with {{_index}}
  /** How to wire each instance's ports */
  wiring?: Array<{
    port: string;           // port name on each instance
    toRef: string;          // parent device ref to wire to
    toPin: string;          // pin template: "DO{{_index}}"
  }>;
}

/** Child blueprint instantiation */
export interface BlueprintChild {
  ref: string;
  blueprint: string;        // blueprint ID
  params: Record<string, string>;
  sheet?: string;            // sheet ref to place on
  position?: BlueprintPosition;
  condition?: string;        // param name — only instantiate if truthy
}

/** Part assignment (applied after device placement) */
export interface BlueprintPartAssignment {
  ref: string;               // device ref
  manufacturer: string;
  partNumber: string;        // template: "{{partNumber}}"
  description: string;
  category: string;
}

/** Top-level blueprint definition */
export interface Blueprint {
  id: string;
  name: string;
  version: number;
  description?: string;

  params: BlueprintParam[];
  devices: BlueprintDevice[];
  wires: BlueprintWire[];
  ports: BlueprintPort[];

  layout: BlueprintLayout;
  annotations?: BlueprintAnnotation[];
  sheets?: BlueprintSheet[];
  children?: BlueprintChild[];
  repeats?: BlueprintRepeat[];
  partAssignments?: BlueprintPartAssignment[];
}

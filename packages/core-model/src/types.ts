/**
 * Core data model types for fusionCad
 *
 * These types represent the canonical electrical model.
 * The drawing editor is a view over this model.
 */

/**
 * Stable unique identifier for all entities
 */
export type EntityId = string; // ULID format

/**
 * Base entity interface - all entities have a stable ID
 */
export interface Entity {
  id: EntityId;
  createdAt: number; // timestamp
  modifiedAt: number; // timestamp
}

/**
 * Part - Catalog item (manufacturer, part number, attributes)
 */
export interface Part extends Entity {
  type: 'part';
  manufacturer: string;
  partNumber: string;
  description: string;
  category: string; // e.g., 'contactor', 'button', 'relay', 'plc'
  attributes: Record<string, unknown>; // flexible attributes
}

/**
 * Device - A project instance of a part
 */
export interface Device extends Entity {
  type: 'device';
  tag: string; // e.g., 'K1', 'S1', 'X1'
  function: string; // human description
  location?: string; // optional location code
  partId?: EntityId; // reference to Part (optional - can be unassigned)
  sheetId: EntityId; // which sheet/page this device appears on
}

/**
 * Pin types for electrical connectivity
 */
export type PinType =
  | 'input'
  | 'output'
  | 'passive'
  | 'power'
  | 'ground'
  | 'pe'; // protective earth

/**
 * SymbolDefinition - Reusable symbol geometry + logical pins
 */
export interface SymbolDefinition extends Entity {
  type: 'symbol-definition';
  name: string;
  category: string;
  pins: SymbolPin[];
  geometry: unknown; // placeholder - will define rendering data later
}

/**
 * Pin definition within a symbol
 */
export interface SymbolPin {
  id: string; // local ID within symbol
  name: string; // e.g., 'A1', 'A2', 'NO', 'NC'
  pinType: PinType;
  position: { x: number; y: number }; // relative to symbol origin
}

/**
 * SymbolInstance - Placed symbol tied to a device
 */
export interface SymbolInstance extends Entity {
  type: 'symbol-instance';
  symbolDefinitionId: EntityId;
  deviceId: EntityId;
  sheetId: EntityId;
  position: { x: number; y: number };
  rotation: number; // degrees
}

/**
 * PinInstance - Pin on a symbol instance
 * Generated from SymbolInstance + SymbolDefinition
 */
export interface PinInstance extends Entity {
  type: 'pin-instance';
  symbolInstanceId: EntityId;
  pinId: string; // references SymbolPin.id
  pinType: PinType;
  nodeId?: EntityId; // connected to which node (if wired)
}

/**
 * Node - Connection point in the electrical graph
 */
export interface Node extends Entity {
  type: 'node';
  netId?: EntityId; // which net this node belongs to
  sheetId: EntityId;
}

/**
 * WireSegment - Polyline segment connecting nodes
 */
export interface WireSegment extends Entity {
  type: 'wire-segment';
  netId: EntityId;
  sheetId: EntityId;
  points: Array<{ x: number; y: number }>;
  fromNodeId: EntityId;
  toNodeId: EntityId;
}

/**
 * Net - Electrical net/potential
 */
export interface Net extends Entity {
  type: 'net';
  name?: string; // e.g., '24VDC', '0V', 'PE'
  netType: 'power' | 'signal' | 'ground' | 'pe';
  potential?: string; // optional potential group
}

/**
 * Terminal - Connection point on a terminal strip
 */
export interface Terminal extends Entity {
  type: 'terminal';
  deviceId: EntityId; // which terminal strip device (e.g., X1)
  index: number; // terminal position (1, 2, 3, ...)
  netId?: EntityId; // connected to which net
  label?: string; // optional label
}

/**
 * Sheet - A page in the project
 */
export interface Sheet extends Entity {
  type: 'sheet';
  name: string;
  number: number;
  size: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter';
}

/**
 * Project - Top-level container
 */
export interface Project extends Entity {
  type: 'project';
  name: string;
  description?: string;
  schemaVersion: string;
}

/**
 * Union type of all entities
 */
export type AnyEntity =
  | Part
  | Device
  | SymbolDefinition
  | SymbolInstance
  | PinInstance
  | Node
  | WireSegment
  | Net
  | Terminal
  | Sheet
  | Project;

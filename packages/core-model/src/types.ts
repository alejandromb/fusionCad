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
  // Electrical specifications (all optional for backward compatibility)
  voltage?: string;              // e.g., '24VDC', '120VAC'
  current?: string;              // e.g., '10A'
  powerRating?: string;          // e.g., '5W'
  temperatureRange?: string;     // e.g., '-20°C to +60°C'
  certifications?: string[];     // e.g., ['UL', 'CE', 'CSA']
  datasheetUrl?: string;
  supplierUrls?: Record<string, string>;  // e.g., { 'Mouser': 'https://...' }
  symbolCategory?: string;       // schematic symbol category (e.g., 'contactor', 'circuit-breaker')
  layoutSymbolId?: string;       // panel layout symbol ID (physical footprint for panel view)
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
  /**
   * For terminal levels: links this device (octagon) to its parent Terminal.
   * Multiple devices can share the same terminalId (e.g., dual-level = 2 devices, 1 terminal).
   * BOM groups by Terminal, not by Device.
   */
  terminalId?: EntityId;
  /**
   * For terminal levels: which level this device represents (0 = top, 1 = middle, 2 = bottom).
   * Only meaningful when terminalId is set.
   */
  terminalLevel?: number;
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
 * Symbol geometry data - bounding box dimensions
 */
export interface SymbolGeometryData {
  width: number;
  height: number;
}

/**
 * SVG path element for symbol rendering
 */
export interface SymbolPath {
  d: string; // SVG path data (M, L, A, C, Q, Z commands)
  stroke?: boolean; // default true
  fill?: boolean; // default false
  strokeWidth?: number; // default 2
}

/**
 * Typed geometric primitive for symbol rendering.
 *
 * Instead of opaque SVG path strings, primitives carry semantic type info
 * (rect, circle, line, etc.) enabling native canvas/SVG rendering and
 * better editor round-tripping.
 *
 * Inspired by EPLAN's typed primitives (O31=Line, O32=Circle, O34=Rectangle)
 * and ODB++ typed feature records.
 */
export type SymbolPrimitive =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth?: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; stroke?: string; fill?: string; strokeWidth?: number; rx?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; stroke?: string; fill?: string; strokeWidth?: number }
  | { type: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number; stroke?: string; strokeWidth?: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; stroke?: string; fill?: string; strokeWidth?: number }
  | { type: 'polyline'; points: Array<{ x: number; y: number }>; closed?: boolean; stroke?: string; fill?: string; strokeWidth?: number }
  | { type: 'text'; x: number; y: number; content: string; fontSize?: number; fontWeight?: string; textAnchor?: string }
  | { type: 'path'; d: string; stroke?: string; fill?: string; strokeWidth?: number };

/**
 * Text element for symbol rendering
 */
export interface SymbolText {
  content: string;
  x: number;
  y: number;
  fontSize?: number; // default 20
  fontWeight?: 'normal' | 'bold'; // default 'bold'
}

/**
 * Symbol variant - alternative visual representation for IEC 60617 compliance.
 * Many IEC symbols have multiple valid representations (e.g., NO contact has
 * IEC standard, ANSI, simplified forms). Users can choose their preferred style.
 */
export interface SymbolVariant {
  variantId: string;        // e.g., 'iec-standard', 'ansi', 'simplified'
  name: string;             // Human-readable name
  paths: SymbolPath[];      // SVG paths for this variant
  primitives?: SymbolPrimitive[]; // Typed primitives (preferred over paths)
  texts?: SymbolText[];     // Optional variant-specific texts
  description?: string;     // When to use this variant
}

/**
 * SymbolDefinition - Reusable symbol geometry + logical pins
 *
 * Supports multi-variant rendering for IEC 60617 compliance.
 * The default paths/texts are used when no variant is selected.
 * Variants share the same pins and geometry but have different visuals.
 */
export interface SymbolDefinition extends Entity {
  type: 'symbol-definition';
  name: string;
  category: string;
  pins: SymbolPin[];
  geometry: SymbolGeometryData;
  paths?: SymbolPath[]; // Default SVG-based rendering (legacy)
  primitives?: SymbolPrimitive[]; // Typed geometric primitives (preferred)
  texts?: SymbolText[]; // Default text elements

  /**
   * Tag prefix for device naming (e.g., 'K' for contactors, 'PS' for power supplies).
   * Used when placing a device to generate tags like K1, K2, PS1, PS2.
   * If not specified, defaults to 'D'.
   */
  tagPrefix?: string;

  /**
   * Alternative visual representations.
   * All variants share the same pins and geometry.
   * User can select which variant to use per symbol or globally.
   */
  variants?: SymbolVariant[];

  /**
   * Source of this symbol (for tracking imports).
   * e.g., 'builtin', 'radica-software', 'kicad-import', 'custom'
   */
  source?: string;

  /**
   * Symbol standard this definition conforms to.
   * e.g., 'IEC 60617', 'ANSI/NEMA', 'common' (appears under all standards)
   */
  standard?: string;

  /**
   * IEC 60617 reference (if applicable).
   * e.g., 'IEC 60617-7:2012, Symbol 07-13-01'
   */
  iecReference?: string;
}

/**
 * Pin direction - which side of the symbol the pin faces
 */
export type PinDirection = 'left' | 'right' | 'top' | 'bottom';

/**
 * Pin definition within a symbol
 */
export interface SymbolPin {
  id: string; // local ID within symbol
  name: string; // e.g., 'A1', 'A2', 'NO', 'NC'
  pinType: PinType;
  position: { x: number; y: number }; // relative to symbol origin
  direction: PinDirection; // which side of the symbol this pin faces
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
 * Terminal Level - A single connection level within a terminal block
 *
 * Real-world terminals have 1-3 levels:
 * - Single-level: 1 octagon, 2 pins (top/bottom) — standard feed-through
 * - Dual-level: 2 octagons stacked, 4 pins — power + return or signal pairs
 * - Triple-level: 3 octagons stacked, 6 pins — analog signal + return + shield/ground
 */
export interface TerminalLevel {
  levelIndex: number; // 0 = top, 1 = middle, 2 = bottom
  netId?: EntityId;
  wireNumberIn?: string; // wire arriving from upstream
  wireNumberOut?: string; // wire leaving to downstream
  crossReference?: {
    sheetId: EntityId;
    deviceTag: string;
    pinId: string;
  };
}

/**
 * Terminal - Individual terminal block on a DIN rail strip
 *
 * Each Terminal = 1 physical part on a DIN rail, belonging to a strip (e.g., X1).
 * The strip tag groups terminals logically. Each terminal has its own BOM entry.
 *
 * Terminal strip X1 (logical group on a DIN rail):
 *   X1:1 — Single-level terminal (1 octagon, 2 pins)
 *   X1:2 — Single-level terminal
 *   X1:3 — Dual-level terminal (2 octagons stacked, 4 pins)
 *   X1:4 — Triple-level terminal (3 octagons stacked, 6 pins)
 *   X1:5 — Fuse terminal (octagon with fuse element)
 *   X1:6 — Ground terminal (octagon with PE symbol)
 */
export interface Terminal extends Entity {
  type: 'terminal';
  stripTag: string; // which strip this belongs to, e.g., 'X1'
  index: number; // position on the strip (1, 2, 3, ...)
  label?: string; // custom label override
  terminalType: 'single' | 'dual' | 'triple' | 'fuse' | 'ground' | 'disconnect';
  levels: TerminalLevel[]; // 1, 2, or 3 levels depending on type
  partId?: EntityId; // link to Part for BOM (each terminal = 1 part)
  sheetId: EntityId;
  deviceId?: EntityId; // optional link to Device for backward compat
}

/**
 * Annotation - Text, notes, title block elements on a sheet
 */
export interface Annotation extends Entity {
  type: 'annotation';
  sheetId: EntityId;
  annotationType: 'text' | 'note' | 'title-block' | 'border';
  position: { x: number; y: number };
  content: string;
  style?: {
    fontSize?: number;
    fontWeight?: string;
    textAlign?: string;
    rotation?: number;
    width?: number;
    height?: number;
  };
}

/**
 * Title block data for a sheet
 */
export interface TitleBlockData {
  drawingNumber: string;
  revision: string;
  title: string;
  date: string;
  drawnBy: string;
  company?: string;
  sheetOf?: string;
}

/**
 * Sheet - A page in the project
 */
export interface Sheet extends Entity {
  type: 'sheet';
  name: string;
  number: number;
  size: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'ANSI-D';
  titleBlock?: TitleBlockData;
}

/**
 * CrossReference - Links between related devices across sheets
 */
export interface CrossReference extends Entity {
  type: 'cross-reference';
  sourceDeviceTag: string;
  sourcePinId: string;
  sourceSheetId: EntityId;
  targetDeviceTag: string;
  targetPinId: string;
  targetSheetId: EntityId;
  referenceType: 'coil-contact' | 'device-appearance' | 'terminal-terminal';
}

/**
 * PLCRack - PLC hardware rack/chassis
 */
export interface PLCRack extends Entity {
  type: 'plc-rack';
  rackNumber: number;
  projectId: EntityId;
}

/**
 * PLCModule - Module in a PLC rack slot
 */
export interface PLCModule extends Entity {
  type: 'plc-module';
  rackId: EntityId;
  slotNumber: number;
  moduleType: 'DI' | 'DO' | 'AI' | 'AO' | 'CPU' | 'COMM' | 'PS';
  channelCount: number;
  partId?: EntityId;
  deviceId: EntityId; // Link to the Device on the schematic
}

/**
 * PLCChannel - Individual I/O channel on a PLC module
 */
export interface PLCChannel extends Entity {
  type: 'plc-channel';
  moduleId: EntityId;
  channelNumber: number;
  address: string; // e.g., "I:1/0", "O:2/3"
  signalName?: string; // e.g., "LSL-100 High Level"
  description?: string;
  netId?: EntityId;
  terminalRef?: string; // e.g., "X1:3"
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
  | Annotation
  | CrossReference
  | PLCRack
  | PLCModule
  | PLCChannel
  | Project;

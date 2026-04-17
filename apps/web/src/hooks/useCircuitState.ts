/**
 * Circuit state hook - CRUD operations, undo/redo
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { generateId, getSymbolById, resolveSymbol, type Device, type Sheet, type Annotation, type Part, type LadderBlock, type AnyDiagramBlock, LADDER_LAYOUT_PRESETS, DEFAULT_LADDER_MM, type SheetLadderLayout } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import type { CircuitData, Connection } from '../renderer/circuit-renderer';
import type { Point, DeviceTransform } from '../renderer/types';
import { getSymbolGeometry } from '../renderer/symbols';
import {
  SYMBOL_CATEGORIES,
  MAX_HISTORY_SIZE,
  snapToGrid,
  type SymbolCategory,
  type PinHit,
  type HistorySnapshot,
} from '../types';

export interface UseCircuitStateReturn {
  // State
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showPinLabels: boolean;
  setShowPinLabels: (show: boolean) => void;
  showDescriptions: boolean;
  showPartNumbers: boolean;
  setShowDescriptions: (show: boolean) => void;
  setShowPartNumbers: (show: boolean) => void;

  // Sheet management
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  sheets: Sheet[];
  addSheet: () => void;
  duplicateSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, newName: string) => void;
  deleteSheet: (sheetId: string) => void;
  reorderSheets: (fromIndex: number, toIndex: number) => void;
  updateSheet: (sheetId: string, updates: Partial<Pick<Sheet, 'titleBlock' | 'size'>>) => void;
  setSheetLayout: (sheetId: string, layout: SheetLadderLayout) => void;
  getSheetLayout: (sheetId: string) => SheetLadderLayout;
  setRungSpacing: (sheetId: string, spacing: number) => void;
  getRungSpacing: (sheetId: string) => number;
  setPanelScale: (sheetId: string, scale: number) => void;
  getPanelScale: (sheetId: string) => number;

  // History
  history: HistorySnapshot[];
  historyIndex: number;
  pushToHistory: () => void;
  pushToHistoryRef: React.MutableRefObject<() => void>;
  undoRef: React.MutableRefObject<() => void>;
  redoRef: React.MutableRefObject<() => void>;
  isUndoRedoRef: React.MutableRefObject<boolean>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Circuit operations
  getAllPositions: () => Map<string, Point>;
  placeSymbol: (worldX: number, worldY: number, category: SymbolCategory, partData?: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;
  createWireConnection: (fromPin: PinHit, toPin: PinHit, waypoints?: Point[]) => void;
  deleteDevices: (deviceIds: string[]) => void;
  deleteWire: (connectionIndex: number) => void;
  addWaypoint: (connectionIndex: number, segmentIndex: number, point: Point) => void;
  moveWaypoint: (connectionIndex: number, waypointIndex: number, point: Point) => void;
  removeWaypoint: (connectionIndex: number, waypointIndex: number) => void;
  replaceWaypoints: (connectionIndex: number, waypoints: Point[] | undefined) => void;
  reconnectWire: (connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => void;
  updateWireNumber: (connectionIndex: number, wireNumber: string) => void;
  updateWireField: (connectionIndex: number, field: 'wireGauge' | 'wireType' | 'wireColor' | 'wireSpecPosition', value: unknown) => void;

  // T-Junction
  connectToWire: (connectionIndex: number, worldX: number, worldY: number, startPin?: PinHit | null) => string | null;

  // Rotation & mirror
  deviceTransforms: Map<string, DeviceTransform>;
  setDeviceTransforms: React.Dispatch<React.SetStateAction<Map<string, DeviceTransform>>>;
  rotateDevice: (deviceId: string, direction: 'cw' | 'ccw') => void;
  rotateSelectedDevices: (direction: 'cw' | 'ccw') => void;
  mirrorDevice: (deviceId: string) => void;
  toggleDashed: (deviceId: string) => void;

  // Alignment
  alignSelectedDevices: (direction: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;

  // Annotations
  addAnnotation: (worldX: number, worldY: number, content: string) => void;
  addShapeAnnotation: (annotationType: 'rectangle' | 'circle' | 'line' | 'arrow', position: { x: number; y: number }, style: Annotation['style']) => void;
  addImageAnnotation: (worldX: number, worldY: number, imageData: string, widthMm: number, heightMm: number) => void;
  updateAnnotation: (annotationId: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style' | 'groupId'>>) => void;
  moveAnnotations: (ids: string[], dx: number, dy: number) => void;
  deleteAnnotation: (annotationId: string) => void;

  // Device update (by device ID)
  updateDevice: (deviceId: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location' | 'sizeOverride' | 'labelOffsets'>>) => void;
  linkDevicesAsSamePart: (deviceIds: string[]) => void;
  unlinkDevices: (deviceIds: string[]) => void;
  /**
   * Set or clear the per-device tag label offset (world-space mm delta from
   * the default anchor). Passing undefined or a near-zero offset clears the
   * field so the device returns to its category default. No history push —
   * callers should push ONCE at the start of a drag.
   */
  setDeviceTagOffset: (deviceId: string, offset: { x: number; y: number } | undefined) => void;

  // Part assignment (by device ID)
  assignPart: (deviceId: string, partData: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;

  // Selection
  selectedDevices: string[];
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWireIndex: number | null;
  setSelectedWireIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectedAnnotationIds: string[];
  setSelectedAnnotationIds: (ids: string[]) => void;
  /** Clear all selections (devices, wires, annotations) atomically. */
  clearAllSelections: () => void;
  selectAnnotation: (id: string | null, addToSelection?: boolean) => void;
}

const DEFAULT_SHEET_ID = 'sheet-1';

function getOrCreateSheets(circuit: CircuitData | null): Sheet[] {
  if (circuit?.sheets && circuit.sheets.length > 0) {
    return circuit.sheets;
  }
  // Backward compat: create default sheet
  const now = Date.now();
  return [{
    id: DEFAULT_SHEET_ID,
    type: 'sheet',
    name: 'Sheet 1',
    number: 1,
    size: 'Tabloid',
    titleBlock: {
      title: 'Sheet 1',
      drawingNumber: '',
      date: new Date().toISOString().slice(0, 10),
      revision: 'A',
      drawnBy: '',
    },
    createdAt: now,
    modifiedAt: now,
  }];
}

export function useCircuitState(
  circuit: CircuitData | null,
  setCircuit: React.Dispatch<React.SetStateAction<CircuitData | null>>,
  devicePositions: Map<string, Point>,
  setDevicePositions: React.Dispatch<React.SetStateAction<Map<string, Point>>>
): UseCircuitStateReturn {
  const [debugMode, setDebugMode] = useState(false);
  const [showGrid, setShowGridRaw] = useState(() => localStorage.getItem('fusionCad_showGrid') !== 'false');
  const setShowGrid = useCallback((v: boolean) => { setShowGridRaw(v); localStorage.setItem('fusionCad_showGrid', String(v)); }, []);
  const [showPinLabels, setShowPinLabelsRaw] = useState(() => localStorage.getItem('fusionCad_showPinLabels') !== 'false');
  const setShowPinLabels = useCallback((v: boolean) => { setShowPinLabelsRaw(v); localStorage.setItem('fusionCad_showPinLabels', String(v)); }, []);
  const [showDescriptions, setShowDescriptionsRaw] = useState(() => localStorage.getItem('fusionCad_showDescriptions') !== 'false');
  const setShowDescriptions = useCallback((v: boolean) => { setShowDescriptionsRaw(v); localStorage.setItem('fusionCad_showDescriptions', String(v)); }, []);
  const [showPartNumbers, setShowPartNumbersRaw] = useState(() => localStorage.getItem('fusionCad_showPartNumbers') !== 'false');
  const setShowPartNumbers = useCallback((v: boolean) => { setShowPartNumbersRaw(v); localStorage.setItem('fusionCad_showPartNumbers', String(v)); }, []);
  const [selectedDevices, setSelectedDevicesRaw] = useState<string[]>([]);
  const [selectedWireIndex, setSelectedWireIndex] = useState<number | null>(null);
  const [activeSheetId, setActiveSheetIdRaw] = useState<string>(DEFAULT_SHEET_ID);
  // Derive deviceTransforms from persisted circuit.transforms (single source of truth)
  const deviceTransforms = useMemo(() => {
    const map = new Map<string, DeviceTransform>();
    if (circuit?.transforms) {
      for (const [id, t] of Object.entries(circuit.transforms)) {
        map.set(id, { rotation: t.rotation, mirrorH: t.mirrorH ?? false, dashed: t.dashed ?? false });
      }
    }
    return map;
  }, [circuit?.transforms]);

  // Compat setter that writes through to circuit.transforms
  const setDeviceTransforms: React.Dispatch<React.SetStateAction<Map<string, DeviceTransform>>> = useCallback((action) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const currentMap = new Map<string, DeviceTransform>();
      if (prev.transforms) {
        for (const [id, t] of Object.entries(prev.transforms)) {
          currentMap.set(id, { rotation: t.rotation, mirrorH: t.mirrorH ?? false, dashed: t.dashed ?? false });
        }
      }
      const nextMap = typeof action === 'function' ? action(currentMap) : action;
      const newTransforms: Record<string, { rotation: number; mirrorH?: boolean; dashed?: boolean }> = {};
      for (const [id, t] of nextMap) {
        newTransforms[id] = { rotation: t.rotation, mirrorH: t.mirrorH || undefined, dashed: t.dashed || undefined };
      }
      return { ...prev, transforms: newTransforms };
    });
  }, [setCircuit]);

  const [selectedAnnotationIds, setSelectedAnnotationIdsRaw] = useState<string[]>([]);

  // Direct setter — does NOT auto-clear annotations. Mixed selection is allowed.
  // Single-click selection paths explicitly clear annotations when needed.
  const setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>> = setSelectedDevicesRaw;

  /**
   * Clear ALL selections (devices, wires, annotations) atomically.
   * Use this whenever you need a clean slate — sheet switches, undo/redo, etc.
   * Prevents the "stale annotation selection across sheets" class of bugs.
   */
  const clearAllSelections = useCallback(() => {
    setSelectedDevicesRaw([]);
    setSelectedWireIndex(null);
    setSelectedAnnotationIdsRaw([]);
  }, []);

  /**
   * Switch active sheet and atomically clear all selections.
   * Selections never carry across sheets.
   */
  const setActiveSheetId = useCallback((id: string) => {
    setActiveSheetIdRaw(id);
    setSelectedDevicesRaw([]);
    setSelectedWireIndex(null);
    setSelectedAnnotationIdsRaw([]);
  }, []);

  const selectAnnotation = useCallback((id: string | null, addToSelection = false) => {
    if (!id) {
      setSelectedAnnotationIdsRaw([]);
      return;
    }
    // Expand group: if the annotation has a groupId, select all in group
    const ann = circuit?.annotations?.find(a => a.id === id);
    const groupMembers = ann?.groupId
      ? (circuit?.annotations || []).filter(a => a.groupId === ann.groupId).map(a => a.id)
      : [id];

    if (addToSelection) {
      setSelectedAnnotationIdsRaw(prev => {
        const inSelection = groupMembers.every(m => prev.includes(m));
        if (inSelection) return prev.filter(i => !groupMembers.includes(i)); // toggle off
        return [...new Set([...prev, ...groupMembers])];
      });
      // When adding to selection, do NOT clear devices/wires — preserve mixed selection
    } else {
      setSelectedAnnotationIdsRaw(groupMembers);
      // When replacing selection (single click), clear devices/wires
      setSelectedDevicesRaw([]);
      setSelectedWireIndex(null);
    }
  }, [circuit]);

  // Get sheets from circuit data (backward-compatible)
  const sheets = getOrCreateSheets(circuit);

  // Ensure activeSheetId is valid
  const validActiveSheetId = sheets.find(s => s.id === activeSheetId) ? activeSheetId : sheets[0]?.id || DEFAULT_SHEET_ID;
  if (validActiveSheetId !== activeSheetId) {
    // Sync if the current active sheet was deleted (render-time fixup,
    // use raw setter — clearing selections happens via the user-facing wrapper)
    setActiveSheetIdRaw(validActiveSheetId);
  }

  const addSheet = useCallback(() => {
    if (!circuit) return;
    pushToHistoryRef.current();

    const now = Date.now();
    const currentSheets = getOrCreateSheets(circuit);
    const nextNumber = Math.max(0, ...currentSheets.map(s => s.number)) + 1;
    const newSheet: Sheet = {
      id: generateId(),
      type: 'sheet',
      name: `Sheet ${nextNumber}`,
      number: nextNumber,
      size: 'Tabloid',
      titleBlock: {
        title: `Sheet ${nextNumber}`,
        drawingNumber: '',
        date: new Date().toISOString().slice(0, 10),
        revision: 'A',
        drawnBy: '',
      },
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: [...getOrCreateSheets(prev), newSheet],
      };
    });
    setActiveSheetId(newSheet.id);
    clearAllSelections();
  }, [circuit, setCircuit, clearAllSelections]);

  const duplicateSheet = useCallback((sourceSheetId: string) => {
    if (!circuit) return;
    pushToHistoryRef.current();
    const now = Date.now();
    const sourceSheet = getOrCreateSheets(circuit).find(s => s.id === sourceSheetId);
    if (!sourceSheet) return;

    const newSheetId = generateId();
    const idMap = new Map<string, string>();

    const clonedSheet: Sheet = {
      ...sourceSheet,
      id: newSheetId,
      name: `${sourceSheet.name} (Copy)`,
      number: Math.max(0, ...getOrCreateSheets(circuit).map(s => s.number)) + 1,
      createdAt: now,
      modifiedAt: now,
    };

    const sourceDevices = circuit.devices.filter(d => d.sheetId === sourceSheetId);
    const clonedDevices = sourceDevices.map(d => {
      const newId = generateId();
      idMap.set(d.id, newId);
      return { ...d, id: newId, sheetId: newSheetId, createdAt: now, modifiedAt: now };
    });

    const sourceDeviceIds = new Set(sourceDevices.map(d => d.id));
    const clonedConnections = circuit.connections
      .filter(c => {
        const fromId = c.fromDeviceId || circuit.devices.find(d => d.tag === c.fromDevice)?.id;
        const toId = c.toDeviceId || circuit.devices.find(d => d.tag === c.toDevice)?.id;
        return fromId && toId && sourceDeviceIds.has(fromId) && sourceDeviceIds.has(toId);
      })
      .map(c => ({
        ...c,
        netId: generateId(),
        sheetId: newSheetId,
        fromDeviceId: idMap.get(c.fromDeviceId!) || c.fromDeviceId,
        toDeviceId: idMap.get(c.toDeviceId!) || c.toDeviceId,
      }));

    const clonedAnnotations = (circuit.annotations || [])
      .filter(a => a.sheetId === sourceSheetId)
      .map(a => ({ ...a, id: generateId(), sheetId: newSheetId, createdAt: now, modifiedAt: now }));

    const clonedRungs = (circuit.rungs || [])
      .filter(r => r.sheetId === sourceSheetId)
      .map(r => ({
        ...r,
        id: generateId(),
        sheetId: newSheetId,
        deviceIds: r.deviceIds.map(did => idMap.get(did) || did),
        blockId: undefined,
        createdAt: now,
        modifiedAt: now,
      }));

    const newPositions = new Map<string, { x: number; y: number }>();
    const newTransforms = { ...circuit.transforms };
    for (const [oldId, newId] of idMap) {
      const pos = devicePositions.get(oldId) || (circuit as any).positions?.[oldId];
      if (pos) newPositions.set(newId, { ...pos });
      const transform = circuit.transforms?.[oldId];
      if (transform) newTransforms[newId] = { ...transform };
    }

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sheets: [...getOrCreateSheets(prev), clonedSheet],
        devices: [...prev.devices, ...clonedDevices],
        connections: [...prev.connections, ...clonedConnections],
        nets: [...prev.nets, ...clonedConnections.map(c => ({
          id: c.netId, type: 'net' as const, name: `NET_${prev.nets.length + 1}`,
          netType: 'signal', createdAt: now, modifiedAt: now,
        }))],
        annotations: [...(prev.annotations || []), ...clonedAnnotations],
        rungs: [...(prev.rungs || []), ...clonedRungs],
        transforms: newTransforms,
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const [id, pos] of newPositions) next.set(id, pos);
      return next;
    });

    setActiveSheetId(newSheetId);
    clearAllSelections();
  }, [circuit, setCircuit, devicePositions, setDevicePositions, clearAllSelections]);

  const renameSheet = useCallback((sheetId: string, newName: string) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const currentSheets = getOrCreateSheets(prev);
      return {
        ...prev,
        sheets: currentSheets.map(s =>
          s.id === sheetId ? { ...s, name: newName, modifiedAt: Date.now() } : s
        ),
      };
    });
  }, [setCircuit]);

  const deleteSheet = useCallback((sheetId: string) => {
    if (!circuit) return;
    const currentSheets = getOrCreateSheets(circuit);
    if (currentSheets.length <= 1) return; // Can't delete last sheet

    pushToHistoryRef.current();

    setCircuit(prev => {
      if (!prev) return prev;
      const prevSheets = getOrCreateSheets(prev);
      const devicesOnSheet = new Set(prev.devices.filter(d => d.sheetId === sheetId).map(d => d.id));
      return {
        ...prev,
        sheets: prevSheets.filter(s => s.id !== sheetId),
        // Remove devices on this sheet
        devices: prev.devices.filter(d => d.sheetId !== sheetId),
        // Remove connections that reference devices on this sheet
        connections: prev.connections.filter(c => {
          if (c.sheetId === sheetId) return false;
          const fromId = c.fromDeviceId || prev.devices.find(d => d.tag === c.fromDevice)?.id;
          const toId = c.toDeviceId || prev.devices.find(d => d.tag === c.toDevice)?.id;
          if (fromId && devicesOnSheet.has(fromId)) return false;
          if (toId && devicesOnSheet.has(toId)) return false;
          return true;
        }),
      };
    });

    // Switch to another sheet if active was deleted
    if (activeSheetId === sheetId) {
      const remaining = currentSheets.filter(s => s.id !== sheetId);
      if (remaining.length > 0) {
        setActiveSheetId(remaining[0].id);
      }
    }
    clearAllSelections();
  }, [circuit, activeSheetId, setCircuit, clearAllSelections]);

  const reorderSheets = useCallback((fromIndex: number, toIndex: number) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const sheets = [...getOrCreateSheets(prev)];
      const [moved] = sheets.splice(fromIndex, 1);
      sheets.splice(toIndex, 0, moved);
      // Update sheet numbers to match new order
      const renumbered = sheets.map((s, i) => ({ ...s, number: i + 1 }));
      return { ...prev, sheets: renumbered };
    });
  }, [setCircuit]);

  // Fields that should be shared across all sheets (not per-sheet)
  const SHARED_TB_FIELDS = ['drawnBy', 'company', 'addressLine1', 'addressLine2', 'phone', 'logoData', 'date', 'revision', 'projectNumber'] as const;

  const updateSheet = useCallback((sheetId: string, updates: Partial<Pick<Sheet, 'titleBlock' | 'size'>>) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const currentSheets = getOrCreateSheets(prev);

      // Extract shared fields from the title block update
      const tbUpdate = updates.titleBlock;
      const sharedUpdates: Record<string, unknown> = {};
      if (tbUpdate) {
        for (const key of SHARED_TB_FIELDS) {
          if (key in tbUpdate) {
            sharedUpdates[key] = (tbUpdate as Record<string, unknown>)[key];
          }
        }
      }
      const hasSharedUpdates = Object.keys(sharedUpdates).length > 0;

      return {
        ...prev,
        sheets: currentSheets.map(s => {
          const isTarget = s.id === sheetId;
          // Apply shared title block fields to ALL sheets
          const sharedTbMerge = hasSharedUpdates
            ? { titleBlock: { ...s.titleBlock, ...sharedUpdates } }
            : {};
          if (isTarget) {
            return {
              ...s,
              ...(updates.size !== undefined ? { size: updates.size } : {}),
              ...(tbUpdate !== undefined
                ? { titleBlock: { ...s.titleBlock, ...tbUpdate } }
                : {}),
              modifiedAt: Date.now(),
            };
          }
          // Non-target sheets: only apply shared fields
          if (hasSharedUpdates) {
            return { ...s, ...sharedTbMerge, modifiedAt: Date.now() };
          }
          return s;
        }),
      };
    });
  }, [setCircuit]);

  const getSheetLayout = useCallback((sheetId: string): SheetLadderLayout => {
    if (!circuit) return 'no-rungs';
    const sheet = (circuit.sheets || []).find(s => s.id === sheetId);
    if (sheet?.diagramType === 'panel-layout') return 'panel-layout';
    const blocks = (circuit.blocks || []).filter(b => b.sheetId === sheetId && b.blockType === 'ladder');
    if (blocks.length === 0) return 'no-rungs';
    if (blocks.length >= 2) return 'dual-column';
    return 'single-column';
  }, [circuit]);

  const setSheetLayout = useCallback((sheetId: string, layout: SheetLadderLayout) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const now = Date.now();
      // Remove existing ladder blocks for this sheet
      const otherBlocks = (prev.blocks || []).filter(
        b => !(b.sheetId === sheetId && b.blockType === 'ladder')
      );

      if (layout === 'panel-layout') {
        // Set sheet to panel-layout type, remove ladder blocks
        const sheets = (prev.sheets || []).map(s =>
          s.id === sheetId ? { ...s, diagramType: 'panel-layout' as const, modifiedAt: now } : s
        );
        return { ...prev, blocks: otherBlocks, sheets };
      }

      if (layout === 'no-rungs') {
        // Also update sheet diagramType
        const sheets = (prev.sheets || []).map(s =>
          s.id === sheetId ? { ...s, diagramType: undefined as any, modifiedAt: now } : s
        );
        return { ...prev, blocks: otherBlocks, sheets };
      }

      // Update sheet diagramType to 'ladder'
      const sheets = (prev.sheets || []).map(s =>
        s.id === sheetId ? { ...s, diagramType: 'ladder' as const, modifiedAt: now } : s
      );

      const preset = LADDER_LAYOUT_PRESETS[layout];
      const sheet = (prev.sheets || []).find(s => s.id === sheetId);
      const sheetName = sheet?.name ?? 'Sheet';

      const newBlocks: AnyDiagramBlock[] = preset.columns.map((col, idx) => {
        const suffix = preset.columns.length > 1 ? ` (Col ${idx + 1})` : '';
        return {
          id: generateId(),
          type: 'block' as const,
          blockType: 'ladder' as const,
          sheetId,
          name: `${sheetName} Ladder${suffix}`,
          position: { x: col.blockOffsetX, y: 0 },
          ladderConfig: {
            ...DEFAULT_LADDER_CONFIG,
            railL1X: col.railL1X,
            railL2X: col.railL2X,
          },
          createdAt: now,
          modifiedAt: now,
        } as LadderBlock;
      });

      return { ...prev, blocks: [...otherBlocks, ...newBlocks], sheets };
    });
  }, [setCircuit]);

  const getRungSpacing = useCallback((sheetId: string): number => {
    if (!circuit) return DEFAULT_LADDER_CONFIG.rungSpacing;
    const block = (circuit.blocks || []).find(b => b.sheetId === sheetId && b.blockType === 'ladder') as LadderBlock | undefined;
    return block?.ladderConfig?.rungSpacing ?? DEFAULT_LADDER_CONFIG.rungSpacing;
  }, [circuit]);

  const setRungSpacing = useCallback((sheetId: string, spacing: number) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const blocks = (prev.blocks || []).map(b => {
        if (b.sheetId === sheetId && b.blockType === 'ladder') {
          const lb = b as LadderBlock;
          return { ...lb, ladderConfig: { ...lb.ladderConfig, rungSpacing: spacing }, modifiedAt: Date.now() };
        }
        return b;
      });
      return { ...prev, blocks };
    });
  }, [setCircuit]);

  const getPanelScale = useCallback((sheetId: string): number => {
    if (!circuit) return 1;
    const sheet = (circuit.sheets || []).find(s => s.id === sheetId);
    return sheet?.panelScale ?? 1;
  }, [circuit]);

  const setPanelScale = useCallback((sheetId: string, scale: number) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const sheets = (prev.sheets || []).map(s =>
        s.id === sheetId ? { ...s, panelScale: scale, modifiedAt: Date.now() } : s
      );
      return { ...prev, sheets };
    });
  }, [setCircuit]);

  // Undo/Redo history state
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUndoRedoRef = useRef(false);
  const pushToHistoryRef = useRef<() => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

  // Generate unique tag for new devices
  // The symbolIdOrCategory can be a symbol ID (e.g., 'iec-power-supply') or a legacy category ID
  const generateTag = useCallback((symbolIdOrCategory: SymbolCategory, existingDevices: Device[]): string => {
    // Try to get tag prefix from symbol definition first (new behavior)
    // resolveSymbol handles parametric generation (e.g., iec-plc-di-16)
    const symbolDef = resolveSymbol(symbolIdOrCategory);
    let prefix = symbolDef?.tagPrefix;

    // Fall back to SYMBOL_CATEGORIES lookup (legacy behavior)
    if (!prefix) {
      const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === symbolIdOrCategory);
      prefix = categoryInfo?.prefix || 'D';
    }

    const existingNumbers = existingDevices
      .filter(d => d.tag.startsWith(prefix!))
      .map(d => parseInt(d.tag.slice(prefix!.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    return `${prefix}${nextNum}`;
  }, []);

  // Get all device positions including golden circuit defaults
  // Keys are device IDs (ULIDs)
  const getAllPositions = useCallback((): Map<string, Point> => {
    if (!circuit) return new Map();

    // Legacy fallback layouts keyed by tag (for golden circuit with no saved positions)
    const layouts: Record<string, Point> = {
      'PS1': { x: 50, y: 80 },
      'X1': { x: 50, y: 280 },
      'S2': { x: 250, y: 250 },
      'S1': { x: 400, y: 250 },
      'K1': { x: 550, y: 250 },
      'F1': { x: 550, y: 400 },
      'M1': { x: 550, y: 550 },
    };

    const positions = new Map<string, Point>();
    for (const device of circuit.devices) {
      const dynamicPos = devicePositions.get(device.id);
      if (dynamicPos) {
        positions.set(device.id, dynamicPos);
      } else if (layouts[device.tag]) {
        positions.set(device.id, layouts[device.tag]);
      } else {
        const existingCount = positions.size;
        const col = existingCount % 3;
        const row = Math.floor(existingCount / 3);
        positions.set(device.id, { x: 100 + col * 200, y: 100 + row * 150 });
      }
    }
    return positions;
  }, [circuit, devicePositions]);

  // Create a snapshot of current state
  const createSnapshot = useCallback((): HistorySnapshot | null => {
    if (!circuit) return null;
    return {
      circuit: {
        devices: [...circuit.devices],
        nets: [...circuit.nets],
        parts: [...circuit.parts],
        connections: [...circuit.connections],
        sheets: circuit.sheets ? [...circuit.sheets] : undefined,
        annotations: circuit.annotations ? [...circuit.annotations] : undefined,
        terminals: circuit.terminals ? [...circuit.terminals] : undefined,
        rungs: circuit.rungs ? [...circuit.rungs] : undefined,
        transforms: circuit.transforms ? { ...circuit.transforms } : undefined,
        blocks: circuit.blocks ? [...circuit.blocks] : undefined,
      },
      positions: new Map(devicePositions),
    };
  }, [circuit, devicePositions]);

  // Save current state to history before making changes
  const pushToHistory = useCallback(() => {
    if (!circuit || isUndoRedoRef.current) return;

    const snapshot = createSnapshot();
    if (!snapshot) return;

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(snapshot);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [circuit, createSnapshot, historyIndex]);

  // Keep refs in sync
  pushToHistoryRef.current = pushToHistory;

  // Undo
  const undo = useCallback(() => {
    if (historyIndex < 0 || history.length === 0) return;

    const currentSnapshot = createSnapshot();
    if (currentSnapshot && historyIndex === history.length - 1) {
      setHistory(prev => [...prev, currentSnapshot]);
    }

    const snapshot = history[historyIndex];
    if (!snapshot) return;

    isUndoRedoRef.current = true;
    setCircuit({
      devices: [...snapshot.circuit.devices],
      nets: [...snapshot.circuit.nets],
      parts: [...snapshot.circuit.parts],
      connections: [...snapshot.circuit.connections],
      sheets: snapshot.circuit.sheets ? [...snapshot.circuit.sheets] : undefined,
      annotations: snapshot.circuit.annotations ? [...snapshot.circuit.annotations] : undefined,
      terminals: snapshot.circuit.terminals ? [...snapshot.circuit.terminals] : undefined,
      rungs: snapshot.circuit.rungs ? [...snapshot.circuit.rungs] : undefined,
      transforms: snapshot.circuit.transforms ? { ...snapshot.circuit.transforms } : undefined,
      blocks: snapshot.circuit.blocks ? [...snapshot.circuit.blocks] : undefined,
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex - 1);
    clearAllSelections();

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, createSnapshot, setCircuit, setDevicePositions, clearAllSelections]);

  // Redo
  const redo = useCallback(() => {
    const targetIndex = historyIndex + 2;
    if (targetIndex >= history.length) return;

    const snapshot = history[targetIndex];
    if (!snapshot) return;

    isUndoRedoRef.current = true;
    setCircuit({
      devices: [...snapshot.circuit.devices],
      nets: [...snapshot.circuit.nets],
      parts: [...snapshot.circuit.parts],
      connections: [...snapshot.circuit.connections],
      sheets: snapshot.circuit.sheets ? [...snapshot.circuit.sheets] : undefined,
      annotations: snapshot.circuit.annotations ? [...snapshot.circuit.annotations] : undefined,
      terminals: snapshot.circuit.terminals ? [...snapshot.circuit.terminals] : undefined,
      rungs: snapshot.circuit.rungs ? [...snapshot.circuit.rungs] : undefined,
      transforms: snapshot.circuit.transforms ? { ...snapshot.circuit.transforms } : undefined,
      blocks: snapshot.circuit.blocks ? [...snapshot.circuit.blocks] : undefined,
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex + 1);
    clearAllSelections();

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, setCircuit, setDevicePositions, clearAllSelections]);

  undoRef.current = undo;
  redoRef.current = redo;

  // Place a new symbol
  const placeSymbol = useCallback((worldX: number, worldY: number, category: SymbolCategory, partData?: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => {
    if (!circuit) return;

    pushToHistory();

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);

    const tag = generateTag(category, circuit.devices);
    const now = Date.now();
    const symbolDef = resolveSymbol(category);
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const displayName = symbolDef?.name || categoryInfo?.label || category;
    const newPartId = generateId();

    // If partData is provided, use it; otherwise create an unassigned placeholder part
    const newPart = partData ? {
      ...partData,
      id: newPartId,
      createdAt: now,
      modifiedAt: now,
    } : {
      id: newPartId,
      type: 'part' as const,
      manufacturer: 'Unassigned',
      partNumber: 'TBD',
      description: `${displayName} (unassigned)`,
      category: category,
      attributes: {},
      createdAt: now,
      modifiedAt: now,
    };

    const newDeviceId = generateId();
    const newDevice: Device = {
      id: newDeviceId,
      type: 'device',
      tag,
      function: partData?.description || displayName,
      partId: newPartId,
      sheetId: validActiveSheetId,
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: [...prev.parts, newPart],
        devices: [...prev.devices, newDevice],
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(newDeviceId, { x: snappedX, y: snappedY });
      return next;
    });
  }, [circuit, generateTag, pushToHistory, setCircuit, setDevicePositions, validActiveSheetId]);

  // Create a wire connection
  // PinHit.device is now device ID (ULID)
  const createWireConnection = useCallback((fromPin: PinHit, toPin: PinHit, waypoints?: Point[]) => {
    if (!circuit) return;

    pushToHistory();

    // Look up device tags for the connection (display/export)
    const fromDevice = circuit.devices.find(d => d.id === fromPin.device);
    const toDevice = circuit.devices.find(d => d.id === toPin.device);

    const newNetId = generateId();
    const now = Date.now();
    const newNet = {
      id: newNetId,
      type: 'net' as const,
      name: `NET_${circuit.nets.length + 1}`,
      netType: 'signal' as const,
      createdAt: now,
      modifiedAt: now,
    };

    const newConnection: Connection = {
      fromDevice: fromDevice?.tag || fromPin.device,
      fromDeviceId: fromPin.device,
      fromPin: fromPin.pin,
      toDevice: toDevice?.tag || toPin.device,
      toDeviceId: toPin.device,
      toPin: toPin.pin,
      netId: newNetId,
      sheetId: validActiveSheetId,
      // Waypoints for user-drawn bends. Empty array = direct path via toOrthogonalPath.
      waypoints: waypoints || [],
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nets: [...prev.nets, newNet],
        connections: [...prev.connections, newConnection],
      };
    });
  }, [circuit, pushToHistory, setCircuit]);

  // Delete devices by ID
  const deleteDevices = useCallback((deviceIds: string[]) => {
    if (deviceIds.length === 0) return;

    pushToHistory();

    const idsToDelete = new Set(deviceIds);

    setCircuit(prev => {
      if (!prev) return prev;
      // Build a set of tags for the devices being deleted (for connection cleanup)
      const deletedDevices = prev.devices.filter(d => idsToDelete.has(d.id));
      const deletedIds = new Set(deletedDevices.map(d => d.id));
      return {
        ...prev,
        devices: prev.devices.filter(d => !deletedIds.has(d.id)),
        connections: prev.connections.filter(c => {
          // Use fromDeviceId/toDeviceId if available, fall back to tag lookup
          const fromId = c.fromDeviceId || prev.devices.find(d => d.tag === c.fromDevice)?.id;
          const toId = c.toDeviceId || prev.devices.find(d => d.tag === c.toDevice)?.id;
          return !deletedIds.has(fromId!) && !deletedIds.has(toId!);
        }),
      };
    });
    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const id of deviceIds) {
        next.delete(id);
      }
      return next;
    });
    setSelectedDevices([]);
  }, [pushToHistory, setCircuit, setDevicePositions]);

  const deleteWire = useCallback((connectionIndex: number) => {
    if (!circuit || connectionIndex < 0 || connectionIndex >= circuit.connections.length) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      newConnections.splice(connectionIndex, 1);
      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory, setCircuit]);

  // Waypoint operations
  const addWaypoint = useCallback((connectionIndex: number, segmentIndex: number, point: Point) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      const waypoints = conn.waypoints ? [...conn.waypoints] : [];
      waypoints.splice(segmentIndex, 0, point);
      conn.waypoints = waypoints;
      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory, setCircuit]);

  const moveWaypoint = useCallback((connectionIndex: number, waypointIndex: number, point: Point) => {
    if (!circuit) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      if (!conn.waypoints) return prev;

      const waypoints = [...conn.waypoints];
      waypoints[waypointIndex] = { x: snapToGrid(point.x), y: snapToGrid(point.y) };
      conn.waypoints = waypoints;
      newConnections[connectionIndex] = conn;

      return { ...prev, connections: newConnections };
    });
  }, [circuit, setCircuit]);

  const removeWaypoint = useCallback((connectionIndex: number, waypointIndex: number) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      if (!conn.waypoints) return prev;

      const waypoints = [...conn.waypoints];
      waypoints.splice(waypointIndex, 1);
      conn.waypoints = waypoints.length > 0 ? waypoints : undefined;
      newConnections[connectionIndex] = conn;

      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory, setCircuit]);

  const replaceWaypoints = useCallback((connectionIndex: number, waypoints: Point[] | undefined) => {
    if (!circuit) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      conn.waypoints = waypoints;
      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, setCircuit]);

  const updateWireNumber = useCallback((connectionIndex: number, wireNumber: string) => {
    if (!circuit) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      conn.wireNumber = wireNumber || undefined;
      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, setCircuit]);

  const updateWireField = useCallback((connectionIndex: number, field: 'wireGauge' | 'wireType' | 'wireColor' | 'wireSpecPosition', value: unknown) => {
    if (!circuit) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      (conn as Record<string, unknown>)[field] = value || undefined;
      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, setCircuit]);

  const reconnectWire = useCallback((connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };

      // PinHit.device is now device ID
      const device = prev.devices.find(d => d.id === newPin.device);
      if (endpoint === 'from') {
        conn.fromDevice = device?.tag || newPin.device;
        conn.fromDeviceId = newPin.device;
        conn.fromPin = newPin.pin;
      } else {
        conn.toDevice = device?.tag || newPin.device;
        conn.toDeviceId = newPin.device;
        conn.toPin = newPin.pin;
      }

      conn.waypoints = undefined;
      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory, setCircuit]);

  // Annotation operations
  const addAnnotation = useCallback((worldX: number, worldY: number, content: string) => {
    if (!circuit) return;

    pushToHistory();

    const now = Date.now();
    const annotation: Annotation = {
      id: generateId(),
      type: 'annotation',
      sheetId: validActiveSheetId,
      annotationType: 'text',
      position: { x: snapToGrid(worldX), y: snapToGrid(worldY) },
      content,
      style: { fontSize: 14 },
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        annotations: [...(prev.annotations || []), annotation],
      };
    });
  }, [circuit, validActiveSheetId, pushToHistory, setCircuit]);

  const addShapeAnnotation = useCallback((
    annotationType: 'rectangle' | 'circle' | 'line' | 'arrow',
    position: { x: number; y: number },
    style: Annotation['style'],
  ) => {
    if (!circuit) return;
    pushToHistory();
    const now = Date.now();
    const annotation: Annotation = {
      id: generateId(),
      type: 'annotation',
      sheetId: validActiveSheetId,
      annotationType,
      position: { x: snapToGrid(position.x), y: snapToGrid(position.y) },
      content: '',
      style: { strokeWidth: 0.5, ...style },
      createdAt: now,
      modifiedAt: now,
    };
    setCircuit(prev => {
      if (!prev) return prev;
      return { ...prev, annotations: [...(prev.annotations || []), annotation] };
    });
  }, [circuit, validActiveSheetId, pushToHistory, setCircuit]);

  const addImageAnnotation = useCallback((worldX: number, worldY: number, imageData: string, widthMm: number, heightMm: number) => {
    if (!circuit) return;
    pushToHistory();
    const now = Date.now();
    const annotation: Annotation = {
      id: generateId(),
      type: 'annotation',
      sheetId: validActiveSheetId,
      annotationType: 'image',
      position: { x: snapToGrid(worldX), y: snapToGrid(worldY) },
      content: '', // not used for images
      style: {
        width: widthMm,
        height: heightMm,
        imageData,
        imageWidth: widthMm,
        imageHeight: heightMm,
        imageOpacity: 1,
      },
      createdAt: now,
      modifiedAt: now,
    };
    setCircuit(prev => {
      if (!prev) return prev;
      return { ...prev, annotations: [...(prev.annotations || []), annotation] };
    });
  }, [circuit, validActiveSheetId, pushToHistory, setCircuit]);

  const updateAnnotation = useCallback((annotationId: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style' | 'groupId'>>) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const annotations = (prev.annotations || []).map(a =>
        a.id === annotationId
          ? { ...a, ...updates, modifiedAt: Date.now() }
          : a
      );
      return { ...prev, annotations };
    });
  }, [circuit, pushToHistory, setCircuit]);

  /** Move annotations by delta without pushing history (for live drag). */
  const moveAnnotations = useCallback((ids: string[], dx: number, dy: number) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const idSet = new Set(ids);
      const annotations = (prev.annotations || []).map(a => {
        if (!idSet.has(a.id)) return a;
        const moved = {
          ...a,
          position: { x: a.position.x + dx, y: a.position.y + dy },
          modifiedAt: Date.now(),
        };
        // Line/arrow annotations: also move the end point
        if ((a.annotationType === 'line' || a.annotationType === 'arrow') && a.style?.endX != null && a.style?.endY != null) {
          moved.style = { ...a.style, endX: a.style.endX + dx, endY: a.style.endY + dy };
        }
        return moved;
      });
      return { ...prev, annotations };
    });
  }, [setCircuit]);

  // Rotate device 90° clockwise or counter-clockwise (by device ID)
  const rotateDevice = useCallback((deviceId: string, direction: 'cw' | 'ccw') => {
    pushToHistory();
    setCircuit(prev => {
      if (!prev) return prev;
      const transforms = { ...(prev.transforms || {}) };
      const current = transforms[deviceId] || { rotation: 0 };
      const delta = direction === 'cw' ? 90 : -90;
      const newRotation = ((current.rotation + delta) % 360 + 360) % 360;
      transforms[deviceId] = { ...current, rotation: newRotation };
      return { ...prev, transforms };
    });
  }, [pushToHistory, setCircuit]);

  // Mirror device horizontally (by device ID)
  const mirrorDevice = useCallback((deviceId: string) => {
    pushToHistory();
    setCircuit(prev => {
      if (!prev) return prev;
      const transforms = { ...(prev.transforms || {}) };
      const current = transforms[deviceId] || { rotation: 0 };
      transforms[deviceId] = { ...current, mirrorH: !current.mirrorH };
      return { ...prev, transforms };
    });
  }, [pushToHistory, setCircuit]);

  const toggleDashed = useCallback((deviceId: string) => {
    pushToHistory();
    setCircuit(prev => {
      if (!prev) return prev;
      const transforms = { ...(prev.transforms || {}) };
      const current = transforms[deviceId] || { rotation: 0 };
      transforms[deviceId] = { ...current, dashed: !current.dashed };
      return { ...prev, transforms };
    });
  }, [pushToHistory, setCircuit]);

  // Rotate selected devices as a group around their shared center
  const rotateSelectedDevices = useCallback((direction: 'cw' | 'ccw') => {
    if (selectedDevices.length === 0 || !circuit) return;

    pushToHistory();

    // Single device: just rotate in place (no position change needed)
    if (selectedDevices.length === 1) {
      const deviceId = selectedDevices[0];
      setCircuit(prev => {
        if (!prev) return prev;
        const transforms = { ...(prev.transforms || {}) };
        const current = transforms[deviceId] || { rotation: 0 };
        const delta = direction === 'cw' ? 90 : -90;
        const newRotation = ((current.rotation + delta) % 360 + 360) % 360;
        transforms[deviceId] = { ...current, rotation: newRotation };
        return { ...prev, transforms };
      });
      return;
    }

    // Multi-device: rotate positions around group center AND rotate each transform
    const allPositions = getAllPositions();
    const partMap = new Map<string, Part>();
    for (const part of circuit.parts) partMap.set(part.id, part);

    // Compute group center (centroid of device centers)
    let sumX = 0, sumY = 0, count = 0;
    for (const deviceId of selectedDevices) {
      const pos = allPositions.get(deviceId);
      if (!pos) continue;
      const device = circuit.devices.find(d => d.id === deviceId);
      const part = device?.partId ? partMap.get(device.partId) : null;
      const geom = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
      // Device center is always at pos + half of unrotated geometry
      // (renderer rotates around this center)
      sumX += pos.x + geom.width / 2;
      sumY += pos.y + geom.height / 2;
      count++;
    }
    if (count === 0) return;
    const cx = sumX / count;
    const cy = sumY / count;

    // Update positions: rotate each device center around group center
    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const deviceId of selectedDevices) {
        const pos = prev.get(deviceId);
        if (!pos) continue;
        const device = circuit.devices.find(d => d.id === deviceId);
        const part = device?.partId ? partMap.get(device.partId) : null;
        const geom = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');

        const dcx = pos.x + geom.width / 2;
        const dcy = pos.y + geom.height / 2;

        // Rotate center around group center
        // Screen coords: CW = (dx,dy) → (-dy, dx), CCW = (dx,dy) → (dy, -dx)
        let newDcx: number, newDcy: number;
        if (direction === 'cw') {
          newDcx = cx - (dcy - cy);
          newDcy = cy + (dcx - cx);
        } else {
          newDcx = cx + (dcy - cy);
          newDcy = cy - (dcx - cx);
        }

        // Position = rotated center - half of unrotated geometry
        next.set(deviceId, {
          x: snapToGrid(newDcx - geom.width / 2),
          y: snapToGrid(newDcy - geom.height / 2),
        });
      }
      return next;
    });

    // Rotate individual transforms
    setCircuit(prev => {
      if (!prev) return prev;
      const transforms = { ...(prev.transforms || {}) };
      const delta = direction === 'cw' ? 90 : -90;
      for (const deviceId of selectedDevices) {
        const current = transforms[deviceId] || { rotation: 0 };
        const newRotation = ((current.rotation + delta) % 360 + 360) % 360;
        transforms[deviceId] = { ...current, rotation: newRotation };
      }
      return { ...prev, transforms };
    });
  }, [selectedDevices, circuit, getAllPositions, pushToHistory, setDevicePositions, setCircuit]);

  const alignSelectedDevices = useCallback((direction: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => {
    if (selectedDevices.length < 2 || !circuit) return;

    pushToHistory();

    const allPositions = getAllPositions();
    const partMap = new Map<string, Part>();
    for (const part of circuit.parts) partMap.set(part.id, part);

    // Compute bounding info for each selected device
    const deviceBounds = selectedDevices.map(deviceId => {
      const pos = allPositions.get(deviceId) || { x: 0, y: 0 };
      const device = circuit.devices.find(d => d.id === deviceId);
      const part = device?.partId ? partMap.get(device.partId) : null;
      const geom = getSymbolGeometry(part?.symbolCategory || part?.category || 'unknown');
      const transform = circuit.transforms?.[deviceId];
      const rotation = transform?.rotation || 0;
      const w = (rotation % 180 !== 0) ? geom.height : geom.width;
      const h = (rotation % 180 !== 0) ? geom.width : geom.height;
      const cx = pos.x + geom.width / 2;
      const cy = pos.y + geom.height / 2;
      return { deviceId, pos, w, h, cx, cy, geomW: geom.width, geomH: geom.height };
    });

    // Compute alignment target
    let target: number;
    switch (direction) {
      case 'left':
        target = Math.min(...deviceBounds.map(b => b.cx - b.w / 2));
        break;
      case 'right':
        target = Math.max(...deviceBounds.map(b => b.cx + b.w / 2));
        break;
      case 'center-x': {
        const minX = Math.min(...deviceBounds.map(b => b.cx - b.w / 2));
        const maxX = Math.max(...deviceBounds.map(b => b.cx + b.w / 2));
        target = (minX + maxX) / 2;
        break;
      }
      case 'top':
        target = Math.min(...deviceBounds.map(b => b.cy - b.h / 2));
        break;
      case 'bottom':
        target = Math.max(...deviceBounds.map(b => b.cy + b.h / 2));
        break;
      case 'center-y': {
        const minY = Math.min(...deviceBounds.map(b => b.cy - b.h / 2));
        const maxY = Math.max(...deviceBounds.map(b => b.cy + b.h / 2));
        target = (minY + maxY) / 2;
        break;
      }
    }

    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const b of deviceBounds) {
        const currentPos = allPositions.get(b.deviceId);
        if (!currentPos) continue;
        let newX = currentPos.x;
        let newY = currentPos.y;

        switch (direction) {
          case 'left':
            newX = currentPos.x + (target - (b.cx - b.w / 2));
            break;
          case 'right':
            newX = currentPos.x + (target - (b.cx + b.w / 2));
            break;
          case 'center-x':
            newX = currentPos.x + (target - b.cx);
            break;
          case 'top':
            newY = currentPos.y + (target - (b.cy - b.h / 2));
            break;
          case 'bottom':
            newY = currentPos.y + (target - (b.cy + b.h / 2));
            break;
          case 'center-y':
            newY = currentPos.y + (target - b.cy);
            break;
        }

        next.set(b.deviceId, {
          x: snapToGrid(newX),
          y: snapToGrid(newY),
        });
      }
      return next;
    });
  }, [selectedDevices, circuit, getAllPositions, pushToHistory, setDevicePositions]);

  const deleteAnnotation = useCallback((annotationId: string) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        annotations: (prev.annotations || []).filter(a => a.id !== annotationId),
      };
    });
  }, [circuit, pushToHistory, setCircuit]);

  // Connect a wire to the middle of an existing wire (T-junction)
  //
  // Splits the target wire into 2 segments through a new junction device,
  // and creates a 3rd wire from the source pin to the junction.
  // The junction position comes from projectPointOntoWire() so it's exactly
  // on the target wire path. The entire mutation happens in one setCircuit
  // call to avoid stale-index issues.
  const connectToWire = useCallback((connectionIndex: number, worldX: number, worldY: number, startPin?: PinHit | null): string | null => {
    if (!circuit) return null;

    pushToHistory();

    const now = Date.now();

    // Create junction part + device
    const junctionPartId = generateId();
    const junctionPart: Part = {
      id: junctionPartId,
      type: 'part',
      manufacturer: 'Internal',
      partNumber: 'JUNCTION',
      description: 'Wire junction',
      category: 'Junction',
      attributes: {},
      createdAt: now,
      modifiedAt: now,
    };

    const junctionTag = generateTag('junction', circuit.devices);
    const junctionDeviceId = generateId();
    const junctionDevice: Device = {
      id: junctionDeviceId,
      type: 'device',
      tag: junctionTag,
      function: 'Wire junction',
      partId: junctionPartId,
      sheetId: validActiveSheetId,
      createdAt: now,
      modifiedAt: now,
    };

    // Snap junction to grid. The projection puts us on the wire, and grid-snapping
    // keeps coordinates clean for the auto-router. Since wire endpoints are grid-aligned,
    // snapping the junction to grid keeps it on the wire while avoiding sub-pixel drift.
    const junctionX = snapToGrid(worldX);
    const junctionY = snapToGrid(worldY);

    const startDevice = startPin ? circuit.devices.find(d => d.id === startPin.device) : null;

    // Read the original connection INSIDE setCircuit to avoid stale references.
    // This is critical when multiple T-junctions are created rapidly.
    setCircuit(prev => {
      if (!prev) return prev;
      const originalConn = prev.connections[connectionIndex];
      if (!originalConn) return prev;

      // Split: original wire → (from→junction) + (junction→to)
      // Give each half a waypoint at the junction position so the auto-router
      // keeps them on the same straight path as the original wire.
      // (KiCad uses independent line segments; we emulate this with waypoints.)
      const junctionWaypoint = { x: junctionX, y: junctionY };

      const conn1: Connection = {
        fromDevice: originalConn.fromDevice,
        fromDeviceId: originalConn.fromDeviceId,
        fromPin: originalConn.fromPin,
        toDevice: junctionTag,
        toDeviceId: junctionDeviceId,
        toPin: '1',
        netId: originalConn.netId,
        sheetId: originalConn.sheetId || validActiveSheetId,
        waypoints: [junctionWaypoint],
      };

      const conn2: Connection = {
        fromDevice: junctionTag,
        fromDeviceId: junctionDeviceId,
        fromPin: '1',
        toDevice: originalConn.toDevice,
        toDeviceId: originalConn.toDeviceId,
        toPin: originalConn.toPin,
        netId: originalConn.netId,
        sheetId: originalConn.sheetId || validActiveSheetId,
        waypoints: [junctionWaypoint],
      };

      const newConnections = [...prev.connections];
      newConnections.splice(connectionIndex, 1, conn1, conn2);

      // Branch wire: source pin → junction (only when startPin is provided)
      if (startPin) {
        const conn3: Connection = {
          fromDevice: startDevice?.tag || startPin.device,
          fromDeviceId: startPin.device,
          fromPin: startPin.pin,
          toDevice: junctionTag,
          toDeviceId: junctionDeviceId,
          toPin: '1',
          netId: originalConn.netId,
          sheetId: originalConn.sheetId || validActiveSheetId,
        };
        newConnections.push(conn3);
      }

      return {
        ...prev,
        parts: [...prev.parts, junctionPart],
        devices: [...prev.devices, junctionDevice],
        connections: newConnections,
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(junctionDeviceId, { x: junctionX, y: junctionY });
      return next;
    });

    return junctionDeviceId;
  }, [circuit, pushToHistory, generateTag, setCircuit, setDevicePositions, validActiveSheetId]);

  // Assign a manufacturer part to a device (by device ID)
  const assignPart = useCallback((deviceId: string, partData: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;

      // Check if this exact part already exists in the circuit
      let existingPart = prev.parts.find(
        p => p.manufacturer === partData.manufacturer && p.partNumber === partData.partNumber
      );

      let updatedParts = [...prev.parts];

      // Find the device and get its old part so we can preserve the symbol
      const device = prev.devices.find(d => d.id === deviceId);
      const oldPartId = device?.partId;
      const oldPart = oldPartId ? prev.parts.find(p => p.id === oldPartId) : undefined;

      if (!existingPart) {
        // Create new part with generated ID, but preserve the original
        // symbol category so assigning a part doesn't change the schematic symbol
        const now = Date.now();
        const preservedCategory = oldPart?.category || partData.category;
        existingPart = {
          ...partData,
          category: preservedCategory,
          id: generateId(),
          createdAt: now,
          modifiedAt: now,
        } as Part;
        updatedParts.push(existingPart);
      }

      // Auto-apply pin aliases from part definition if available.
      // The symbol category determines which pin mapping to use (coil vs NO contact vs NC contact).
      const symbolCat = oldPart?.category || partData.category;
      const autoAliases = partData.pinMappings?.[symbolCat];

      // Update the device to point to the new part
      const updatedDevices = prev.devices.map(d => {
        if (d.id !== deviceId) return d;
        const updated: Device = { ...d, partId: existingPart!.id, modifiedAt: Date.now() };
        if (autoAliases) {
          updated.pinAliases = { ...autoAliases };
        }
        return updated;
      });

      // Remove orphaned old part if no other device references it
      if (oldPartId) {
        const otherDevicesUsingOldPart = updatedDevices.filter(
          d => d.partId === oldPartId && d.id !== deviceId
        );
        if (otherDevicesUsingOldPart.length === 0) {
          updatedParts = updatedParts.filter(p => p.id !== oldPartId);
        }
      }

      return {
        ...prev,
        parts: updatedParts,
        devices: updatedDevices,
      };
    });
  }, [circuit, pushToHistory, setCircuit]);

  // Update device properties (tag, function, location) — looked up by device ID
  const updateDevice = useCallback((deviceId: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location' | 'sizeOverride'>>) => {
    if (!circuit) return;

    pushToHistory();

    const idx = circuit.devices.findIndex(d => d.id === deviceId);
    if (idx === -1) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const updated = [...prev.devices];
      updated[idx] = { ...updated[idx], ...updates, modifiedAt: Date.now() };
      return { ...prev, devices: updated };
    });

    // No need to update positions or selection on tag rename — they're ID-keyed
  }, [circuit, pushToHistory, setCircuit]);

  const linkDevicesAsSamePart = useCallback((deviceIds: string[]) => {
    if (!circuit || deviceIds.length < 2) return;
    pushToHistory();
    // Reuse an existing group if one of the selected devices is already grouped,
    // so linking extends the group rather than creating a parallel one.
    const existingGroupId = circuit.devices.find(d => deviceIds.includes(d.id) && d.deviceGroupId)?.deviceGroupId;
    const groupId = existingGroupId || `grp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    const idSet = new Set(deviceIds);
    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        devices: prev.devices.map(d =>
          idSet.has(d.id)
            ? { ...d, deviceGroupId: groupId, modifiedAt: Date.now() }
            : d,
        ),
      };
    });
  }, [circuit, pushToHistory, setCircuit]);

  const unlinkDevices = useCallback((deviceIds: string[]) => {
    if (!circuit || deviceIds.length === 0) return;
    pushToHistory();
    const idSet = new Set(deviceIds);
    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        devices: prev.devices.map(d => {
          if (!idSet.has(d.id) || !d.deviceGroupId) return d;
          const { deviceGroupId: _unused, ...rest } = d;
          return { ...rest, modifiedAt: Date.now() } as typeof d;
        }),
      };
    });
  }, [circuit, pushToHistory, setCircuit]);

  const setDeviceTagOffset = useCallback((deviceId: string, offset: { x: number; y: number } | undefined) => {
    setCircuit(prev => {
      if (!prev) return prev;
      const idx = prev.devices.findIndex(d => d.id === deviceId);
      if (idx === -1) return prev;
      const current = prev.devices[idx];
      const existing = current.labelOffsets || {};
      const isZero = !offset || (Math.abs(offset.x) < 0.01 && Math.abs(offset.y) < 0.01);
      const nextLabelOffsets = isZero
        ? (Object.keys(existing).filter(k => k !== 'tag').length === 0
            ? undefined
            : { ...existing, tag: undefined })
        : { ...existing, tag: offset };
      const updated = [...prev.devices];
      updated[idx] = { ...current, labelOffsets: nextLabelOffsets, modifiedAt: Date.now() };
      return { ...prev, devices: updated };
    });
  }, [setCircuit]);

  return {
    debugMode,
    setDebugMode,
    showGrid,
    setShowGrid,
    showPinLabels,
    setShowPinLabels,
    showDescriptions,
    showPartNumbers,
    setShowDescriptions,
    setShowPartNumbers,
    activeSheetId: validActiveSheetId,
    setActiveSheetId,
    sheets,
    addSheet,
    duplicateSheet,
    renameSheet,
    deleteSheet,
    reorderSheets,
    updateSheet,
    setSheetLayout,
    getSheetLayout,
    setRungSpacing,
    getRungSpacing,
    setPanelScale,
    getPanelScale,
    history,
    historyIndex,
    pushToHistory,
    pushToHistoryRef,
    undoRef,
    redoRef,
    isUndoRedoRef,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    getAllPositions,
    placeSymbol,
    createWireConnection,
    deleteDevices,
    deleteWire,
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    replaceWaypoints,
    reconnectWire,
    updateWireNumber,
    updateWireField,
    connectToWire,
    deviceTransforms,
    setDeviceTransforms,
    rotateDevice,
    rotateSelectedDevices,
    mirrorDevice,
    toggleDashed,
    alignSelectedDevices,
    addAnnotation,
    addShapeAnnotation,
    addImageAnnotation,
    updateAnnotation,
    moveAnnotations,
    deleteAnnotation,
    updateDevice,
    linkDevicesAsSamePart,
    unlinkDevices,
    setDeviceTagOffset,
    assignPart,
    selectedDevices,
    setSelectedDevices,
    selectedWireIndex,
    setSelectedWireIndex,
    selectedAnnotationIds,
    setSelectedAnnotationIds: setSelectedAnnotationIdsRaw,
    clearAllSelections,
    selectAnnotation,
  };
}

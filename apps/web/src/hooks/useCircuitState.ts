/**
 * Circuit state hook - CRUD operations, undo/redo
 */

import { useState, useCallback, useRef } from 'react';
import { generateId, getSymbolById, type Device, type Sheet, type Annotation, type Part } from '@fusion-cad/core-model';
import type { CircuitData, Connection } from '../renderer/circuit-renderer';
import type { Point, DeviceTransform } from '../renderer/types';
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

  // Sheet management
  activeSheetId: string;
  setActiveSheetId: (id: string) => void;
  sheets: Sheet[];
  addSheet: () => void;
  renameSheet: (sheetId: string, newName: string) => void;
  deleteSheet: (sheetId: string) => void;

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
  createWireConnection: (fromPin: PinHit, toPin: PinHit) => void;
  deleteDevices: (deviceTags: string[]) => void;
  addWaypoint: (connectionIndex: number, segmentIndex: number, point: Point) => void;
  moveWaypoint: (connectionIndex: number, waypointIndex: number, point: Point) => void;
  removeWaypoint: (connectionIndex: number, waypointIndex: number) => void;
  reconnectWire: (connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => void;
  updateWireNumber: (connectionIndex: number, wireNumber: string) => void;

  // T-Junction
  connectToWire: (connectionIndex: number, worldX: number, worldY: number, startPin: PinHit) => void;

  // Rotation & mirror
  deviceTransforms: Map<string, DeviceTransform>;
  setDeviceTransforms: React.Dispatch<React.SetStateAction<Map<string, DeviceTransform>>>;
  rotateDevice: (deviceTag: string, direction: 'cw' | 'ccw') => void;
  mirrorDevice: (deviceTag: string) => void;

  // Annotations
  addAnnotation: (worldX: number, worldY: number, content: string) => void;
  updateAnnotation: (annotationId: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style'>>) => void;
  deleteAnnotation: (annotationId: string) => void;

  // Device update
  updateDevice: (deviceTag: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location'>>) => void;

  // Part assignment
  assignPart: (deviceTag: string, partData: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;

  // Selection
  selectedDevices: string[];
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>;
  selectedWireIndex: number | null;
  setSelectedWireIndex: React.Dispatch<React.SetStateAction<number | null>>;
  selectedAnnotationId: string | null;
  selectAnnotation: (id: string | null) => void;
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
    size: 'Letter',
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
  const [selectedDevices, setSelectedDevicesRaw] = useState<string[]>([]);
  const [selectedWireIndex, setSelectedWireIndex] = useState<number | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string>(DEFAULT_SHEET_ID);
  const [deviceTransforms, setDeviceTransforms] = useState<Map<string, DeviceTransform>>(new Map());
  const [selectedAnnotationId, setSelectedAnnotationIdRaw] = useState<string | null>(null);

  // Wrapped setters that clear the other selection type
  const setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>> = useCallback((action) => {
    setSelectedDevicesRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (next.length > 0) setSelectedAnnotationIdRaw(null);
      return next;
    });
  }, []);

  const selectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationIdRaw(id);
    if (id) {
      setSelectedDevicesRaw([]);
      setSelectedWireIndex(null);
    }
  }, []);

  // Get sheets from circuit data (backward-compatible)
  const sheets = getOrCreateSheets(circuit);

  // Ensure activeSheetId is valid
  const validActiveSheetId = sheets.find(s => s.id === activeSheetId) ? activeSheetId : sheets[0]?.id || DEFAULT_SHEET_ID;
  if (validActiveSheetId !== activeSheetId) {
    // Sync if the current active sheet was deleted
    setActiveSheetId(validActiveSheetId);
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
      size: 'Letter',
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
    setSelectedDevices([]);
    setSelectedWireIndex(null);
  }, [circuit, setCircuit]);

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
      return {
        ...prev,
        sheets: prevSheets.filter(s => s.id !== sheetId),
        // Remove devices on this sheet
        devices: prev.devices.filter(d => d.sheetId !== sheetId),
        // Remove connections that reference devices on this sheet
        connections: prev.connections.filter(c => {
          if (c.sheetId === sheetId) return false;
          const fromDevice = prev.devices.find(d => d.tag === c.fromDevice);
          const toDevice = prev.devices.find(d => d.tag === c.toDevice);
          if (fromDevice?.sheetId === sheetId || toDevice?.sheetId === sheetId) return false;
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
    setSelectedDevices([]);
    setSelectedWireIndex(null);
  }, [circuit, activeSheetId, setCircuit]);

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
    const symbolDef = getSymbolById(symbolIdOrCategory);
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
  const getAllPositions = useCallback((): Map<string, Point> => {
    if (!circuit) return new Map();

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
      const dynamicPos = devicePositions.get(device.tag);
      if (dynamicPos) {
        positions.set(device.tag, dynamicPos);
      } else if (layouts[device.tag]) {
        positions.set(device.tag, layouts[device.tag]);
      } else {
        const existingCount = positions.size;
        const col = existingCount % 3;
        const row = Math.floor(existingCount / 3);
        positions.set(device.tag, { x: 100 + col * 200, y: 100 + row * 150 });
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
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex - 1);
    setSelectedDevices([]);
    setSelectedAnnotationIdRaw(null);

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, createSnapshot, setCircuit, setDevicePositions]);

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
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex + 1);
    setSelectedDevices([]);
    setSelectedAnnotationIdRaw(null);

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, setCircuit, setDevicePositions]);

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
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
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
      description: `${categoryInfo?.label || category} (unassigned)`,
      category: category,
      attributes: {},
      createdAt: now,
      modifiedAt: now,
    };

    const newDevice: Device = {
      id: generateId(),
      type: 'device',
      tag,
      function: partData?.description || `${categoryInfo?.label || category} device`,
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
      next.set(tag, { x: snappedX, y: snappedY });
      return next;
    });
  }, [circuit, generateTag, pushToHistory, setCircuit, setDevicePositions, validActiveSheetId]);

  // Create a wire connection
  const createWireConnection = useCallback((fromPin: PinHit, toPin: PinHit) => {
    if (!circuit) return;

    pushToHistory();

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
      fromDevice: fromPin.device,
      fromPin: fromPin.pin,
      toDevice: toPin.device,
      toPin: toPin.pin,
      netId: newNetId,
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

  // Delete devices
  const deleteDevices = useCallback((deviceTags: string[]) => {
    if (deviceTags.length === 0) return;

    pushToHistory();

    const tagsToDelete = new Set(deviceTags);

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        devices: prev.devices.filter(d => !tagsToDelete.has(d.tag)),
        connections: prev.connections.filter(
          c => !tagsToDelete.has(c.fromDevice) && !tagsToDelete.has(c.toDevice)
        ),
      };
    });
    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const tag of deviceTags) {
        next.delete(tag);
      }
      return next;
    });
    setSelectedDevices([]);
  }, [pushToHistory, setCircuit, setDevicePositions]);

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

  const reconnectWire = useCallback((connectionIndex: number, endpoint: 'from' | 'to', newPin: PinHit) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };

      if (endpoint === 'from') {
        conn.fromDevice = newPin.device;
        conn.fromPin = newPin.pin;
      } else {
        conn.toDevice = newPin.device;
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

  const updateAnnotation = useCallback((annotationId: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style'>>) => {
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

  // Rotate device 90° clockwise or counter-clockwise
  const rotateDevice = useCallback((deviceTag: string, direction: 'cw' | 'ccw') => {
    pushToHistory();
    setDeviceTransforms(prev => {
      const next = new Map(prev);
      const current = next.get(deviceTag) || { rotation: 0, mirrorH: false };
      const delta = direction === 'cw' ? 90 : -90;
      const newRotation = ((current.rotation + delta) % 360 + 360) % 360;
      next.set(deviceTag, { ...current, rotation: newRotation });
      return next;
    });
  }, [pushToHistory]);

  // Mirror device horizontally
  const mirrorDevice = useCallback((deviceTag: string) => {
    pushToHistory();
    setDeviceTransforms(prev => {
      const next = new Map(prev);
      const current = next.get(deviceTag) || { rotation: 0, mirrorH: false };
      next.set(deviceTag, { ...current, mirrorH: !current.mirrorH });
      return next;
    });
  }, [pushToHistory]);

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
  const connectToWire = useCallback((connectionIndex: number, worldX: number, worldY: number, startPin: PinHit) => {
    if (!circuit) return;

    pushToHistory();

    const now = Date.now();
    const originalConn = circuit.connections[connectionIndex];

    // Create junction part
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

    // Create junction device with unique tag
    const junctionTag = generateTag('junction', circuit.devices);
    const junctionDevice: Device = {
      id: generateId(),
      type: 'device',
      tag: junctionTag,
      function: 'Wire junction',
      partId: junctionPartId,
      sheetId: validActiveSheetId,
      createdAt: now,
      modifiedAt: now,
    };

    // Position junction so pin J (at offset 6,6) aligns with click point
    const junctionX = snapToGrid(worldX - 6);
    const junctionY = snapToGrid(worldY - 6);

    // Split original connection into 2 halves through junction
    const conn1: Connection = {
      fromDevice: originalConn.fromDevice,
      fromPin: originalConn.fromPin,
      toDevice: junctionTag,
      toPin: 'J',
      netId: originalConn.netId,
      sheetId: originalConn.sheetId,
    };

    const conn2: Connection = {
      fromDevice: junctionTag,
      fromPin: 'J',
      toDevice: originalConn.toDevice,
      toPin: originalConn.toPin,
      netId: originalConn.netId,
      sheetId: originalConn.sheetId,
    };

    // New connection from the starting pin to the junction
    const conn3: Connection = {
      fromDevice: startPin.device,
      fromPin: startPin.pin,
      toDevice: junctionTag,
      toPin: 'J',
      netId: originalConn.netId,
      sheetId: originalConn.sheetId,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      // Replace original connection with the two halves
      newConnections.splice(connectionIndex, 1, conn1, conn2);
      // Add the new wire from startPin
      newConnections.push(conn3);
      return {
        ...prev,
        parts: [...prev.parts, junctionPart],
        devices: [...prev.devices, junctionDevice],
        connections: newConnections,
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(junctionTag, { x: junctionX, y: junctionY });
      return next;
    });
  }, [circuit, pushToHistory, generateTag, setCircuit, setDevicePositions, validActiveSheetId]);

  // Assign a manufacturer part to a device
  const assignPart = useCallback((deviceTag: string, partData: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;

      // Check if this exact part already exists in the circuit
      let existingPart = prev.parts.find(
        p => p.manufacturer === partData.manufacturer && p.partNumber === partData.partNumber
      );

      let updatedParts = [...prev.parts];

      if (!existingPart) {
        // Create new part with generated ID
        const now = Date.now();
        existingPart = {
          ...partData,
          id: generateId(),
          createdAt: now,
          modifiedAt: now,
        } as Part;
        updatedParts.push(existingPart);
      }

      // Find the device and get its old partId
      const device = prev.devices.find(d => d.tag === deviceTag);
      const oldPartId = device?.partId;

      // Update the device to point to the new part
      const updatedDevices = prev.devices.map(d =>
        d.tag === deviceTag ? { ...d, partId: existingPart!.id, modifiedAt: Date.now() } : d
      );

      // Remove orphaned old part if no other device references it
      if (oldPartId) {
        const otherDevicesUsingOldPart = updatedDevices.filter(
          d => d.partId === oldPartId && d.tag !== deviceTag
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

  // Update device properties (tag, function, location)
  const updateDevice = useCallback((deviceTag: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location'>>) => {
    if (!circuit) return;

    pushToHistory();

    const idx = circuit.devices.findIndex(d => d.tag === deviceTag);
    if (idx === -1) return;

    setCircuit(prev => {
      if (!prev) return prev;
      const updated = [...prev.devices];
      updated[idx] = { ...updated[idx], ...updates, modifiedAt: Date.now() };
      return { ...prev, devices: updated };
    });

    // If tag changed, update selected devices and device positions
    if (updates.tag && updates.tag !== deviceTag) {
      setSelectedDevices(prev => prev.map(t => t === deviceTag ? updates.tag! : t));
      setDevicePositions(prev => {
        const pos = prev.get(deviceTag);
        if (!pos) return prev;
        const next = new Map(prev);
        next.delete(deviceTag);
        next.set(updates.tag!, pos);
        return next;
      });
    }
  }, [circuit, pushToHistory, setCircuit, setSelectedDevices, setDevicePositions]);

  return {
    debugMode,
    setDebugMode,
    activeSheetId: validActiveSheetId,
    setActiveSheetId,
    sheets,
    addSheet,
    renameSheet,
    deleteSheet,
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
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    reconnectWire,
    updateWireNumber,
    connectToWire,
    deviceTransforms,
    setDeviceTransforms,
    rotateDevice,
    mirrorDevice,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    updateDevice,
    assignPart,
    selectedDevices,
    setSelectedDevices,
    selectedWireIndex,
    setSelectedWireIndex,
    selectedAnnotationId,
    selectAnnotation,
  };
}

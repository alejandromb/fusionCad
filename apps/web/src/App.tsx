import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import { registerBuiltinSymbols, generateId, type Device, type Part, type Net } from '@fusion-cad/core-model';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import { renderCircuit, type CircuitData, type Connection, getWireAtPoint, getWaypointAtPoint, getWireEndpointAtPoint } from './renderer/circuit-renderer';
import { registerBuiltinDrawFunctions, getSymbolGeometry } from './renderer/symbols';
import type { Viewport, Point } from './renderer/types';
import * as projectsApi from './api/projects';

// Symbol categories available for placement
const SYMBOL_CATEGORIES = [
  { id: 'contactor', label: 'Contactor', prefix: 'K' },
  { id: 'button', label: 'Button', prefix: 'S' },
  { id: 'overload', label: 'Overload', prefix: 'F' },
  { id: 'motor', label: 'Motor', prefix: 'M' },
  { id: 'terminal', label: 'Terminal', prefix: 'X' },
  { id: 'power-supply', label: 'Power Supply', prefix: 'PS' },
] as const;

type SymbolCategory = typeof SYMBOL_CATEGORIES[number]['id'];
type InteractionMode = 'select' | 'place' | 'wire';

// Grid size for snap-to-grid feature
const GRID_SIZE = 20;

// Auto-save debounce delay (ms)
const AUTO_SAVE_DELAY = 1000;

// Maximum history entries for undo/redo
const MAX_HISTORY_SIZE = 50;

// Type for history snapshots
interface HistorySnapshot {
  circuit: CircuitData;
  positions: Map<string, Point>;
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// Debounce helper
function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;

  return debouncedFn;
}

// Initialize symbol registries before any rendering occurs
registerBuiltinSymbols();
registerBuiltinDrawFunctions();

// Hit detection helpers

interface PinHit {
  device: string;
  pin: string;
}

/**
 * Get pin at world coordinates (8px hit radius)
 */
function getPinAtPoint(
  worldX: number,
  worldY: number,
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>
): PinHit | null {
  const HIT_RADIUS = 8;
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const pos = positions.get(device.tag);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.category || 'unknown');

    for (const pin of geometry.pins) {
      const pinX = pos.x + pin.position.x;
      const pinY = pos.y + pin.position.y;
      const dist = Math.hypot(worldX - pinX, worldY - pinY);

      if (dist <= HIT_RADIUS) {
        return { device: device.tag, pin: pin.id };
      }
    }
  }

  return null;
}

/**
 * Get symbol at world coordinates (bounding box check)
 */
function getSymbolAtPoint(
  worldX: number,
  worldY: number,
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>
): string | null {
  const partMap = new Map<string, Part>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  for (const device of devices) {
    const pos = positions.get(device.tag);
    if (!pos) continue;

    const part = device.partId ? partMap.get(device.partId) : null;
    const geometry = getSymbolGeometry(part?.category || 'unknown');

    if (
      worldX >= pos.x &&
      worldX <= pos.x + geometry.width &&
      worldY >= pos.y &&
      worldY <= pos.y + geometry.height
    ) {
      return device.tag;
    }
  }

  return null;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [circuit, setCircuit] = useState<CircuitData | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const [debugMode, setDebugMode] = useState(false);

  // Project persistence state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [isLoading, setIsLoading] = useState(true);
  const [projectsList, setProjectsList] = useState<projectsApi.ProjectSummary[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  // Interaction mode state
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [placementCategory, setPlacementCategory] = useState<SymbolCategory | null>(null);
  const [devicePositions, setDevicePositions] = useState<Map<string, Point>>(new Map());

  // Selection and wire tool state (multi-select support)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedWireIndex, setSelectedWireIndex] = useState<number | null>(null);
  const [wireStart, setWireStart] = useState<PinHit | null>(null);

  // Waypoint dragging state
  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    connectionIndex: number;
    waypointIndex: number;
  } | null>(null);

  // Wire endpoint dragging state (for reconnecting wires)
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    connectionIndex: number;
    endpoint: 'from' | 'to';
    originalPin: PinHit;
  } | null>(null);

  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState<{
    device: Device;
    part: Part | null;
    position: Point;
  } | null>(null);

  // Undo/Redo history state
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUndoRedoRef = useRef(false);
  const pushToHistoryRef = useRef<() => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

  // Ghost preview state for placement mode
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);

  // Track dragging state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Drag-to-reposition state
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const dragOffsetRef = useRef<Point | null>(null);
  const dragHistoryPushedRef = useRef(false);

  // Generate unique tag for new devices
  const generateTag = useCallback((category: SymbolCategory, existingDevices: Device[]): string => {
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const prefix = categoryInfo?.prefix || 'D';

    // Find next available number
    const existingNumbers = existingDevices
      .filter(d => d.tag.startsWith(prefix))
      .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    return `${prefix}${nextNum}`;
  }, []);

  // Get all device positions including golden circuit defaults
  const getAllPositions = useCallback((): Map<string, Point> => {
    if (!circuit) return new Map();

    // Default positions for golden circuit devices
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

  // Undo/Redo Model:
  // - history = array of snapshots representing past states
  // - historyIndex = index of last saved state (-1 if none)
  // - "current" state = the live circuit & devicePositions (may differ from history)
  // - pushToHistory: save current state before an action modifies it
  // - undo: save current for redo, then restore history[historyIndex], decrement index
  // - redo: increment index, restore history[index + 1] (the saved redo state)

  // Create a snapshot of current state
  const createSnapshot = useCallback((): HistorySnapshot | null => {
    if (!circuit) return null;
    return {
      circuit: {
        devices: [...circuit.devices],
        nets: [...circuit.nets],
        parts: [...circuit.parts],
        connections: [...circuit.connections],
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
      // Truncate redo history (anything after historyIndex + 1)
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(snapshot);
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [circuit, createSnapshot, historyIndex]);

  // Keep refs in sync with callbacks for use in event handlers
  pushToHistoryRef.current = pushToHistory;

  // Undo: restore the previous state, save current for redo
  const undo = useCallback(() => {
    if (historyIndex < 0 || history.length === 0) return;

    // Save current state for redo (append to history if at the end)
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
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex - 1);
    setSelectedDevices([]);

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex, createSnapshot]);

  // Redo: restore the next state
  const redo = useCallback(() => {
    // After undo, historyIndex is decremented. The state we want to redo to
    // is at historyIndex + 2 (because historyIndex + 1 is what we just undid FROM,
    // and historyIndex + 2 is what we saved as current during undo).
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
    });
    setDevicePositions(new Map(snapshot.positions));
    setHistoryIndex(historyIndex + 1);
    setSelectedDevices([]);

    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 0);
  }, [history, historyIndex]);

  // Keep refs in sync with callbacks
  undoRef.current = undo;
  redoRef.current = redo;

  // Place a new symbol at the given world coordinates
  const placeSymbol = useCallback((worldX: number, worldY: number, category: SymbolCategory) => {
    if (!circuit) return;

    // Push current state to history before making changes
    pushToHistory();

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);

    const tag = generateTag(category, circuit.devices);
    const now = Date.now();
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const newPartId = generateId();

    const newPart = {
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
      function: `${categoryInfo?.label || category} device`,
      partId: newPartId,
      sheetId: 'sheet-1',
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

    // Exit placement mode after placing
    setInteractionMode('select');
    setPlacementCategory(null);
  }, [circuit, generateTag, pushToHistory]);

  // Create a wire connection between two pins
  const createWireConnection = useCallback((fromPin: PinHit, toPin: PinHit) => {
    if (!circuit) return;

    // Push current state to history before making changes
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
  }, [circuit, pushToHistory]);

  // Delete devices and their connections (supports multi-select)
  const deleteDevices = useCallback((deviceTags: string[]) => {
    if (deviceTags.length === 0) return;

    // Push current state to history before making changes
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
  }, [pushToHistory]);

  // Add a waypoint to a connection at a specific segment
  const addWaypoint = useCallback((connectionIndex: number, segmentIndex: number, point: Point) => {
    if (!circuit) return;

    pushToHistory();

    setCircuit(prev => {
      if (!prev) return prev;
      const newConnections = [...prev.connections];
      const conn = { ...newConnections[connectionIndex] };
      const waypoints = conn.waypoints ? [...conn.waypoints] : [];

      // Insert waypoint at the segment position
      waypoints.splice(segmentIndex, 0, point);
      conn.waypoints = waypoints;
      newConnections[connectionIndex] = conn;

      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory]);

  // Move a waypoint
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
  }, [circuit]);

  // Remove a waypoint (double-click)
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
  }, [circuit, pushToHistory]);

  // Reconnect a wire endpoint to a different pin
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

      // Clear waypoints when reconnecting (path needs to be recalculated)
      conn.waypoints = undefined;

      newConnections[connectionIndex] = conn;
      return { ...prev, connections: newConnections };
    });
  }, [circuit, pushToHistory]);

  // Copy selected device to clipboard (copies first selected)
  const copyDevice = useCallback(() => {
    if (selectedDevices.length === 0 || !circuit) return;

    const selectedDevice = selectedDevices[0];
    const device = circuit.devices.find(d => d.tag === selectedDevice);
    if (!device) return;

    const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const allPositions = getAllPositions();
    const position = allPositions.get(selectedDevice) || { x: 100, y: 100 };

    setClipboard({ device, part: part || null, position });
  }, [selectedDevices, circuit, getAllPositions]);

  // Paste device from clipboard at given position
  const pasteDevice = useCallback((worldX: number, worldY: number) => {
    if (!clipboard || !circuit) return;

    // Push current state to history before making changes
    pushToHistory();

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);
    const now = Date.now();

    // Generate new tag based on the category
    const category = clipboard.part?.category || 'unknown';
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const prefix = categoryInfo?.prefix || clipboard.device.tag.replace(/\d+$/, '') || 'D';

    const existingNumbers = circuit.devices
      .filter(d => d.tag.startsWith(prefix))
      .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    const newTag = `${prefix}${nextNum}`;

    // Create new part (copy of original)
    const newPartId = generateId();
    const newPart = clipboard.part ? {
      ...clipboard.part,
      id: newPartId,
      createdAt: now,
      modifiedAt: now,
    } : null;

    // Create new device
    const newDevice: Device = {
      ...clipboard.device,
      id: generateId(),
      tag: newTag,
      partId: newPart ? newPartId : undefined,
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: newPart ? [...prev.parts, newPart] : prev.parts,
        devices: [...prev.devices, newDevice],
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(newTag, { x: snappedX, y: snappedY });
      return next;
    });

    // Select the new device
    setSelectedDevices([newTag]);
  }, [clipboard, circuit, pushToHistory]);

  // Duplicate selected device in place (with offset) - duplicates first selected
  const duplicateDevice = useCallback(() => {
    if (selectedDevices.length === 0 || !circuit) return;

    const selectedDevice = selectedDevices[0];
    const device = circuit.devices.find(d => d.tag === selectedDevice);
    if (!device) return;

    // Push current state to history before making changes
    pushToHistory();

    const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const allPositions = getAllPositions();
    const position = allPositions.get(selectedDevice) || { x: 100, y: 100 };

    // Paste at offset position
    const offsetX = position.x + 40;
    const offsetY = position.y + 40;

    const now = Date.now();

    const category = part?.category || 'unknown';
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const prefix = categoryInfo?.prefix || device.tag.replace(/\d+$/, '') || 'D';

    const existingNumbers = circuit.devices
      .filter(d => d.tag.startsWith(prefix))
      .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    const newTag = `${prefix}${nextNum}`;

    const newPartId = generateId();
    const newPart = part ? {
      ...part,
      id: newPartId,
      createdAt: now,
      modifiedAt: now,
    } : null;

    const newDevice: Device = {
      ...device,
      id: generateId(),
      tag: newTag,
      partId: newPart ? newPartId : undefined,
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: newPart ? [...prev.parts, newPart] : prev.parts,
        devices: [...prev.devices, newDevice],
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(newTag, { x: snapToGrid(offsetX), y: snapToGrid(offsetY) });
      return next;
    });

    setSelectedDevices([newTag]);
  }, [selectedDevices, circuit, getAllPositions, pushToHistory]);

  // Refresh projects list
  const refreshProjectsList = useCallback(async () => {
    try {
      const projects = await projectsApi.listProjects();
      setProjectsList(projects);
    } catch (error) {
      console.error('Failed to load projects list:', error);
    }
  }, []);

  // Switch to a different project
  const switchProject = useCallback(async (id: string) => {
    setIsLoading(true);
    setShowProjectMenu(false);
    try {
      const project = await projectsApi.getProject(id);
      setProjectId(project.id);
      setProjectName(project.name);

      const positionsMap = new Map<string, Point>();
      if (project.circuitData.positions) {
        Object.entries(project.circuitData.positions).forEach(([tag, pos]) => {
          positionsMap.set(tag, pos as Point);
        });
      }
      setDevicePositions(positionsMap);

      setCircuit({
        devices: project.circuitData.devices as Device[],
        nets: project.circuitData.nets as Net[],
        parts: project.circuitData.parts as Part[],
        connections: project.circuitData.connections as Connection[],
      });

      window.history.replaceState({}, '', `?project=${project.id}`);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to switch project:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new empty project
  const createNewProject = useCallback(async () => {
    setShowProjectMenu(false);
    const name = prompt('Project name:', 'New Project');
    if (!name) return;

    setIsLoading(true);
    try {
      const project = await projectsApi.createProject(name, '', {
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        positions: {},
      });

      setProjectId(project.id);
      setProjectName(project.name);
      setDevicePositions(new Map());
      setCircuit({
        devices: [],
        nets: [],
        parts: [],
        connections: [],
      });

      window.history.replaceState({}, '', `?project=${project.id}`);
      setSaveStatus('saved');
      await refreshProjectsList();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshProjectsList]);

  // Delete current project
  const deleteCurrentProject = useCallback(async () => {
    if (!projectId) return;
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) return;

    setShowProjectMenu(false);
    try {
      await projectsApi.deleteProject(projectId);
      await refreshProjectsList();

      // Load another project or create new
      const projects = await projectsApi.listProjects();
      if (projects.length > 0) {
        await switchProject(projects[0].id);
      } else {
        await createNewProject();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }, [projectId, projectName, refreshProjectsList, switchProject, createNewProject]);

  // Rename current project
  const renameProject = useCallback(async () => {
    if (!projectId) return;
    const newName = prompt('New project name:', projectName);
    if (!newName || newName === projectName) return;

    setShowProjectMenu(false);
    try {
      await projectsApi.updateProject(projectId, { name: newName });
      setProjectName(newName);
      await refreshProjectsList();
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  }, [projectId, projectName, refreshProjectsList]);

  // Save project to API
  const saveProject = useCallback(async () => {
    if (!projectId || !circuit) return;

    setSaveStatus('saving');
    try {
      // Convert devicePositions Map to plain object
      const positions: Record<string, Point> = {};
      devicePositions.forEach((pos, tag) => {
        positions[tag] = pos;
      });

      await projectsApi.updateProject(projectId, {
        circuitData: {
          devices: circuit.devices,
          nets: circuit.nets,
          parts: circuit.parts,
          connections: circuit.connections,
          positions,
        },
      });
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save project:', error);
      setSaveStatus('error');
    }
  }, [projectId, circuit, devicePositions]);

  // Debounced auto-save
  const debouncedSave = useDebouncedCallback(saveProject, AUTO_SAVE_DELAY);

  // Trigger auto-save when circuit or positions change
  useEffect(() => {
    if (projectId && circuit && !isLoading) {
      setSaveStatus('unsaved');
      debouncedSave();
    }
  }, [circuit, devicePositions, projectId, isLoading, debouncedSave]);

  // Load project on mount
  useEffect(() => {
    async function loadOrCreateProject() {
      setIsLoading(true);
      try {
        // Check URL for project ID
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get('project');

        if (urlProjectId) {
          // Load existing project
          const project = await projectsApi.getProject(urlProjectId);
          setProjectId(project.id);
          setProjectName(project.name);

          // Convert positions object to Map
          const positionsMap = new Map<string, Point>();
          if (project.circuitData.positions) {
            Object.entries(project.circuitData.positions).forEach(([tag, pos]) => {
              positionsMap.set(tag, pos as Point);
            });
          }
          setDevicePositions(positionsMap);

          setCircuit({
            devices: project.circuitData.devices as Device[],
            nets: project.circuitData.nets as Net[],
            parts: project.circuitData.parts as Part[],
            connections: project.circuitData.connections as Connection[],
          });
        } else {
          // Check if any projects exist
          const projects = await projectsApi.listProjects();

          if (projects.length > 0) {
            // Load most recent project
            const project = await projectsApi.getProject(projects[0].id);
            setProjectId(project.id);
            setProjectName(project.name);

            const positionsMap = new Map<string, Point>();
            if (project.circuitData.positions) {
              Object.entries(project.circuitData.positions).forEach(([tag, pos]) => {
                positionsMap.set(tag, pos as Point);
              });
            }
            setDevicePositions(positionsMap);

            setCircuit({
              devices: project.circuitData.devices as Device[],
              nets: project.circuitData.nets as Net[],
              parts: project.circuitData.parts as Part[],
              connections: project.circuitData.connections as Connection[],
            });

            // Update URL
            window.history.replaceState({}, '', `?project=${project.id}`);
          } else {
            // Create new project with golden circuit
            const goldenCircuit = createGoldenCircuitMotorStarter();
            const circuitData = {
              devices: goldenCircuit.devices,
              nets: goldenCircuit.nets,
              parts: goldenCircuit.parts,
              connections: goldenCircuit.connections,
              positions: {} as Record<string, Point>,
            };

            const project = await projectsApi.createProject(
              '3-Wire Motor Starter',
              'Golden circuit - standard motor starter configuration',
              circuitData
            );

            setProjectId(project.id);
            setProjectName(project.name);
            setCircuit({
              devices: goldenCircuit.devices,
              nets: goldenCircuit.nets,
              parts: goldenCircuit.parts,
              connections: goldenCircuit.connections,
            });

            // Update URL
            window.history.replaceState({}, '', `?project=${project.id}`);
          }
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        // Fallback to golden circuit without persistence
        const goldenCircuit = createGoldenCircuitMotorStarter();
        setCircuit({
          devices: goldenCircuit.devices,
          nets: goldenCircuit.nets,
          parts: goldenCircuit.parts,
          connections: goldenCircuit.connections,
        });
        setProjectName('3-Wire Motor Starter (offline)');
      } finally {
        setIsLoading(false);
      }
    }

    loadOrCreateProject();
    refreshProjectsList();
  }, [refreshProjectsList]);

  // Render circuit when loaded or canvas resizes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !circuit) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      renderCircuit(ctx, circuit, viewport, debugMode, devicePositions, {
        selectedDevices,
        selectedWireIndex,
        wireStart,
        ghostSymbol: interactionMode === 'place' && placementCategory && mouseWorldPos
          ? { category: placementCategory, x: snapToGrid(mouseWorldPos.x), y: snapToGrid(mouseWorldPos.y) }
          : null,
        draggingEndpoint: draggingEndpoint && mouseWorldPos
          ? { connectionIndex: draggingEndpoint.connectionIndex, endpoint: draggingEndpoint.endpoint, mousePos: mouseWorldPos }
          : null,
      });
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [circuit, viewport, debugMode, devicePositions, selectedDevices, selectedWireIndex, wireStart, interactionMode, placementCategory, mouseWorldPos, draggingEndpoint]);

  // Canvas interaction handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !circuit) return;

    // Helper to get world coordinates from mouse event
    const getWorldCoords = (e: MouseEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      return {
        x: (mouseX - viewport.offsetX) / viewport.scale,
        y: (mouseY - viewport.offsetY) / viewport.scale,
      };
    };

    // Get cursor style based on interaction mode
    const getCursor = (): string => {
      if (draggingDevice) return 'move';
      switch (interactionMode) {
        case 'wire': return 'crosshair';
        case 'place': return 'crosshair';
        case 'select':
        default: return isDraggingRef.current ? 'grabbing' : 'grab';
      }
    };

    // Mouse wheel: zoom in/out
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = viewport.scale * zoomFactor;
      const clampedScale = Math.min(Math.max(newScale, 0.1), 5);
      const scaleRatio = clampedScale / viewport.scale;
      const newOffsetX = mouseX - (mouseX - viewport.offsetX) * scaleRatio;
      const newOffsetY = mouseY - (mouseY - viewport.offsetY) * scaleRatio;

      setViewport({
        offsetX: newOffsetX,
        offsetY: newOffsetY,
        scale: clampedScale,
      });
    };

    // Mouse down
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Left click only

      const world = getWorldCoords(e);
      const allPositions = getAllPositions();

      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      // Select mode: check for endpoints, waypoints, wires, then symbols
      if (interactionMode === 'select') {
        // First, check if clicking on an endpoint of the selected wire (for reconnecting)
        if (selectedWireIndex !== null) {
          const endpointHit = getWireEndpointAtPoint(
            world.x, world.y, selectedWireIndex,
            circuit.connections, circuit.devices, circuit.parts, allPositions
          );
          if (endpointHit) {
            // Start dragging this endpoint
            const conn = circuit.connections[selectedWireIndex];
            const originalPin: PinHit = endpointHit.endpoint === 'from'
              ? { device: conn.fromDevice, pin: conn.fromPin }
              : { device: conn.toDevice, pin: conn.toPin };
            setDraggingEndpoint({
              connectionIndex: selectedWireIndex,
              endpoint: endpointHit.endpoint,
              originalPin,
            });
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'crosshair';
            return;
          }

          // Then check if clicking on a waypoint of the selected wire
          const waypointHit = getWaypointAtPoint(world.x, world.y, circuit.connections);
          if (waypointHit && waypointHit.connectionIndex === selectedWireIndex) {
            // Start dragging this waypoint
            setDraggingWaypoint(waypointHit);
            dragHistoryPushedRef.current = false;
            canvas.style.cursor = 'move';
            return;
          }
        }

        // Check if clicking on a symbol
        const hitSymbol = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
        if (hitSymbol) {
          // Clear wire selection when selecting a device
          setSelectedWireIndex(null);

          // Handle multi-select with Shift key
          if (e.shiftKey) {
            // Toggle selection
            setSelectedDevices(prev => {
              if (prev.includes(hitSymbol)) {
                return prev.filter(d => d !== hitSymbol);
              } else {
                return [...prev, hitSymbol];
              }
            });
          } else {
            // If clicking on an already selected device, keep selection for multi-drag
            // Otherwise, select only this device
            if (!selectedDevices.includes(hitSymbol)) {
              setSelectedDevices([hitSymbol]);
            }
          }

          setDraggingDevice(hitSymbol);
          dragHistoryPushedRef.current = false; // Reset flag for new drag
          const symbolPos = allPositions.get(hitSymbol);
          if (symbolPos) {
            dragOffsetRef.current = {
              x: world.x - symbolPos.x,
              y: world.y - symbolPos.y,
            };
          }
          canvas.style.cursor = 'move';
          return;
        }

        // Check if clicking on a wire (only select, don't add waypoint on first click)
        const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions);
        if (hitWire !== null) {
          setSelectedDevices([]);
          // Only select, don't process further - handleMouseUp will ignore since we're selecting
          if (hitWire !== selectedWireIndex) {
            setSelectedWireIndex(hitWire);
          }
          // Mark that this is a wire selection click (not a waypoint add)
          isDraggingRef.current = false; // Prevents handleMouseUp from processing
          return;
        }
      }

      canvas.style.cursor = getCursor();
    };

    // Mouse move
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const world: Point = {
        x: (mouseX - viewport.offsetX) / viewport.scale,
        y: (mouseY - viewport.offsetY) / viewport.scale,
      };

      // Update ghost preview position for placement mode
      if (interactionMode === 'place') {
        setMouseWorldPos(world);
      }

      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDraggedRef.current = true;
      }

      // Drag waypoint
      if (draggingWaypoint) {
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }
        moveWaypoint(draggingWaypoint.connectionIndex, draggingWaypoint.waypointIndex, world);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag endpoint (for reconnecting wires) - update mouse position for visual feedback
      if (draggingEndpoint) {
        setMouseWorldPos(world);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Drag-to-reposition: move all selected devices together
      if (draggingDevice && dragOffsetRef.current) {
        // Push to history on first move (not on every move)
        if (!dragHistoryPushedRef.current) {
          pushToHistoryRef.current();
          dragHistoryPushedRef.current = true;
        }

        // Calculate delta movement
        const allPositions = getAllPositions();
        const draggedPos = allPositions.get(draggingDevice);
        if (draggedPos) {
          const newX = snapToGrid(world.x - dragOffsetRef.current.x);
          const newY = snapToGrid(world.y - dragOffsetRef.current.y);
          const deltaX = newX - draggedPos.x;
          const deltaY = newY - draggedPos.y;

          // Move all selected devices (or just the dragged one if not selected)
          const devicesToMove = selectedDevices.includes(draggingDevice)
            ? selectedDevices
            : [draggingDevice];

          setDevicePositions(prev => {
            const next = new Map(prev);
            for (const tag of devicesToMove) {
              const currentPos = allPositions.get(tag);
              if (currentPos) {
                next.set(tag, {
                  x: snapToGrid(currentPos.x + deltaX),
                  y: snapToGrid(currentPos.y + deltaY),
                });
              }
            }
            return next;
          });
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Pan canvas (only if not in placement/wire mode, or if actually dragging)
      if (interactionMode === 'select' || hasDraggedRef.current) {
        setViewport(prev => ({
          ...prev,
          offsetX: prev.offsetX + deltaX,
          offsetY: prev.offsetY + deltaY,
        }));
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    // Mouse up
    const handleMouseUp = (e: MouseEvent) => {
      const world = getWorldCoords(e);
      const allPositions = getAllPositions();

      // End waypoint dragging
      if (draggingWaypoint) {
        setDraggingWaypoint(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End endpoint dragging (reconnect wire if dropped on a pin, or add waypoint if empty space)
      if (draggingEndpoint) {
        const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
        if (hitPin) {
          // Dropped on a pin - reconnect the wire
          const isOriginalPin = hitPin.device === draggingEndpoint.originalPin.device &&
                               hitPin.pin === draggingEndpoint.originalPin.pin;
          if (!isOriginalPin) {
            reconnectWire(draggingEndpoint.connectionIndex, draggingEndpoint.endpoint, hitPin);
          }
        } else if (hasDraggedRef.current) {
          // Dropped on empty space - add a waypoint to create visual offset
          // This lets users adjust wire routing without changing connections
          const conn = circuit.connections[draggingEndpoint.connectionIndex];
          const waypointPos = { x: snapToGrid(world.x), y: snapToGrid(world.y) };

          if (draggingEndpoint.endpoint === 'from') {
            // Add waypoint at the start (index 0)
            addWaypoint(draggingEndpoint.connectionIndex, 0, waypointPos);
          } else {
            // Add waypoint at the end
            const insertIndex = conn.waypoints ? conn.waypoints.length : 0;
            addWaypoint(draggingEndpoint.connectionIndex, insertIndex, waypointPos);
          }
        }
        setDraggingEndpoint(null);
        setMouseWorldPos(null);
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // End device dragging
      if (draggingDevice) {
        setDraggingDevice(null);
        dragOffsetRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = getCursor();
        return;
      }

      // Handle click actions (only if didn't drag)
      if (!hasDraggedRef.current && isDraggingRef.current) {
        switch (interactionMode) {
          case 'place': {
            if (placementCategory) {
              placeSymbol(world.x, world.y, placementCategory);
            }
            break;
          }
          case 'wire': {
            const hitPin = getPinAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
            if (hitPin) {
              if (!wireStart) {
                // First click: start wire
                setWireStart(hitPin);
              } else {
                // Second click: complete wire
                if (hitPin.device !== wireStart.device || hitPin.pin !== wireStart.pin) {
                  createWireConnection(wireStart, hitPin);
                }
                setWireStart(null);
              }
            }
            break;
          }
          case 'select': {
            const hitSymbol = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
            const hitWire = getWireAtPoint(world.x, world.y, circuit.connections, circuit.devices, circuit.parts, allPositions);

            // Click on a selected wire to add a waypoint
            if (hitWire !== null && hitWire === selectedWireIndex) {
              // Add waypoint at click position (snapped to grid)
              const conn = circuit.connections[hitWire];
              const segmentIndex = conn.waypoints ? conn.waypoints.length : 0;
              addWaypoint(hitWire, segmentIndex, {
                x: snapToGrid(world.x),
                y: snapToGrid(world.y),
              });
              break;
            }

            // Click on empty space deselects (if not shift-clicking)
            if (!hitSymbol && hitWire === null && !e.shiftKey) {
              setSelectedDevices([]);
              setSelectedWireIndex(null);
            }
            break;
          }
        }
      }

      isDraggingRef.current = false;
      canvas.style.cursor = getCursor();
    };

    // Double-click: remove waypoint
    const handleDoubleClick = (e: MouseEvent) => {
      if (interactionMode !== 'select') return;

      const world = getWorldCoords(e);
      const waypointHit = getWaypointAtPoint(world.x, world.y, circuit.connections);

      if (waypointHit) {
        removeWaypoint(waypointHit.connectionIndex, waypointHit.waypointIndex);
      }
    };

    // Keyboard handling
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC: cancel current action
      if (e.key === 'Escape') {
        if (wireStart) {
          setWireStart(null);
        } else if (interactionMode === 'place') {
          setInteractionMode('select');
          setPlacementCategory(null);
        } else if (selectedWireIndex !== null) {
          setSelectedWireIndex(null);
        } else if (selectedDevices.length > 0) {
          setSelectedDevices([]);
        }
      }

      // Delete/Backspace: delete selected devices
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDevices.length > 0) {
        // Prevent browser back navigation
        e.preventDefault();
        deleteDevices(selectedDevices);
      }

      // Ctrl+A: select all devices
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedDevices(circuit.devices.map(d => d.tag));
      }

      // Ctrl+C: copy selected device
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedDevices.length > 0) {
        e.preventDefault();
        copyDevice();
      }

      // Ctrl+V: paste device at mouse position
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        // Get current mouse position in world coords
        const rect = canvas.getBoundingClientRect();
        const mouseX = lastMousePosRef.current.x - rect.left;
        const mouseY = lastMousePosRef.current.y - rect.top;
        const worldX = (mouseX - viewport.offsetX) / viewport.scale;
        const worldY = (mouseY - viewport.offsetY) / viewport.scale;
        pasteDevice(worldX, worldY);
      }

      // Ctrl+D: duplicate selected device in place
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedDevices.length > 0) {
        e.preventDefault();
        duplicateDevice();
      }

      // Ctrl+Z: undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      }

      // Ctrl+Shift+Z or Ctrl+Y: redo
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redoRef.current();
      }
    };

    // Add event listeners
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    canvas.style.cursor = getCursor();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewport, interactionMode, placementCategory, circuit, wireStart, selectedDevices, selectedWireIndex, draggingDevice, draggingWaypoint, draggingEndpoint, getAllPositions, placeSymbol, createWireConnection, deleteDevices, copyDevice, pasteDevice, duplicateDevice, clipboard, addWaypoint, moveWaypoint, removeWaypoint, reconnectWire]);

  // Get selected device info for properties panel (shows first selected if multiple)
  const primarySelectedDevice = selectedDevices.length > 0 ? selectedDevices[0] : null;
  const selectedDeviceInfo = primarySelectedDevice && circuit
    ? circuit.devices.find(d => d.tag === primarySelectedDevice)
    : null;
  const selectedDevicePart = selectedDeviceInfo?.partId && circuit
    ? circuit.parts.find(p => p.id === selectedDeviceInfo.partId)
    : null;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>fusionCad</h1>
        </div>

        <div className="header-center">
          <div className="project-selector">
            <button
              className="project-button"
              onClick={() => setShowProjectMenu(!showProjectMenu)}
            >
              <span className="project-name">{projectName}</span>
              <span className="dropdown-arrow">▼</span>
            </button>
            <span className={`save-status ${saveStatus}`}>
              {saveStatus === 'saved' && '✓'}
              {saveStatus === 'saving' && '●'}
              {saveStatus === 'unsaved' && '○'}
              {saveStatus === 'error' && '✗'}
            </span>

            {showProjectMenu && (
              <div className="project-menu">
                <div className="menu-section">
                  <div className="menu-header">Projects</div>
                  {projectsList.map(p => (
                    <button
                      key={p.id}
                      className={`menu-item ${p.id === projectId ? 'active' : ''}`}
                      onClick={() => switchProject(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="menu-divider" />
                <button className="menu-item" onClick={createNewProject}>
                  + New Project
                </button>
                <button className="menu-item" onClick={renameProject}>
                  Rename...
                </button>
                <button className="menu-item danger" onClick={deleteCurrentProject}>
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="header-right">
          {circuit && (
            <span className="circuit-stats">
              {circuit.devices.length} devices · {circuit.connections.length} wires
            </span>
          )}
        </div>
      </header>

      {/* Click outside to close menu */}
      {showProjectMenu && (
        <div className="menu-backdrop" onClick={() => setShowProjectMenu(false)} />
      )}

      <div className="layout">
        <aside className="sidebar">
          {/* Tools Section */}
          <section className="sidebar-section">
            <h3>Tools</h3>
            <div className="toolbar">
              <button
                className={`tool-btn ${interactionMode === 'select' ? 'active' : ''}`}
                onClick={() => {
                  setInteractionMode('select');
                  setPlacementCategory(null);
                  setWireStart(null);
                }}
                title="Select and move symbols (V)"
              >
                Select
              </button>
              <button
                className={`tool-btn ${interactionMode === 'wire' ? 'active' : ''}`}
                onClick={() => {
                  setInteractionMode('wire');
                  setPlacementCategory(null);
                  setSelectedDevices([]);
                }}
                title="Draw wires between pins (W)"
              >
                Wire
              </button>
            </div>
          </section>

          {/* Symbols Section */}
          <section className="sidebar-section">
            <h3>Symbols</h3>
            <div className="symbol-palette">
              {SYMBOL_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`symbol-btn ${interactionMode === 'place' && placementCategory === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    if (interactionMode === 'place' && placementCategory === cat.id) {
                      setInteractionMode('select');
                      setPlacementCategory(null);
                    } else {
                      setInteractionMode('place');
                      setPlacementCategory(cat.id);
                      setWireStart(null);
                      setSelectedDevices([]);
                    }
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </section>

          {/* Status Messages */}
          {(interactionMode === 'place' || interactionMode === 'wire' || selectedDevices.length > 0) && (
            <section className="sidebar-section">
              {interactionMode === 'place' && placementCategory && (
                <p className="status-message success">
                  Click to place {SYMBOL_CATEGORIES.find(c => c.id === placementCategory)?.label}
                </p>
              )}
              {interactionMode === 'wire' && (
                <p className="status-message info">
                  {wireStart
                    ? `From ${wireStart.device}:${wireStart.pin} → click target pin`
                    : 'Click a pin to start wire'}
                </p>
              )}
              {interactionMode === 'select' && selectedDevices.length > 1 && (
                <p className="status-message info">
                  {selectedDevices.length} devices selected
                </p>
              )}
            </section>
          )}

          {/* Properties Section - shows when device selected */}
          {selectedDeviceInfo && (
            <section className="sidebar-section">
              <h3>Properties</h3>
              <div className="properties-panel">
                <div className="property-row">
                  <span className="property-label">Tag</span>
                  <span className="property-value">{selectedDeviceInfo.tag}</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Type</span>
                  <span className="property-value">{selectedDevicePart?.category || 'Unknown'}</span>
                </div>
                <div className="property-row">
                  <span className="property-label">Function</span>
                  <span className="property-value">{selectedDeviceInfo.function}</span>
                </div>
                {selectedDevicePart && (
                  <>
                    <div className="property-row">
                      <span className="property-label">Manufacturer</span>
                      <span className="property-value">{selectedDevicePart.manufacturer}</span>
                    </div>
                    <div className="property-row">
                      <span className="property-label">Part #</span>
                      <span className="property-value">{selectedDevicePart.partNumber}</span>
                    </div>
                  </>
                )}
                <button
                  className="delete-btn"
                  onClick={() => deleteDevices(selectedDevices)}
                >
                  {selectedDevices.length > 1 ? `Delete ${selectedDevices.length} Devices` : 'Delete Device'}
                </button>
              </div>
            </section>
          )}

          {/* Debug Section - collapsible at bottom */}
          <section className="sidebar-section sidebar-footer">
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
              <span>Debug mode</span>
            </label>
          </section>
        </aside>

        <main className="canvas-container">
          {isLoading && (
            <div className="loading-overlay">Loading...</div>
          )}
          <canvas ref={canvasRef} className="canvas" />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import { registerBuiltinSymbols, generateId, type Device, type Part } from '@fusion-cad/core-model';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import { renderCircuit, type CircuitData, type Connection } from './renderer/circuit-renderer';
import { registerBuiltinDrawFunctions, getSymbolGeometry } from './renderer/symbols';
import type { Viewport, Point } from './renderer/types';

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

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
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

  // Interaction mode state
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [placementCategory, setPlacementCategory] = useState<SymbolCategory | null>(null);
  const [devicePositions, setDevicePositions] = useState<Map<string, Point>>(new Map());

  // Selection and wire tool state
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [wireStart, setWireStart] = useState<PinHit | null>(null);

  // Ghost preview state for placement mode
  const [mouseWorldPos, setMouseWorldPos] = useState<Point | null>(null);

  // Track dragging state
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Drag-to-reposition state
  const [draggingDevice, setDraggingDevice] = useState<string | null>(null);
  const dragOffsetRef = useRef<Point | null>(null);

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

  // Place a new symbol at the given world coordinates
  const placeSymbol = useCallback((worldX: number, worldY: number, category: SymbolCategory) => {
    if (!circuit) return;

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
  }, [circuit, generateTag]);

  // Create a wire connection between two pins
  const createWireConnection = useCallback((fromPin: PinHit, toPin: PinHit) => {
    if (!circuit) return;

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
  }, [circuit]);

  // Delete a device and its connections
  const deleteDevice = useCallback((deviceTag: string) => {
    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        devices: prev.devices.filter(d => d.tag !== deviceTag),
        connections: prev.connections.filter(
          c => c.fromDevice !== deviceTag && c.toDevice !== deviceTag
        ),
      };
    });
    setDevicePositions(prev => {
      const next = new Map(prev);
      next.delete(deviceTag);
      return next;
    });
    setSelectedDevice(null);
  }, []);

  // Load golden circuit on mount
  useEffect(() => {
    const goldenCircuit = createGoldenCircuitMotorStarter();
    setCircuit({
      devices: goldenCircuit.devices,
      nets: goldenCircuit.nets,
      parts: goldenCircuit.parts,
      connections: goldenCircuit.connections,
    });
  }, []);

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
        selectedDevice,
        wireStart,
        ghostSymbol: interactionMode === 'place' && placementCategory && mouseWorldPos
          ? { category: placementCategory, x: snapToGrid(mouseWorldPos.x), y: snapToGrid(mouseWorldPos.y) }
          : null,
      });
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [circuit, viewport, debugMode, devicePositions, selectedDevice, wireStart, interactionMode, placementCategory, mouseWorldPos]);

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

      // Select mode: check if clicking on a symbol to start dragging
      if (interactionMode === 'select') {
        const hitSymbol = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
        if (hitSymbol) {
          setDraggingDevice(hitSymbol);
          setSelectedDevice(hitSymbol);
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

      // Drag-to-reposition: move the dragging device
      if (draggingDevice && dragOffsetRef.current) {
        const newX = snapToGrid(world.x - dragOffsetRef.current.x);
        const newY = snapToGrid(world.y - dragOffsetRef.current.y);
        setDevicePositions(prev => {
          const next = new Map(prev);
          next.set(draggingDevice, { x: newX, y: newY });
          return next;
        });
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
            // Click on empty space deselects
            const hitSymbol = getSymbolAtPoint(world.x, world.y, circuit.devices, circuit.parts, allPositions);
            setSelectedDevice(hitSymbol);
            break;
          }
        }
      }

      isDraggingRef.current = false;
      canvas.style.cursor = getCursor();
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
        } else if (selectedDevice) {
          setSelectedDevice(null);
        }
      }

      // Delete/Backspace: delete selected device
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDevice) {
        // Prevent browser back navigation
        e.preventDefault();
        deleteDevice(selectedDevice);
      }
    };

    // Add event listeners
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    canvas.style.cursor = getCursor();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewport, interactionMode, placementCategory, circuit, wireStart, selectedDevice, draggingDevice, getAllPositions, placeSymbol, createWireConnection, deleteDevice]);

  return (
    <div className="app">
      <header className="header">
        <h1>fusionCad</h1>
        <div className="subtitle">Electrical CAD · Automation-First · Local-First</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h3>Golden Circuit</h3>
          <p>3-Wire Motor Starter</p>
          {circuit && (
            <ul>
              <li>Devices: {circuit.devices.length}</li>
              <li>Connections: {circuit.connections.length}</li>
              <li>Nets: {circuit.nets.length}</li>
            </ul>
          )}
          <h3 style={{ marginTop: '2rem' }}>Phase 2</h3>
          <p>Canvas Rendering</p>
          <ul>
            <li>✅ Symbol rendering</li>
            <li>✅ Wire rendering</li>
            <li>✅ Pan/zoom controls</li>
            <li>✅ Symbol placement</li>
            <li>⚪ Wire tool</li>
          </ul>
          <h3 style={{ marginTop: '2rem' }}>Wire Colors</h3>
          <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#FF6B6B' }}></div>
              <span>W001 - 24V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#4ECDC4' }}></div>
              <span>W002 - 0V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#45B7D1' }}></div>
              <span>W003 - 24V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#FFA07A' }}></div>
              <span>W004 - COIL_24V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#98D8C8' }}></div>
              <span>W005 - START_SEAL</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#FFD93D' }}></div>
              <span>W006 - START_SEAL</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#6BCF7F' }}></div>
              <span>W007 - 0V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#C77DFF' }}></div>
              <span>W008 - 0V</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#FF9ECD' }}></div>
              <span>W009 - L1</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#74C0FC' }}></div>
              <span>W010 - L2</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '3px', background: '#FFA94D' }}></div>
              <span>W011 - L3</span>
            </div>
          </div>
          <h3 style={{ marginTop: '2rem' }}>Tools</h3>
          <div className="toolbar">
            <button
              className={`tool-btn ${interactionMode === 'select' ? 'active' : ''}`}
              onClick={() => {
                setInteractionMode('select');
                setPlacementCategory(null);
                setWireStart(null);
              }}
            >
              Select
            </button>
            <button
              className={`tool-btn ${interactionMode === 'wire' ? 'active' : ''}`}
              onClick={() => {
                setInteractionMode('wire');
                setPlacementCategory(null);
                setSelectedDevice(null);
              }}
            >
              Wire
            </button>
          </div>

          <h3 style={{ marginTop: '1.5rem' }}>Symbol Palette</h3>
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
                    setSelectedDevice(null);
                  }
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Status messages */}
          {interactionMode === 'place' && placementCategory && (
            <p className="status-message success">
              Click to place {SYMBOL_CATEGORIES.find(c => c.id === placementCategory)?.label}. ESC to cancel.
            </p>
          )}
          {interactionMode === 'wire' && (
            <p className="status-message info">
              {wireStart
                ? `Wire from ${wireStart.device}:${wireStart.pin}. Click another pin to connect. ESC to cancel.`
                : 'Click a pin to start wire.'}
            </p>
          )}
          {selectedDevice && interactionMode === 'select' && (
            <p className="status-message info">
              Selected: {selectedDevice}. Press Delete to remove.
            </p>
          )}

          <h3 style={{ marginTop: '1.5rem' }}>Controls</h3>
          <ul>
            <li>Drag canvas to pan</li>
            <li>Scroll to zoom</li>
            <li>Select + drag symbol to move</li>
            <li>Delete/Backspace to remove</li>
          </ul>
          <h3 style={{ marginTop: '2rem' }}>Debug Mode</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show wire labels</span>
          </label>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
            Shows wire numbers (W001, W002), net names, and device:pin labels at connection points.
          </p>
        </aside>

        <main className="canvas-container">
          <canvas ref={canvasRef} className="canvas" />
        </main>
      </div>
    </div>
  );
}

/**
 * Symbol Editor - Visual tool for creating and editing symbols
 *
 * Features:
 * - Canvas with grid for drawing symbol graphics
 * - Drawing tools: line, rectangle, circle, polyline
 * - Pin placement tool
 * - Path selection, dragging, and deletion
 * - Undo/redo (Cmd+Z / Cmd+Shift+Z)
 * - Better polyline UX: vertex dots, Escape cancels, Backspace removes last vertex
 * - Zoom & pan: scroll to zoom, shift+drag or middle-drag to pan
 * - Real-time preview
 * - Export to JSON symbol format
 * - Persistence via storage provider (custom symbols survive reload)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { SymbolDefinition, SymbolPrimitive, PinDirection, PinType } from '@fusion-cad/core-model';
import { generateId, registerSymbol, getSymbolById } from '@fusion-cad/core-model';
import type { StorageProvider } from '../storage/storage-provider';

type EditorTool = 'select' | 'line' | 'rect' | 'circle' | 'polyline' | 'pin';

interface Point {
  x: number;
  y: number;
}

interface EditorPath {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'polyline';
  points: Point[];
  // For circle: points[0] = center, radius stored separately
  radius?: number;
}

interface EditorPin {
  id: string;
  name: string;
  position: Point;
  direction: PinDirection;
  pinType: PinType;
}

interface EditorSnapshot {
  paths: EditorPath[];
  pins: EditorPin[];
}

interface SymbolEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (symbol: SymbolDefinition) => void;
  editSymbolId?: string;
  storageProvider?: StorageProvider;
}

const GRID_SIZE = 5;
const PREVIEW_SCALE = 0.8;
const MAX_EDITOR_HISTORY = 50;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// ---------------------------------------------------------------------------
// Hit-testing utilities
// ---------------------------------------------------------------------------

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitTestPath(path: EditorPath, point: Point, radius: number): boolean {
  if (path.type === 'line' && path.points.length >= 2) {
    return pointToSegmentDist(point, path.points[0], path.points[1]) <= radius;
  }
  if (path.type === 'polyline' && path.points.length >= 2) {
    for (let i = 0; i < path.points.length - 1; i++) {
      if (pointToSegmentDist(point, path.points[i], path.points[i + 1]) <= radius) {
        return true;
      }
    }
    return false;
  }
  if (path.type === 'rect' && path.points.length >= 2) {
    const [p1, p2] = path.points;
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    const corners: Point[] = [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    ];
    for (let i = 0; i < 4; i++) {
      if (pointToSegmentDist(point, corners[i], corners[(i + 1) % 4]) <= radius) {
        return true;
      }
    }
    return false;
  }
  if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
    const dist = Math.hypot(point.x - path.points[0].x, point.y - path.points[0].y);
    return Math.abs(dist - path.radius) <= radius;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Primitive → EditorPath conversion (Task 1)
// ---------------------------------------------------------------------------

/**
 * Convert typed SymbolPrimitives back to EditorPaths for editing.
 * Supports line, rect, circle, polyline. Skips unsupported types with a warning.
 */
function primitivesToEditorPaths(primitives: SymbolPrimitive[]): EditorPath[] {
  const result: EditorPath[] = [];
  for (const prim of primitives) {
    const id = `path-${result.length}`;
    switch (prim.type) {
      case 'line':
        result.push({ id, type: 'line', points: [{ x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }] });
        break;
      case 'rect':
        result.push({ id, type: 'rect', points: [{ x: prim.x, y: prim.y }, { x: prim.x + prim.width, y: prim.y + prim.height }] });
        break;
      case 'circle':
        result.push({ id, type: 'circle', points: [{ x: prim.cx, y: prim.cy }], radius: prim.r });
        break;
      case 'polyline':
        result.push({ id, type: 'polyline', points: prim.points.map(p => ({ x: p.x, y: p.y })) });
        break;
      default:
        console.warn(`SymbolEditor: skipping unsupported primitive type '${(prim as any).type}'`);
    }
  }
  return result;
}

export function SymbolEditor({ isOpen, onClose, onSave, editSymbolId, storageProvider }: SymbolEditorProps) {
  // Symbol metadata
  const [symbolName, setSymbolName] = useState('New Symbol');
  const [symbolCategory, setSymbolCategory] = useState('Custom');
  const [tagPrefix, setTagPrefix] = useState('D');
  const [symbolWidth, setSymbolWidth] = useState(40);
  const [symbolHeight, setSymbolHeight] = useState(60);

  // Drawing state
  const [paths, setPaths] = useState<EditorPath[]>([]);
  const [pins, setPins] = useState<EditorPin[]>([]);
  const [selectedTool, setSelectedTool] = useState<EditorTool>('line');
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Drawing in progress
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<EditorPath | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);

  // Drag state for moving selected path
  const [isDraggingPath, setIsDraggingPath] = useState(false);
  const dragStartRef = useRef<Point | null>(null);

  // Viewport state (Task 3)
  const [viewport, setViewport] = useState({ offsetX: 0, offsetY: 0, scale: 1 });

  // Pan state (Task 4)
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<Point | null>(null);

  // Dynamic canvas sizing (Task 2)
  const [canvasWidth, setCanvasWidth] = useState(500);
  const [canvasHeight, setCanvasHeight] = useState(500);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Undo/redo history
  const [editorHistory, setEditorHistory] = useState<EditorSnapshot[]>([]);
  const [editorHistoryIndex, setEditorHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Push current state onto the history stack (call BEFORE mutation)
  const pushEditorHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    const snapshot: EditorSnapshot = {
      paths: paths.map(p => ({ ...p, points: [...p.points] })),
      pins: pins.map(p => ({ ...p, position: { ...p.position } })),
    };
    setEditorHistory(prev => {
      const trimmed = prev.slice(0, editorHistoryIndex + 1);
      trimmed.push(snapshot);
      if (trimmed.length > MAX_EDITOR_HISTORY) return trimmed.slice(-MAX_EDITOR_HISTORY);
      return trimmed;
    });
    setEditorHistoryIndex(prev => Math.min(prev + 1, MAX_EDITOR_HISTORY - 1));
  }, [paths, pins, editorHistoryIndex]);

  const editorUndo = useCallback(() => {
    if (editorHistoryIndex < 0 || editorHistory.length === 0) return;
    // Save current state for redo
    const current: EditorSnapshot = {
      paths: paths.map(p => ({ ...p, points: [...p.points] })),
      pins: pins.map(p => ({ ...p, position: { ...p.position } })),
    };
    if (editorHistoryIndex === editorHistory.length - 1) {
      setEditorHistory(prev => [...prev, current]);
    }
    const snapshot = editorHistory[editorHistoryIndex];
    if (!snapshot) return;
    isUndoRedoRef.current = true;
    setPaths(snapshot.paths.map(p => ({ ...p, points: [...p.points] })));
    setPins(snapshot.pins.map(p => ({ ...p, position: { ...p.position } })));
    setEditorHistoryIndex(editorHistoryIndex - 1);
    setSelectedPathId(null);
    setSelectedPinId(null);
    setTimeout(() => { isUndoRedoRef.current = false; }, 0);
  }, [editorHistory, editorHistoryIndex, paths, pins]);

  const editorRedo = useCallback(() => {
    const targetIndex = editorHistoryIndex + 2;
    if (targetIndex >= editorHistory.length) return;
    const snapshot = editorHistory[targetIndex];
    if (!snapshot) return;
    isUndoRedoRef.current = true;
    setPaths(snapshot.paths.map(p => ({ ...p, points: [...p.points] })));
    setPins(snapshot.pins.map(p => ({ ...p, position: { ...p.position } })));
    setEditorHistoryIndex(editorHistoryIndex + 1);
    setSelectedPathId(null);
    setSelectedPinId(null);
    setTimeout(() => { isUndoRedoRef.current = false; }, 0);
  }, [editorHistory, editorHistoryIndex]);

  // Keyboard shortcuts for undo/redo/delete/escape/backspace
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Undo: Cmd/Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editorUndo();
        return;
      }
      // Redo: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        editorRedo();
        return;
      }
      // Delete selected
      if (e.key === 'Delete' || (e.key === 'Backspace' && !isDrawing)) {
        if (selectedPathId || selectedPinId) {
          e.preventDefault();
          handleDelete();
          return;
        }
      }
      // Backspace during polyline: remove last vertex
      if (e.key === 'Backspace' && isDrawing && currentPath?.type === 'polyline') {
        e.preventDefault();
        if (currentPath.points.length > 1) {
          setCurrentPath({
            ...currentPath,
            points: currentPath.points.slice(0, -1),
          });
        }
        return;
      }
      // Escape: cancel in-progress polyline or deselect
      if (e.key === 'Escape') {
        if (isDrawing) {
          e.preventDefault();
          setIsDrawing(false);
          setCurrentPath(null);
          setStartPoint(null);
        } else {
          setSelectedPathId(null);
          setSelectedPinId(null);
        }
        return;
      }
    };
    // Capture phase to intercept before canvas handlers
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, editorUndo, editorRedo, selectedPathId, selectedPinId, isDrawing, currentPath]);

  // Load existing symbol for editing + auto-center (Task 1 + Task 3)
  useEffect(() => {
    if (!isOpen) return;

    let symWidth = 40;
    let symHeight = 60;

    if (editSymbolId) {
      const existing = getSymbolById(editSymbolId);
      if (existing) {
        setSymbolName(existing.name);
        setSymbolCategory(existing.category);
        setTagPrefix(existing.tagPrefix || 'D');
        setSymbolWidth(existing.geometry.width);
        setSymbolHeight(existing.geometry.height);
        symWidth = existing.geometry.width;
        symHeight = existing.geometry.height;

        // Load from primitives first (preserves types), fall back to legacy paths
        let loadedPaths: EditorPath[];
        if (existing.primitives && existing.primitives.length > 0) {
          loadedPaths = primitivesToEditorPaths(existing.primitives);
        } else {
          loadedPaths = (existing.paths || []).map((p, i) => ({
            id: `path-${i}`,
            type: 'polyline' as const,
            points: parseSvgPath(p.d),
          }));
        }
        setPaths(loadedPaths);

        const loadedPins: EditorPin[] = existing.pins.map(p => ({
          id: p.id,
          name: p.name,
          position: { x: p.position.x, y: p.position.y },
          direction: p.direction,
          pinType: p.pinType,
        }));
        setPins(loadedPins);
      }
    }

    // Auto-center after layout settles
    const raf = requestAnimationFrame(() => {
      const container = canvasContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width) || 500;
      const h = Math.floor(rect.height) || 500;
      setCanvasWidth(w);
      setCanvasHeight(h);

      const padding = 40;
      const scaleX = (w - padding * 2) / symWidth;
      const scaleY = (h - padding * 2) / symHeight;
      const newScale = Math.max(0.25, Math.min(4.0, Math.min(scaleX, scaleY)));
      setViewport({
        scale: newScale,
        offsetX: (w - symWidth * newScale) / 2,
        offsetY: (h - symHeight * newScale) / 2,
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [editSymbolId, isOpen]);

  // ResizeObserver for dynamic canvas sizing (Task 2)
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || !isOpen) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasWidth(Math.floor(width));
          setCanvasHeight(Math.floor(height));
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isOpen]);

  // Wheel zoom handler (Task 4)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setViewport(prev => {
        const newScale = Math.max(0.25, Math.min(4.0, prev.scale * factor));
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          offsetX: mouseX - (mouseX - prev.offsetX) * ratio,
          offsetY: mouseY - (mouseY - prev.offsetY) * ratio,
        };
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  function parseSvgPath(d: string): Point[] {
    const points: Point[] = [];
    const commands = d.match(/[MLZmlz][^MLZmlz]*/g) || [];
    let currentX = 0, currentY = 0;

    for (const cmd of commands) {
      const type = cmd[0];
      const coords = cmd.slice(1).trim().split(/[\s,]+/).map(Number);

      if (type === 'M' || type === 'L') {
        for (let i = 0; i < coords.length; i += 2) {
          currentX = coords[i];
          currentY = coords[i + 1];
          points.push({ x: currentX, y: currentY });
        }
      } else if (type === 'm' || type === 'l') {
        for (let i = 0; i < coords.length; i += 2) {
          currentX += coords[i];
          currentY += coords[i + 1];
          points.push({ x: currentX, y: currentY });
        }
      }
    }
    return points;
  }

  function pathsToSvgD(editorPaths: EditorPath[]): string {
    const parts: string[] = [];

    for (const path of editorPaths) {
      if (path.type === 'line' && path.points.length >= 2) {
        parts.push(`M${path.points[0].x},${path.points[0].y}L${path.points[1].x},${path.points[1].y}`);
      } else if (path.type === 'rect' && path.points.length >= 2) {
        const [p1, p2] = path.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        parts.push(`M${x},${y}h${w}v${h}h${-w}Z`);
      } else if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
        const cx = path.points[0].x;
        const cy = path.points[0].y;
        const r = path.radius;
        parts.push(`M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`);
      } else if (path.type === 'polyline' && path.points.length >= 2) {
        const pts = path.points;
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
          d += `L${pts[i].x},${pts[i].y}`;
        }
        parts.push(d);
      }
    }

    return parts.join('');
  }

  /**
   * Convert editor paths to typed SymbolPrimitive array.
   * This preserves semantic type info (rect, circle, line) instead of
   * flattening to SVG d strings.
   */
  function editorPathsToPrimitives(editorPaths: EditorPath[]): SymbolPrimitive[] {
    const result: SymbolPrimitive[] = [];

    for (const path of editorPaths) {
      if (path.type === 'line' && path.points.length >= 2) {
        result.push({
          type: 'line',
          x1: path.points[0].x, y1: path.points[0].y,
          x2: path.points[1].x, y2: path.points[1].y,
        });
      } else if (path.type === 'rect' && path.points.length >= 2) {
        const [p1, p2] = path.points;
        result.push({
          type: 'rect',
          x: Math.min(p1.x, p2.x),
          y: Math.min(p1.y, p2.y),
          width: Math.abs(p2.x - p1.x),
          height: Math.abs(p2.y - p1.y),
        });
      } else if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
        result.push({
          type: 'circle',
          cx: path.points[0].x,
          cy: path.points[0].y,
          r: path.radius,
        });
      } else if (path.type === 'polyline' && path.points.length >= 2) {
        result.push({
          type: 'polyline',
          points: path.points.map(p => ({ x: p.x, y: p.y })),
        });
      }
    }

    return result;
  }

  // Render the editor canvas (Task 3: viewport transform)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { offsetX, offsetY, scale } = viewport;

    // Clear full canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Compute visible world bounds for grid
    const worldLeft = -offsetX / scale;
    const worldTop = -offsetY / scale;
    const worldRight = (canvasWidth - offsetX) / scale;
    const worldBottom = (canvasHeight - offsetY) / scale;

    // Draw grid (only visible lines)
    const gridLeft = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const gridTop = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
    const gridRight = Math.ceil(worldRight / GRID_SIZE) * GRID_SIZE;
    const gridBottom = Math.ceil(worldBottom / GRID_SIZE) * GRID_SIZE;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5 / scale;
    for (let x = gridLeft; x <= gridRight; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, gridTop);
      ctx.lineTo(x, gridBottom);
      ctx.stroke();
    }
    for (let y = gridTop; y <= gridBottom; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(gridLeft, y);
      ctx.lineTo(gridRight, y);
      ctx.stroke();
    }

    // Symbol boundary
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([4 / scale, 4 / scale]);
    ctx.strokeRect(0, 0, symbolWidth, symbolHeight);
    ctx.setLineDash([]);

    // Draw paths
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of paths) {
      const isSelected = path.id === selectedPathId;
      ctx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';

      if (path.type === 'line' && path.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        ctx.lineTo(path.points[1].x, path.points[1].y);
        ctx.stroke();
      } else if (path.type === 'rect' && path.points.length >= 2) {
        const [p1, p2] = path.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
      } else if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
        ctx.beginPath();
        ctx.arc(path.points[0].x, path.points[0].y, path.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (path.type === 'polyline' && path.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      }
    }

    // Draw current path being drawn
    if (currentPath && currentPath.points.length > 0) {
      ctx.strokeStyle = '#00ffff';
      ctx.setLineDash([2 / scale, 2 / scale]);

      if (currentPath.type === 'line' && currentPath.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(currentPath.points[0].x, currentPath.points[0].y);
        ctx.lineTo(currentPath.points[1].x, currentPath.points[1].y);
        ctx.stroke();
      } else if (currentPath.type === 'rect' && currentPath.points.length >= 2) {
        const [p1, p2] = currentPath.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
      } else if (currentPath.type === 'circle' && currentPath.radius) {
        ctx.beginPath();
        ctx.arc(currentPath.points[0].x, currentPath.points[0].y, currentPath.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (currentPath.type === 'polyline') {
        ctx.beginPath();
        ctx.moveTo(currentPath.points[0].x, currentPath.points[0].y);
        for (let i = 1; i < currentPath.points.length; i++) {
          ctx.lineTo(currentPath.points[i].x, currentPath.points[i].y);
        }
        ctx.stroke();

        // Draw vertex dots for polyline in progress
        ctx.setLineDash([]);
        ctx.fillStyle = '#00ffff';
        for (const pt of currentPath.points) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3 / scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.setLineDash([]);
    }

    // Draw pins
    for (const pin of pins) {
      const isSelected = pin.id === selectedPinId;
      ctx.fillStyle = isSelected ? '#ffff00' : '#ff6600';
      ctx.beginPath();
      ctx.arc(pin.position.x, pin.position.y, 4 / scale, 0, Math.PI * 2);
      ctx.fill();

      // Pin direction indicator
      ctx.strokeStyle = isSelected ? '#ffff00' : '#ff6600';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      const len = 8 / scale;
      switch (pin.direction) {
        case 'left':
          ctx.moveTo(pin.position.x, pin.position.y);
          ctx.lineTo(pin.position.x - len, pin.position.y);
          break;
        case 'right':
          ctx.moveTo(pin.position.x, pin.position.y);
          ctx.lineTo(pin.position.x + len, pin.position.y);
          break;
        case 'top':
          ctx.moveTo(pin.position.x, pin.position.y);
          ctx.lineTo(pin.position.x, pin.position.y - len);
          break;
        case 'bottom':
          ctx.moveTo(pin.position.x, pin.position.y);
          ctx.lineTo(pin.position.x, pin.position.y + len);
          break;
      }
      ctx.stroke();

      // Pin name
      ctx.fillStyle = '#fff';
      ctx.font = `${10 / scale}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pin.name, pin.position.x, pin.position.y - 12 / scale);
    }

    ctx.restore();
  }, [paths, pins, currentPath, selectedPathId, selectedPinId, symbolWidth, symbolHeight, viewport, canvasWidth, canvasHeight]);

  // Render preview
  const renderPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewSize = 100;
    canvas.width = previewSize;
    canvas.height = previewSize;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, previewSize, previewSize);

    const scale = Math.min(
      (previewSize - 20) / symbolWidth,
      (previewSize - 20) / symbolHeight
    ) * PREVIEW_SCALE;
    const pOffsetX = (previewSize - symbolWidth * scale) / 2;
    const pOffsetY = (previewSize - symbolHeight * scale) / 2;

    ctx.save();
    ctx.translate(pOffsetX, pOffsetY);
    ctx.scale(scale, scale);

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of paths) {
      if (path.type === 'line' && path.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        ctx.lineTo(path.points[1].x, path.points[1].y);
        ctx.stroke();
      } else if (path.type === 'rect' && path.points.length >= 2) {
        const [p1, p2] = path.points;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.strokeRect(x, y, w, h);
      } else if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
        ctx.beginPath();
        ctx.arc(path.points[0].x, path.points[0].y, path.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (path.type === 'polyline' && path.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
      }
    }

    for (const pin of pins) {
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(pin.position.x, pin.position.y, 3 / scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [paths, pins, symbolWidth, symbolHeight]);

  // Re-render on state changes
  useEffect(() => {
    renderCanvas();
    renderPreview();
  }, [renderCanvas, renderPreview]);

  // Coordinate conversion helpers (Task 3)
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: snapToGrid((e.clientX - rect.left - viewport.offsetX) / viewport.scale),
      y: snapToGrid((e.clientY - rect.top - viewport.offsetY) / viewport.scale),
    };
  };

  /** Un-snapped world position for hit testing */
  const getWorldPos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - viewport.offsetX) / viewport.scale,
      y: (e.clientY - rect.top - viewport.offsetY) / viewport.scale,
    };
  };

  /** Screen position for panning */
  const getScreenPos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevent middle-click auto-scroll
    if (e.button === 1) e.preventDefault();

    // Pan: middle button or Shift+left (Task 4)
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      const screen = getScreenPos(e);
      setIsPanning(true);
      panStartRef.current = screen;
      return;
    }

    // Only process left-click for tools
    if (e.button !== 0) return;

    const pos = getMousePos(e);

    if (selectedTool === 'select') {
      const worldPos = getWorldPos(e);
      const hitRadius = 6 / viewport.scale;

      // Check if clicking on a pin
      const clickedPin = pins.find(p =>
        Math.abs(p.position.x - worldPos.x) < hitRadius && Math.abs(p.position.y - worldPos.y) < hitRadius
      );
      if (clickedPin) {
        setSelectedPinId(clickedPin.id);
        setSelectedPathId(null);
        return;
      }

      // Check if clicking on a path (reverse z-order for top-most first)
      for (let i = paths.length - 1; i >= 0; i--) {
        if (hitTestPath(paths[i], worldPos, hitRadius)) {
          setSelectedPathId(paths[i].id);
          setSelectedPinId(null);
          // Start drag
          setIsDraggingPath(true);
          dragStartRef.current = pos;
          return;
        }
      }

      setSelectedPathId(null);
      setSelectedPinId(null);
      return;
    }

    if (selectedTool === 'pin') {
      pushEditorHistory();
      const newPin: EditorPin = {
        id: `pin-${Date.now()}`,
        name: `${pins.length + 1}`,
        position: pos,
        direction: 'top',
        pinType: 'passive',
      };
      setPins([...pins, newPin]);
      setSelectedPinId(newPin.id);
      return;
    }

    // Start drawing
    setIsDrawing(true);
    setStartPoint(pos);

    const newPath: EditorPath = {
      id: `path-${Date.now()}`,
      type: selectedTool === 'polyline' ? 'polyline' : selectedTool as 'line' | 'rect' | 'circle',
      points: [pos],
    };

    if (selectedTool === 'circle') {
      newPath.radius = 0;
    }

    setCurrentPath(newPath);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Pan in progress (Task 4)
    if (isPanning && panStartRef.current) {
      const screen = getScreenPos(e);
      const dx = screen.x - panStartRef.current.x;
      const dy = screen.y - panStartRef.current.y;
      panStartRef.current = screen;
      setViewport(prev => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
      return;
    }

    const pos = getMousePos(e);

    // Drag selected path
    if (isDraggingPath && selectedPathId && dragStartRef.current) {
      const dx = pos.x - dragStartRef.current.x;
      const dy = pos.y - dragStartRef.current.y;
      if (dx === 0 && dy === 0) return;
      setPaths(prev => prev.map(p => {
        if (p.id !== selectedPathId) return p;
        return {
          ...p,
          points: p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })),
        };
      }));
      dragStartRef.current = pos;
      return;
    }

    if (!isDrawing || !currentPath || !startPoint) return;

    if (currentPath.type === 'line' || currentPath.type === 'rect') {
      setCurrentPath({
        ...currentPath,
        points: [startPoint, pos],
      });
    } else if (currentPath.type === 'circle') {
      const dx = pos.x - startPoint.x;
      const dy = pos.y - startPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      setCurrentPath({
        ...currentPath,
        points: [startPoint],
        radius: snapToGrid(radius),
      });
    } else if (currentPath.type === 'polyline') {
      const pts = [...currentPath.points];
      if (pts.length > 1) {
        pts[pts.length - 1] = pos;
      } else {
        pts.push(pos);
      }
      setCurrentPath({ ...currentPath, points: pts });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // End pan (Task 4)
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }

    // End path drag
    if (isDraggingPath) {
      setIsDraggingPath(false);
      dragStartRef.current = null;
      return;
    }

    if (!isDrawing || !currentPath) {
      setIsDrawing(false);
      return;
    }

    const pos = getMousePos(e);

    if (currentPath.type === 'polyline') {
      const pts = [...currentPath.points];
      if (pts.length === 1 || (pts.length > 1 && pts[pts.length - 1] !== pos)) {
        pts.push(pos);
      }
      setCurrentPath({ ...currentPath, points: pts });
      return;
    }

    // Finalize the path
    if (currentPath.type === 'line' || currentPath.type === 'rect') {
      currentPath.points = [startPoint!, pos];
    }

    const isValid =
      (currentPath.type === 'circle' && currentPath.radius && currentPath.radius > 5) ||
      (currentPath.type !== 'circle' && currentPath.points.length >= 2 &&
        (Math.abs(currentPath.points[1].x - currentPath.points[0].x) > 2 ||
         Math.abs(currentPath.points[1].y - currentPath.points[0].y) > 2));

    if (isValid) {
      pushEditorHistory();
      setPaths([...paths, currentPath]);
    }

    setIsDrawing(false);
    setCurrentPath(null);
    setStartPoint(null);
  };

  const handleDoubleClick = () => {
    if (isDrawing && currentPath && currentPath.type === 'polyline' && currentPath.points.length >= 2) {
      pushEditorHistory();
      setPaths([...paths, currentPath]);
      setIsDrawing(false);
      setCurrentPath(null);
      setStartPoint(null);
    }
  };

  // Delete selected element (with history)
  const handleDelete = useCallback(() => {
    if (selectedPathId) {
      pushEditorHistory();
      setPaths(prev => prev.filter(p => p.id !== selectedPathId));
      setSelectedPathId(null);
    }
    if (selectedPinId) {
      pushEditorHistory();
      setPins(prev => prev.filter(p => p.id !== selectedPinId));
      setSelectedPinId(null);
    }
  }, [selectedPathId, selectedPinId, pushEditorHistory]);

  // Update selected pin
  const updateSelectedPin = (updates: Partial<EditorPin>) => {
    if (!selectedPinId) return;
    setPins(pins.map(p => p.id === selectedPinId ? { ...p, ...updates } : p));
  };

  // Zoom controls (Task 5)
  const zoomToFit = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width) || canvasWidth;
    const h = Math.floor(rect.height) || canvasHeight;

    const padding = 40;
    const scaleX = (w - padding * 2) / symbolWidth;
    const scaleY = (h - padding * 2) / symbolHeight;
    const newScale = Math.max(0.25, Math.min(4.0, Math.min(scaleX, scaleY)));
    setViewport({
      scale: newScale,
      offsetX: (w - symbolWidth * newScale) / 2,
      offsetY: (h - symbolHeight * newScale) / 2,
    });
  }, [canvasWidth, canvasHeight, symbolWidth, symbolHeight]);

  const zoomIn = useCallback(() => {
    setViewport(prev => {
      const newScale = Math.max(0.25, Math.min(4.0, prev.scale * 1.25));
      const ratio = newScale / prev.scale;
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      return {
        scale: newScale,
        offsetX: cx - (cx - prev.offsetX) * ratio,
        offsetY: cy - (cy - prev.offsetY) * ratio,
      };
    });
  }, [canvasWidth, canvasHeight]);

  const zoomOut = useCallback(() => {
    setViewport(prev => {
      const newScale = Math.max(0.25, Math.min(4.0, prev.scale * 0.8));
      const ratio = newScale / prev.scale;
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      return {
        scale: newScale,
        offsetX: cx - (cx - prev.offsetX) * ratio,
        offsetY: cy - (cy - prev.offsetY) * ratio,
      };
    });
  }, [canvasWidth, canvasHeight]);

  // Save symbol
  const handleSave = async () => {
    const primitivesList = editorPathsToPrimitives(paths);
    // Also generate legacy paths for backward compat
    const svgD = pathsToSvgD(paths);

    const symbolDef: SymbolDefinition = {
      id: editSymbolId || `custom-${generateId()}`,
      type: 'symbol-definition',
      name: symbolName,
      category: symbolCategory,
      tagPrefix,
      geometry: {
        width: symbolWidth,
        height: symbolHeight,
      },
      pins: pins.map(p => ({
        id: p.id,
        name: p.name,
        position: { x: p.position.x, y: p.position.y },
        direction: p.direction,
        pinType: p.pinType,
      })),
      primitives: primitivesList.length > 0 ? primitivesList : undefined,
      paths: svgD ? [{ d: svgD, stroke: true, strokeWidth: 2 }] : [],
      source: 'custom',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    // Register in library
    registerSymbol(symbolDef);

    // Persist to storage if available
    if (storageProvider && 'saveCustomSymbol' in storageProvider) {
      try {
        await (storageProvider as any).saveCustomSymbol(symbolDef);
      } catch {
        // Silently fail - symbol is still registered in memory
      }
    }

    onSave(symbolDef);
    onClose();
  };

  // Clear all (with history)
  const handleClear = () => {
    pushEditorHistory();
    setPaths([]);
    setPins([]);
    setSelectedPathId(null);
    setSelectedPinId(null);
  };

  if (!isOpen) return null;

  const selectedPin = pins.find(p => p.id === selectedPinId);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog symbol-editor-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{editSymbolId ? 'Edit Symbol' : 'Create Symbol'}</h2>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="symbol-editor-body">
          {/* Left: Tools */}
          <div className="symbol-editor-tools">
            <h4>Tools</h4>
            <div className="tool-buttons">
              <button
                className={`tool-btn ${selectedTool === 'select' ? 'active' : ''}`}
                onClick={() => setSelectedTool('select')}
                title="Select (V)"
              >
                Select
              </button>
              <button
                className={`tool-btn ${selectedTool === 'line' ? 'active' : ''}`}
                onClick={() => setSelectedTool('line')}
                title="Line (L)"
              >
                Line
              </button>
              <button
                className={`tool-btn ${selectedTool === 'rect' ? 'active' : ''}`}
                onClick={() => setSelectedTool('rect')}
                title="Rectangle (R)"
              >
                Rect
              </button>
              <button
                className={`tool-btn ${selectedTool === 'circle' ? 'active' : ''}`}
                onClick={() => setSelectedTool('circle')}
                title="Circle (C)"
              >
                Circle
              </button>
              <button
                className={`tool-btn ${selectedTool === 'polyline' ? 'active' : ''}`}
                onClick={() => setSelectedTool('polyline')}
                title="Polyline (P) - Double-click to finish"
              >
                Polyline
              </button>
              <button
                className={`tool-btn ${selectedTool === 'pin' ? 'active' : ''}`}
                onClick={() => setSelectedTool('pin')}
                title="Add Pin (N)"
              >
                Pin
              </button>
            </div>

            <div className="tool-actions">
              <button className="action-btn" onClick={handleDelete} disabled={!selectedPathId && !selectedPinId}>
                Delete
              </button>
              <button className="action-btn" onClick={editorUndo} disabled={editorHistoryIndex < 0} title="Undo (Cmd+Z)">
                Undo
              </button>
              <button className="action-btn" onClick={editorRedo} disabled={editorHistoryIndex >= editorHistory.length - 1} title="Redo (Cmd+Shift+Z)">
                Redo
              </button>
              <button className="action-btn danger" onClick={handleClear}>
                Clear All
              </button>
            </div>

            {/* Pin properties */}
            {selectedPin && (
              <div className="pin-properties">
                <h4>Pin Properties</h4>
                <label>
                  Name:
                  <input
                    type="text"
                    value={selectedPin.name}
                    onChange={e => updateSelectedPin({ name: e.target.value })}
                  />
                </label>
                <label>
                  Direction:
                  <select
                    value={selectedPin.direction}
                    onChange={e => updateSelectedPin({ direction: e.target.value as PinDirection })}
                  >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label>
                  Type:
                  <select
                    value={selectedPin.pinType}
                    onChange={e => updateSelectedPin({ pinType: e.target.value as PinType })}
                  >
                    <option value="passive">Passive</option>
                    <option value="input">Input</option>
                    <option value="output">Output</option>
                    <option value="power">Power</option>
                    <option value="ground">Ground</option>
                    <option value="pe">PE (Earth)</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Center: Canvas */}
          <div className="symbol-editor-canvas-area">
            <div ref={canvasContainerRef} className="symbol-editor-canvas-container">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="symbol-editor-canvas"
                style={{ cursor: isPanning ? 'grabbing' : (selectedTool === 'select' ? 'default' : 'crosshair') }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onContextMenu={e => e.preventDefault()}
              />
            </div>
            <div className="symbol-editor-zoom-controls">
              <button className="action-btn" onClick={zoomOut} title="Zoom Out">&minus;</button>
              <span className="zoom-percentage">{Math.round(viewport.scale * 100)}%</span>
              <button className="action-btn" onClick={zoomIn} title="Zoom In">+</button>
              <button className="action-btn" onClick={zoomToFit} title="Fit to View">Fit</button>
            </div>
            <div className="canvas-hint">
              {selectedTool === 'polyline' ? 'Click to add points, double-click to finish. Backspace removes last point, Escape cancels.' :
               selectedTool === 'pin' ? 'Click to place pin' :
               selectedTool === 'select' ? 'Click to select, drag to move, Delete to remove' :
               'Click and drag to draw'}
              {' \u00b7 Scroll to zoom, Shift+drag to pan'}
            </div>
          </div>

          {/* Right: Properties & Preview */}
          <div className="symbol-editor-properties">
            <h4>Symbol Properties</h4>

            <label>
              Name:
              <input
                type="text"
                value={symbolName}
                onChange={e => setSymbolName(e.target.value)}
              />
            </label>

            <label>
              Category:
              <input
                type="text"
                value={symbolCategory}
                onChange={e => setSymbolCategory(e.target.value)}
              />
            </label>

            <label>
              Tag Prefix:
              <input
                type="text"
                value={tagPrefix}
                onChange={e => setTagPrefix(e.target.value.toUpperCase())}
                maxLength={4}
              />
            </label>

            <div className="size-inputs">
              <label>
                Width:
                <input
                  type="number"
                  value={symbolWidth}
                  onChange={e => setSymbolWidth(Number(e.target.value))}
                  min={10}
                  max={200}
                  step={5}
                />
              </label>
              <label>
                Height:
                <input
                  type="number"
                  value={symbolHeight}
                  onChange={e => setSymbolHeight(Number(e.target.value))}
                  min={10}
                  max={200}
                  step={5}
                />
              </label>
            </div>

            <h4>Preview</h4>
            <canvas ref={previewCanvasRef} className="symbol-preview-canvas" />

            <div className="symbol-stats">
              <span>{paths.length} path(s)</span>
              <span>{pins.length} pin(s)</span>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={pins.length === 0}>
            {editSymbolId ? 'Save Changes' : 'Create Symbol'}
          </button>
        </div>
      </div>
    </div>
  );
}

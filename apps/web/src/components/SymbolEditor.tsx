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

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { SymbolDefinition, SymbolPrimitive, PinDirection, PinType } from '@fusion-cad/core-model';
import { generateId, registerSymbol, getSymbolById, loadSingleSymbol } from '@fusion-cad/core-model';
import { validateSymbol, type SymbolValidationReport } from '@fusion-cad/core-engine';
import type { StorageProvider } from '../storage/storage-provider';
import { saveSymbol as saveSymbolApi } from '../api/symbols';
import { getTheme } from '../renderer/theme';
import { SymbolPreview } from './SymbolPreview';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type EditorTool = 'select' | 'line' | 'rect' | 'circle' | 'polyline' | 'pin' | 'text';

interface Point {
  x: number;
  y: number;
}

interface EditorPath {
  id: string;
  type: 'line' | 'rect' | 'circle' | 'polyline' | 'arc' | 'text';
  points: Point[];
  // For circle/arc: points[0] = center, radius stored separately
  radius?: number;
  // For arc: start and end angles in radians
  startAngle?: number;
  endAngle?: number;
  // Dashed line style
  dashed?: boolean;
  // For polyline: close the path (polygon)
  closed?: boolean;
  // For text
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAnchor?: 'start' | 'center' | 'end';
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
const PIN_GRID_SIZE = 20; // Pins snap to main canvas grid for alignment
const PREVIEW_SCALE = 0.8;
const MAX_EDITOR_HISTORY = 50;

function snapToGrid(value: number, enabled = true): number {
  if (!enabled) return value;
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPinToGrid(value: number): number {
  return Math.round(value / PIN_GRID_SIZE) * PIN_GRID_SIZE;
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
    // Check closing segment for closed polylines (polygons)
    if (path.closed && path.points.length >= 3) {
      if (pointToSegmentDist(point, path.points[path.points.length - 1], path.points[0]) <= radius) {
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
  if (path.type === 'arc' && path.points.length >= 1 && path.radius) {
    const dist = Math.hypot(point.x - path.points[0].x, point.y - path.points[0].y);
    if (Math.abs(dist - path.radius) > radius) return false;
    // Check if point angle is within arc range
    const angle = Math.atan2(point.y - path.points[0].y, point.x - path.points[0].x);
    const start = path.startAngle ?? 0;
    const end = path.endAngle ?? Math.PI * 2;
    // Normalize angles
    const normalize = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const nAngle = normalize(angle);
    const nStart = normalize(start);
    const nEnd = normalize(end);
    if (nStart <= nEnd) return nAngle >= nStart && nAngle <= nEnd;
    return nAngle >= nStart || nAngle <= nEnd;
  }
  if (path.type === 'text' && path.points.length >= 1) {
    const text = path.content || '';
    const fontSize = path.fontSize ?? 12;
    // Approximate text bounding box
    const charWidth = fontSize * 0.6;
    const textWidth = text.length * charWidth;
    const textHeight = fontSize;
    const anchor = path.textAnchor || 'center';
    let left = path.points[0].x;
    if (anchor === 'center') left -= textWidth / 2;
    else if (anchor === 'end') left -= textWidth;
    const top = path.points[0].y - textHeight / 2;
    return (
      point.x >= left - radius && point.x <= left + textWidth + radius &&
      point.y >= top - radius && point.y <= top + textHeight + radius
    );
  }
  return false;
}

/** Axis-aligned bounding box of an EditorPath (for marquee intersection). */
function getPathBounds(path: EditorPath): { minX: number; minY: number; maxX: number; maxY: number } {
  if (path.type === 'circle' && path.points.length >= 1 && path.radius) {
    const c = path.points[0];
    const r = path.radius;
    return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  }
  if (path.type === 'arc' && path.points.length >= 1 && path.radius) {
    const c = path.points[0];
    const r = path.radius;
    return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  }
  if (path.type === 'text' && path.points.length >= 1) {
    const fontSize = path.fontSize ?? 12;
    const charWidth = fontSize * 0.6;
    const text = path.content || '';
    const textWidth = text.length * charWidth;
    const anchor = path.textAnchor || 'center';
    let left = path.points[0].x;
    if (anchor === 'center') left -= textWidth / 2;
    else if (anchor === 'end') left -= textWidth;
    return { minX: left, minY: path.points[0].y - fontSize / 2, maxX: left + textWidth, maxY: path.points[0].y + fontSize / 2 };
  }
  // line, rect, polyline: just use all points
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of path.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, maxX, maxY };
}

/** AABB intersection test */
function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---------------------------------------------------------------------------
// Handle positions for resize/vertex editing
// ---------------------------------------------------------------------------

function getRectHandles(path: EditorPath): { id: string; pos: Point; cursor: string }[] {
  if (path.type !== 'rect' || path.points.length < 2) return [];
  const [p1, p2] = path.points;
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x);
  const h = Math.abs(p2.y - p1.y);
  return [
    { id: 'nw', pos: { x, y }, cursor: 'nw-resize' },
    { id: 'n', pos: { x: x + w / 2, y }, cursor: 'n-resize' },
    { id: 'ne', pos: { x: x + w, y }, cursor: 'ne-resize' },
    { id: 'e', pos: { x: x + w, y: y + h / 2 }, cursor: 'e-resize' },
    { id: 'se', pos: { x: x + w, y: y + h }, cursor: 'se-resize' },
    { id: 's', pos: { x: x + w / 2, y: y + h }, cursor: 's-resize' },
    { id: 'sw', pos: { x, y: y + h }, cursor: 'sw-resize' },
    { id: 'w', pos: { x, y: y + h / 2 }, cursor: 'w-resize' },
  ];
}

function getCircleHandles(path: EditorPath): { id: string; pos: Point; cursor: string }[] {
  if (path.type !== 'circle' || !path.radius || path.points.length < 1) return [];
  const c = path.points[0];
  const r = path.radius;
  return [
    { id: 'n', pos: { x: c.x, y: c.y - r }, cursor: 'n-resize' },
    { id: 'e', pos: { x: c.x + r, y: c.y }, cursor: 'e-resize' },
    { id: 's', pos: { x: c.x, y: c.y + r }, cursor: 's-resize' },
    { id: 'w', pos: { x: c.x - r, y: c.y }, cursor: 'w-resize' },
  ];
}

function getVertexHandles(path: EditorPath): { id: string; pos: Point; cursor: string }[] {
  if (path.type !== 'polyline' && path.type !== 'line') return [];
  return path.points.map((pt, i) => ({
    id: String(i),
    pos: pt,
    cursor: 'crosshair',
  }));
}

type HandleInfo = {
  type: 'resize' | 'vertex';
  handleId: string;
  pathId: string;
  position: Point;
  cursor: string;
};

function getHandleAtPoint(
  worldPos: Point,
  selPathIds: Set<string>,
  allPaths: EditorPath[],
  scale: number,
): HandleInfo | null {
  if (selPathIds.size !== 1) return null;
  const pathId = [...selPathIds][0];
  const path = allPaths.find(p => p.id === pathId);
  if (!path) return null;

  const hitRadius = 8 / scale;
  let handles: { id: string; pos: Point; cursor: string }[] = [];
  let handleType: 'resize' | 'vertex' = 'resize';

  if (path.type === 'rect') {
    handles = getRectHandles(path);
  } else if (path.type === 'circle') {
    handles = getCircleHandles(path);
  } else if (path.type === 'polyline' || path.type === 'line') {
    handles = getVertexHandles(path);
    handleType = 'vertex';
  }

  for (const h of handles) {
    if (Math.abs(worldPos.x - h.pos.x) < hitRadius && Math.abs(worldPos.y - h.pos.y) < hitRadius) {
      return { type: handleType, handleId: h.id, pathId, position: h.pos, cursor: h.cursor };
    }
  }
  return null;
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
        result.push({ id, type: 'line', points: [{ x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }], dashed: !!(prim as any).strokeDash });
        break;
      case 'rect':
        result.push({ id, type: 'rect', points: [{ x: prim.x, y: prim.y }, { x: prim.x + prim.width, y: prim.y + prim.height }] });
        break;
      case 'circle':
        result.push({ id, type: 'circle', points: [{ x: prim.cx, y: prim.cy }], radius: prim.r });
        break;
      case 'polyline':
        result.push({ id, type: 'polyline', points: prim.points.map(p => ({ x: p.x, y: p.y })), dashed: !!(prim as any).strokeDash, closed: !!(prim as any).closed });
        break;
      case 'arc':
        result.push({ id, type: 'arc', points: [{ x: prim.cx, y: prim.cy }], radius: prim.r, startAngle: prim.startAngle, endAngle: prim.endAngle });
        break;
      case 'text':
        result.push({
          id, type: 'text',
          points: [{ x: prim.x, y: prim.y }],
          content: prim.content,
          fontSize: prim.fontSize,
          fontWeight: (prim.fontWeight as 'normal' | 'bold') ?? 'bold',
          textAnchor: (prim.textAnchor as 'start' | 'center' | 'end') ?? 'center',
        });
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
  const [symbolStandard, setSymbolStandard] = useState('common');
  const [tagPrefix, setTagPrefix] = useState('D');
  const [symbolWidth, setSymbolWidth] = useState(40);
  const [symbolHeight, setSymbolHeight] = useState(60);

  // Drawing state
  const [paths, setPaths] = useState<EditorPath[]>([]);
  const [pins, setPins] = useState<EditorPin[]>([]);
  const [selectedTool, setSelectedTool] = useState<EditorTool>('line');
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Marquee selection state
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Snap-to-grid toggle
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Drawing in progress
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<EditorPath | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);

  // Drag state for moving selected path
  const [isDraggingPath, setIsDraggingPath] = useState(false);
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const dragStartRef = useRef<Point | null>(null);

  // Handle interaction state (resize/vertex editing)
  const [activeHandle, setActiveHandle] = useState<HandleInfo | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);

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

  // AI symbol generation
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAIGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || aiGenerating) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/symbols/ai-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setAiError(data.error || 'Generation failed');
        return;
      }
      const sym = data.symbol;
      // Convert AI-generated primitives → EditorPaths
      const newPaths: EditorPath[] = [];
      for (const prim of (sym.primitives || [])) {
        const id = generateId();
        if (prim.type === 'rect') {
          newPaths.push({ id, type: 'rect', points: [{ x: prim.x, y: prim.y }, { x: prim.x + prim.width, y: prim.y + prim.height }], dashed: !!prim.strokeDash });
        } else if (prim.type === 'line') {
          newPaths.push({ id, type: 'line', points: [{ x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }], dashed: !!prim.strokeDash });
        } else if (prim.type === 'circle') {
          newPaths.push({ id, type: 'circle', points: [{ x: prim.cx, y: prim.cy }], radius: prim.r, dashed: !!prim.strokeDash });
        } else if (prim.type === 'polyline') {
          newPaths.push({ id, type: 'polyline', points: prim.points.map((p: any) => ({ x: p.x, y: p.y })), closed: prim.closed, dashed: !!prim.strokeDash });
        } else if (prim.type === 'arc') {
          newPaths.push({ id, type: 'arc', points: [{ x: prim.cx, y: prim.cy }], radius: prim.r, startAngle: prim.startAngle, endAngle: prim.endAngle, dashed: !!prim.strokeDash });
        } else if (prim.type === 'text') {
          newPaths.push({ id, type: 'text', points: [{ x: prim.x, y: prim.y }], content: prim.content, fontSize: prim.fontSize, fontWeight: prim.fontWeight, textAnchor: prim.textAnchor === 'middle' ? 'center' : prim.textAnchor });
        }
      }
      // Convert AI-generated pins → EditorPins
      const newPins: EditorPin[] = (sym.pins || []).map((p: any) => ({
        id: p.id || generateId(),
        name: p.name || p.id,
        position: { x: p.position.x, y: p.position.y },
        direction: p.direction || 'left',
        pinType: p.pinType || 'passive',
      }));
      // Apply to editor (push history first)
      pushEditorHistory();
      setPaths(newPaths);
      setPins(newPins);
      setSymbolName(sym.name);
      setSymbolCategory(sym.category);
      setTagPrefix(sym.tagPrefix || 'D');
      setSymbolWidth(sym.width);
      setSymbolHeight(sym.height);
      setSymbolStandard(sym.standard || 'common');
    } catch (err: any) {
      setAiError(err.message || 'Network error');
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrompt, aiGenerating, pushEditorHistory]);

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Build a temporary SymbolDefinition from current editor state for validation + preview
  const tempSymbolDef = useMemo((): SymbolDefinition => ({
    id: editSymbolId || 'editor-preview',
    type: 'symbol-definition',
    name: symbolName,
    category: symbolCategory,
    geometry: { width: symbolWidth, height: symbolHeight },
    pins: pins.map(p => ({ id: p.id || p.name, name: p.name, position: { ...p.position }, direction: p.direction, pinType: p.pinType })),
    primitives: editorPathsToPrimitives(paths),
    createdAt: 0,
    modifiedAt: 0,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [symbolName, symbolCategory, symbolWidth, symbolHeight, pins, paths, editSymbolId]);

  // Real-time validation
  const validationReport = useMemo((): SymbolValidationReport => {
    return validateSymbol(tempSymbolDef);
  }, [tempSymbolDef]);

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
    setSelectedPathIds(new Set());
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
    setSelectedPathIds(new Set());
    setSelectedPinId(null);
    setTimeout(() => { isUndoRedoRef.current = false; }, 0);
  }, [editorHistory, editorHistoryIndex]);

  // Duplicate selected paths
  const handleDuplicate = useCallback(() => {
    if (selectedPathIds.size === 0) return;
    pushEditorHistory();
    const offset = 20;
    const newPaths: EditorPath[] = [];
    const newIds = new Set<string>();
    for (const path of paths) {
      if (!selectedPathIds.has(path.id)) continue;
      const newId = `path-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      newPaths.push({
        ...path,
        id: newId,
        points: path.points.map(pt => ({ x: pt.x + offset, y: pt.y + offset })),
      });
      newIds.add(newId);
    }
    setPaths(prev => [...prev, ...newPaths]);
    setSelectedPathIds(newIds);
  }, [selectedPathIds, paths, pushEditorHistory]);

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
      // Select All: Cmd/Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedPathIds(new Set(paths.map(p => p.id)));
        setSelectedTool('select');
        return;
      }
      // Duplicate: Cmd/Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }
      // Delete selected
      if (e.key === 'Delete' || (e.key === 'Backspace' && !isDrawing)) {
        if (selectedPathIds.size > 0 || selectedPinId) {
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
      // Rotate selected paths: R key
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        if (selectedPathIds.size > 0) {
          e.preventDefault();
          rotatePaths(90);
          return;
        }
      }

      // Escape: cancel in-progress polyline or deselect
      if (e.key === 'Escape') {
        if (isDrawing) {
          e.preventDefault();
          setIsDrawing(false);
          setCurrentPath(null);
          setStartPoint(null);
        } else {
          setSelectedPathIds(new Set());
          setSelectedPinId(null);
        }
        return;
      }
    };
    // Capture phase to intercept before canvas handlers
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editorUndo, editorRedo, selectedPathIds, selectedPinId, isDrawing, currentPath, handleDuplicate]);

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
        setSymbolStandard(existing.standard || 'common');
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
        if (path.closed) d += 'Z';
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
        const prim: any = {
          type: 'line',
          x1: path.points[0].x, y1: path.points[0].y,
          x2: path.points[1].x, y2: path.points[1].y,
        };
        if (path.dashed) prim.strokeDash = [2, 2];
        result.push(prim);
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
        const prim: any = {
          type: 'polyline',
          points: path.points.map(p => ({ x: p.x, y: p.y })),
        };
        if (path.closed) prim.closed = true;
        if (path.dashed) prim.strokeDash = [2, 2];
        result.push(prim);
      } else if (path.type === 'arc' && path.points.length >= 1 && path.radius) {
        result.push({
          type: 'arc',
          cx: path.points[0].x,
          cy: path.points[0].y,
          r: path.radius,
          startAngle: path.startAngle ?? 0,
          endAngle: path.endAngle ?? Math.PI * 2,
        });
      } else if (path.type === 'text' && path.points.length >= 1) {
        result.push({
          type: 'text',
          x: path.points[0].x,
          y: path.points[0].y,
          content: path.content || '',
          fontSize: path.fontSize,
          fontWeight: path.fontWeight,
          textAnchor: path.textAnchor,
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
      const isSelected = selectedPathIds.has(path.id);
      ctx.strokeStyle = isSelected ? '#ffff00' : getTheme().symbolStroke;
      ctx.setLineDash(path.dashed ? [3 / scale, 3 / scale] : []);

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
        if (path.closed) ctx.closePath();
        ctx.stroke();
      } else if (path.type === 'arc' && path.points.length >= 1 && path.radius) {
        ctx.beginPath();
        ctx.arc(path.points[0].x, path.points[0].y, path.radius, path.startAngle ?? 0, path.endAngle ?? Math.PI * 2);
        ctx.stroke();
      } else if (path.type === 'text' && path.points.length >= 1) {
        const fontSize = path.fontSize ?? 12;
        const fontWeight = path.fontWeight ?? 'bold';
        ctx.fillStyle = isSelected ? '#ffff00' : getTheme().symbolStroke;
        ctx.font = `${fontWeight} ${fontSize}px monospace`;
        ctx.textAlign = (path.textAnchor as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(path.content || '', path.points[0].x, path.points[0].y);
      }
    }
    ctx.setLineDash([]);

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

    // Draw marquee selection rect
    if (marqueeRect) {
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.fillStyle = 'rgba(74, 158, 255, 0.1)';
      ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.w, marqueeRect.h);
      ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.w, marqueeRect.h);
      ctx.setLineDash([]);
    }

    // Draw handles for single-selected shape
    if (selectedPathIds.size === 1 && selectedTool === 'select') {
      const selPathId = [...selectedPathIds][0];
      const selPath = paths.find(p => p.id === selPathId);
      if (selPath) {
        const handleSize = 6 / scale;
        let handles: { id: string; pos: Point; cursor: string }[] = [];

        if (selPath.type === 'rect') {
          handles = getRectHandles(selPath);
        } else if (selPath.type === 'circle') {
          handles = getCircleHandles(selPath);
        } else if (selPath.type === 'polyline' || selPath.type === 'line') {
          handles = getVertexHandles(selPath);
        }

        ctx.setLineDash([]);
        for (const h of handles) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#4a9eff';
          ctx.lineWidth = 1.5 / scale;

          if (selPath.type === 'polyline' || selPath.type === 'line') {
            // Vertex handles as circles
            ctx.beginPath();
            ctx.arc(h.pos.x, h.pos.y, handleSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            // Resize handles as squares
            ctx.fillRect(h.pos.x - handleSize / 2, h.pos.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(h.pos.x - handleSize / 2, h.pos.y - handleSize / 2, handleSize, handleSize);
          }
        }
      }
    }

    ctx.restore();
  }, [paths, pins, currentPath, selectedPathIds, selectedPinId, symbolWidth, symbolHeight, viewport, canvasWidth, canvasHeight, marqueeRect, selectedTool]);

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

    ctx.strokeStyle = getTheme().symbolStroke;
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
        if (path.closed) ctx.closePath();
        ctx.stroke();
      } else if (path.type === 'arc' && path.points.length >= 1 && path.radius) {
        ctx.beginPath();
        ctx.arc(path.points[0].x, path.points[0].y, path.radius, path.startAngle ?? 0, path.endAngle ?? Math.PI * 2);
        ctx.stroke();
      } else if (path.type === 'text' && path.points.length >= 1) {
        const fontSize = path.fontSize ?? 12;
        const fontWeight = path.fontWeight ?? 'bold';
        ctx.fillStyle = getTheme().symbolStroke;
        ctx.font = `${fontWeight} ${fontSize}px monospace`;
        ctx.textAlign = (path.textAnchor as CanvasTextAlign) || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(path.content || '', path.points[0].x, path.points[0].y);
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
      x: snapToGrid((e.clientX - rect.left - viewport.offsetX) / viewport.scale, snapEnabled),
      y: snapToGrid((e.clientY - rect.top - viewport.offsetY) / viewport.scale, snapEnabled),
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
      const isShift = e.shiftKey;

      // Check for handle interaction (resize/vertex) before anything else
      if (selectedPathIds.size === 1) {
        const handle = getHandleAtPoint(worldPos, selectedPathIds, paths, viewport.scale);
        if (handle) {
          pushEditorHistory();
          setActiveHandle(handle);
          dragStartRef.current = pos;
          return;
        }
      }

      // Check if clicking on a pin
      const clickedPin = pins.find(p =>
        Math.abs(p.position.x - worldPos.x) < hitRadius && Math.abs(p.position.y - worldPos.y) < hitRadius
      );
      if (clickedPin) {
        setSelectedPinId(clickedPin.id);
        if (!isShift) setSelectedPathIds(new Set());
        // Start pin drag
        setIsDraggingPin(true);
        dragStartRef.current = pos;
        return;
      }

      // Check if clicking on a path (reverse z-order for top-most first)
      for (let i = paths.length - 1; i >= 0; i--) {
        if (hitTestPath(paths[i], worldPos, hitRadius)) {
          const pathId = paths[i].id;
          if (isShift) {
            // Toggle in/out of selection
            setSelectedPathIds(prev => {
              const next = new Set(prev);
              if (next.has(pathId)) next.delete(pathId);
              else next.add(pathId);
              return next;
            });
          } else {
            setSelectedPathIds(new Set([pathId]));
          }
          setSelectedPinId(null);
          // Start drag
          setIsDraggingPath(true);
          dragStartRef.current = pos;
          return;
        }
      }

      // Empty space — start marquee selection
      if (!isShift) {
        setSelectedPathIds(new Set());
        setSelectedPinId(null);
      }
      setMarqueeStart(worldPos);
      setMarqueeRect(null);
      return;
    }

    if (selectedTool === 'pin') {
      pushEditorHistory();
      // Snap pins to 20px grid so they align with the main canvas grid
      const pinPos = { x: snapPinToGrid(pos.x), y: snapPinToGrid(pos.y) };
      const newPin: EditorPin = {
        id: `pin-${Date.now()}`,
        name: `${pins.length + 1}`,
        position: pinPos,
        direction: 'top',
        pinType: 'passive',
      };
      setPins([...pins, newPin]);
      setSelectedPinId(newPin.id);
      return;
    }

    if (selectedTool === 'text') {
      pushEditorHistory();
      const newText: EditorPath = {
        id: `path-${Date.now()}`,
        type: 'text',
        points: [pos],
        content: 'Text',
        fontSize: 12,
        fontWeight: 'bold',
        textAnchor: 'center',
      };
      setPaths([...paths, newText]);
      setSelectedPathIds(new Set([newText.id]));
      setSelectedPinId(null);
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

    // Handle resize/vertex drag
    if (activeHandle && dragStartRef.current) {
      const path = paths.find(p => p.id === activeHandle.pathId);
      if (path) {
        if (activeHandle.type === 'resize' && path.type === 'rect') {
          const [p1, p2] = path.points;
          let x1 = Math.min(p1.x, p2.x), y1 = Math.min(p1.y, p2.y);
          let x2 = Math.max(p1.x, p2.x), y2 = Math.max(p1.y, p2.y);
          const h = activeHandle.handleId;
          if (h === 'nw' || h === 'w' || h === 'sw') x1 = pos.x;
          if (h === 'nw' || h === 'n' || h === 'ne') y1 = pos.y;
          if (h === 'ne' || h === 'e' || h === 'se') x2 = pos.x;
          if (h === 'se' || h === 's' || h === 'sw') y2 = pos.y;
          if (Math.abs(x2 - x1) >= 5 && Math.abs(y2 - y1) >= 5) {
            setPaths(prev => prev.map(p =>
              p.id === activeHandle.pathId
                ? { ...p, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }
                : p
            ));
          }
        } else if (activeHandle.type === 'resize' && path.type === 'circle') {
          const center = path.points[0];
          const newRadius = Math.max(5, snapToGrid(Math.hypot(pos.x - center.x, pos.y - center.y), snapEnabled));
          setPaths(prev => prev.map(p =>
            p.id === activeHandle.pathId ? { ...p, radius: newRadius } : p
          ));
        } else if (activeHandle.type === 'vertex') {
          const vertexIdx = parseInt(activeHandle.handleId);
          setPaths(prev => prev.map(p => {
            if (p.id !== activeHandle.pathId) return p;
            const newPoints = [...p.points];
            newPoints[vertexIdx] = { x: pos.x, y: pos.y };
            return { ...p, points: newPoints };
          }));
        }
      }
      dragStartRef.current = pos;
      return;
    }

    // Marquee drag
    if (marqueeStart) {
      const worldPos = getWorldPos(e);
      const x = Math.min(marqueeStart.x, worldPos.x);
      const y = Math.min(marqueeStart.y, worldPos.y);
      const w = Math.abs(worldPos.x - marqueeStart.x);
      const h = Math.abs(worldPos.y - marqueeStart.y);
      setMarqueeRect({ x, y, w, h });
      return;
    }

    // Drag selected paths (all in selection)
    if (isDraggingPath && selectedPathIds.size > 0 && dragStartRef.current) {
      const dx = pos.x - dragStartRef.current.x;
      const dy = pos.y - dragStartRef.current.y;
      if (dx === 0 && dy === 0) return;
      setPaths(prev => prev.map(p => {
        if (!selectedPathIds.has(p.id)) return p;
        return {
          ...p,
          points: p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })),
        };
      }));
      dragStartRef.current = pos;
      return;
    }

    // Drag selected pin (snap to 20px grid for main canvas alignment)
    if (isDraggingPin && selectedPinId && dragStartRef.current) {
      const pinPos = { x: snapPinToGrid(pos.x), y: snapPinToGrid(pos.y) };
      setPins(prev => prev.map(p => {
        if (p.id !== selectedPinId) return p;
        return { ...p, position: pinPos };
      }));
      dragStartRef.current = pos;
      return;
    }

    // Hover detection for handle cursors
    if (selectedTool === 'select' && !isDraggingPath && !isDraggingPin && !marqueeStart) {
      const worldPos = getWorldPos(e);
      const handle = getHandleAtPoint(worldPos, selectedPathIds, paths, viewport.scale);
      setHoveredHandle(handle?.cursor ?? null);
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

    // End handle drag
    if (activeHandle) {
      setActiveHandle(null);
      dragStartRef.current = null;
      return;
    }

    // End marquee selection
    if (marqueeStart) {
      if (marqueeRect && marqueeRect.w > 2 && marqueeRect.h > 2) {
        const hit = new Set<string>();
        for (const path of paths) {
          const b = getPathBounds(path);
          const bw = b.maxX - b.minX;
          const bh = b.maxY - b.minY;
          if (rectsIntersect(marqueeRect.x, marqueeRect.y, marqueeRect.w, marqueeRect.h, b.minX, b.minY, bw, bh)) {
            hit.add(path.id);
          }
        }
        // Also select pins inside marquee
        for (const pin of pins) {
          if (pin.position.x >= marqueeRect.x && pin.position.x <= marqueeRect.x + marqueeRect.w &&
              pin.position.y >= marqueeRect.y && pin.position.y <= marqueeRect.y + marqueeRect.h) {
            // Pin selection stays single — select last pin found
            setSelectedPinId(pin.id);
          }
        }
        if (e.shiftKey) {
          setSelectedPathIds(prev => {
            const next = new Set(prev);
            for (const id of hit) next.add(id);
            return next;
          });
        } else {
          setSelectedPathIds(hit);
        }
      }
      setMarqueeStart(null);
      setMarqueeRect(null);
      return;
    }

    // End path drag
    if (isDraggingPath) {
      setIsDraggingPath(false);
      dragStartRef.current = null;
      return;
    }

    // End pin drag
    if (isDraggingPin) {
      pushEditorHistory();
      setIsDraggingPin(false);
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

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Finalize polyline drawing
    if (isDrawing && currentPath && currentPath.type === 'polyline' && currentPath.points.length >= 2) {
      pushEditorHistory();
      setPaths([...paths, currentPath]);
      setIsDrawing(false);
      setCurrentPath(null);
      setStartPoint(null);
      return;
    }

    // Insert vertex on polyline/line segment
    if (selectedTool === 'select' && selectedPathIds.size === 1) {
      const worldPos = getWorldPos(e);
      const pathId = [...selectedPathIds][0];
      const path = paths.find(p => p.id === pathId);
      if (path && (path.type === 'polyline' || path.type === 'line')) {
        const hitRadius = 8 / viewport.scale;
        let bestDist = Infinity;
        let bestIdx = -1;
        const segCount = path.points.length - 1 + (path.closed ? 1 : 0);
        for (let i = 0; i < segCount; i++) {
          const a = path.points[i];
          const b = path.points[(i + 1) % path.points.length];
          const dist = pointToSegmentDist(worldPos, a, b);
          if (dist < hitRadius && dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          pushEditorHistory();
          const snappedPos = getMousePos(e);
          const newPoints = [...path.points];
          newPoints.splice(bestIdx + 1, 0, snappedPos);
          // If it was a line with 2 points, promote to polyline
          const newType = path.type === 'line' && newPoints.length > 2 ? 'polyline' as const : path.type;
          setPaths(prev => prev.map(p => p.id === pathId ? { ...p, type: newType, points: newPoints } : p));
        }
      }
    }
  };

  // Delete selected element (with history)
  const handleDelete = useCallback(() => {
    if (selectedPathIds.size > 0 || selectedPinId) {
      pushEditorHistory();
    }
    if (selectedPathIds.size > 0) {
      setPaths(prev => prev.filter(p => !selectedPathIds.has(p.id)));
      setSelectedPathIds(new Set());
    }
    if (selectedPinId) {
      setPins(prev => prev.filter(p => p.id !== selectedPinId));
      setSelectedPinId(null);
    }
  }, [selectedPathIds, selectedPinId, pushEditorHistory]);

  // Update selected pin
  const updateSelectedPin = (updates: Partial<EditorPin>) => {
    if (!selectedPinId) return;
    setPins(pins.map(p => p.id === selectedPinId ? { ...p, ...updates } : p));
  };

  // Update selected path(s)
  const updateSelectedPath = (updates: Partial<EditorPath>) => {
    if (selectedPathIds.size === 0) return;
    setPaths(paths.map(p => selectedPathIds.has(p.id) ? { ...p, ...updates } : p));
  };

  // Flip selected path (or all paths if none selected)
  const flipPaths = useCallback((axis: 'horizontal' | 'vertical') => {
    pushEditorHistory();
    const targetIds = selectedPathIds.size > 0 ? [...selectedPathIds] : paths.map(p => p.id);
    setPaths(prev => prev.map(p => {
      if (!targetIds.includes(p.id)) return p;
      const flipped = { ...p, points: p.points.map(pt => ({ ...pt })) };
      if (axis === 'vertical') {
        // Mirror across horizontal center: y -> symbolHeight - y
        flipped.points = flipped.points.map(pt => ({ x: pt.x, y: symbolHeight - pt.y }));
        if (flipped.type === 'arc' && flipped.startAngle != null && flipped.endAngle != null) {
          // Reflect angles across x-axis: negate angles
          const newStart = -flipped.endAngle;
          const newEnd = -flipped.startAngle;
          flipped.startAngle = newStart;
          flipped.endAngle = newEnd;
        }
      } else {
        // Mirror across vertical center: x -> symbolWidth - x
        flipped.points = flipped.points.map(pt => ({ x: symbolWidth - pt.x, y: pt.y }));
        if (flipped.type === 'arc' && flipped.startAngle != null && flipped.endAngle != null) {
          // Reflect angles across y-axis: π - angle
          const newStart = Math.PI - flipped.endAngle;
          const newEnd = Math.PI - flipped.startAngle;
          flipped.startAngle = newStart;
          flipped.endAngle = newEnd;
        }
      }
      return flipped;
    }));
    // Also flip pins if flipping all
    if (selectedPathIds.size === 0) {
      setPins(prev => prev.map(pin => {
        const flipped = { ...pin, position: { ...pin.position } };
        if (axis === 'vertical') {
          flipped.position.y = symbolHeight - flipped.position.y;
          if (flipped.direction === 'top') flipped.direction = 'bottom';
          else if (flipped.direction === 'bottom') flipped.direction = 'top';
        } else {
          flipped.position.x = symbolWidth - flipped.position.x;
          if (flipped.direction === 'left') flipped.direction = 'right';
          else if (flipped.direction === 'right') flipped.direction = 'left';
        }
        return flipped;
      }));
    }
  }, [selectedPathIds, paths, symbolWidth, symbolHeight, pushEditorHistory]);

  // Rotate selected paths around their collective center
  const rotatePaths = useCallback((angleDeg: number) => {
    if (selectedPathIds.size === 0) return;
    pushEditorHistory();
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Compute center of selected paths
    let allPts: Point[] = [];
    for (const p of paths) {
      if (!selectedPathIds.has(p.id)) continue;
      allPts = allPts.concat(p.points);
    }
    if (allPts.length === 0) return;
    const cx = allPts.reduce((s, pt) => s + pt.x, 0) / allPts.length;
    const cy = allPts.reduce((s, pt) => s + pt.y, 0) / allPts.length;

    const rotatePoint = (pt: Point): Point => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return {
        x: snapToGrid(cx + dx * cos - dy * sin, snapEnabled),
        y: snapToGrid(cy + dx * sin + dy * cos, snapEnabled),
      };
    };

    setPaths(prev => prev.map(p => {
      if (!selectedPathIds.has(p.id)) return p;
      const rotated = { ...p, points: p.points.map(rotatePoint) };
      // Rotate arc angles too
      if (rotated.type === 'arc' && rotated.startAngle != null && rotated.endAngle != null) {
        rotated.startAngle = rotated.startAngle + angleRad;
        rotated.endAngle = rotated.endAngle + angleRad;
      }
      return rotated;
    }));
  }, [selectedPathIds, paths, pushEditorHistory, snapEnabled]);

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
        id: p.name || p.id,
        name: p.name,
        position: { x: p.position.x, y: p.position.y },
        direction: p.direction,
        pinType: p.pinType,
      })),
      primitives: primitivesList.length > 0 ? primitivesList : undefined,
      paths: svgD ? [{ d: svgD, stroke: true, strokeWidth: 2 }] : [],
      standard: symbolStandard || undefined,
      source: 'custom',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    // Register in library (instant UI update)
    registerSymbol(symbolDef);

    // Persist to API (Postgres), fallback to storage provider (IndexedDB)
    try {
      await saveSymbolApi(symbolDef);
    } catch {
      if (storageProvider && 'saveCustomSymbol' in storageProvider) {
        try {
          await (storageProvider as any).saveCustomSymbol(symbolDef);
        } catch {
          // Silently fail - symbol is still registered in memory
        }
      }
    }

    onSave(symbolDef);
    onClose();
  };

  // Export symbol in builtin-symbols.json flat format (browser download)
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExportToBuiltin = async () => {
    const primitivesList = editorPathsToPrimitives(paths);
    const id = editSymbolId || `custom-${generateId()}`;

    const builtinEntry: Record<string, unknown> = {
      id,
      name: symbolName,
      category: symbolCategory,
      width: symbolWidth,
      height: symbolHeight,
      svgPath: '',
      // Include geometry wrapper for renderer compatibility
      geometry: { width: symbolWidth, height: symbolHeight },
      primitives: primitivesList.length > 0 ? primitivesList : [],
      pins: pins.map(p => ({
        id: p.name || p.id,
        name: p.name,
        x: p.position.x,
        y: p.position.y,
        direction: p.direction,
        pinType: p.pinType,
        // Also include position wrapper for renderer compatibility
        position: { x: p.position.x, y: p.position.y },
      })),
      tagPrefix,
      standard: symbolStandard || undefined,
    };

    try {
      setExportStatus('Saving...');
      const resp = await fetch(`${API_BASE}/api/symbols/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(builtinEntry),
      });
      if (!resp.ok) throw new Error(`Failed: ${resp.status}`);
      // Also register in-memory so changes take effect immediately
      loadSingleSymbol(builtinEntry as any);
      setExportStatus('Saved to library ✓');
      setTimeout(() => setExportStatus(null), 2000);
    } catch (err: any) {
      setExportStatus(`Error: ${err.message}`);
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  // Clear all (with history)
  const handleClear = () => {
    pushEditorHistory();
    setPaths([]);
    setPins([]);
    setSelectedPathIds(new Set());
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
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 1l10 6-5 1.5L6.5 14z" fill="currentColor" stroke="currentColor" strokeWidth="0.5"/></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'line' ? 'active' : ''}`}
                onClick={() => setSelectedTool('line')}
                title="Line (L)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'rect' ? 'active' : ''}`}
                onClick={() => setSelectedTool('rect')}
                title="Rectangle (R)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" rx="0.5"/></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'circle' ? 'active' : ''}`}
                onClick={() => setSelectedTool('circle')}
                title="Circle (C)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'polyline' ? 'active' : ''}`}
                onClick={() => setSelectedTool('polyline')}
                title="Polyline (P) - Double-click to finish"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><polyline points="2,13 5,4 10,10 14,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'text' ? 'active' : ''}`}
                onClick={() => setSelectedTool('text')}
                title="Text (T)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><text x="8" y="13" textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="bold" fontFamily="serif">T</text></svg>
              </button>
              <button
                className={`tool-btn ${selectedTool === 'pin' ? 'active' : ''}`}
                onClick={() => setSelectedTool('pin')}
                title="Add Pin (N)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/><line x1="8" y1="11" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>

            <div className="tool-actions">
              <button className="action-btn" onClick={handleDelete} disabled={selectedPathIds.size === 0 && !selectedPinId}>
                Delete
              </button>
              <button className="action-btn" onClick={() => rotatePaths(90)} disabled={selectedPathIds.size === 0} title="Rotate 90° CW (R)">
                Rotate
              </button>
              <button className="action-btn" onClick={() => flipPaths('vertical')} title="Flip vertically (mirror top↔bottom)">
                Flip V
              </button>
              <button className="action-btn" onClick={() => flipPaths('horizontal')} title="Flip horizontally (mirror left↔right)">
                Flip H
              </button>
              <button className="action-btn" onClick={handleDuplicate} disabled={selectedPathIds.size === 0} title="Duplicate (Cmd+D)">
                Duplicate
              </button>
              <button className="action-btn" onClick={editorUndo} disabled={editorHistoryIndex < 0} title="Undo (Cmd+Z)">
                Undo
              </button>
              <button className="action-btn" onClick={editorRedo} disabled={editorHistoryIndex >= editorHistory.length - 1} title="Redo (Cmd+Shift+Z)">
                Redo
              </button>
              <button className="action-btn" onClick={() => {
                // Select all paths
                setSelectedPathIds(new Set(paths.map(p => p.id)));
                setSelectedTool('select');
              }} disabled={paths.length === 0} title="Select All (Cmd+A)">
                Select All
              </button>
              <button className="action-btn" onClick={() => {
                if (paths.length === 0 && pins.length === 0) return;
                pushEditorHistory();
                // Compute bounding box of all paths and pins
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of paths) {
                  for (const pt of p.points) {
                    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
                    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
                  }
                  if (p.radius) {
                    const cx = p.points[0]?.x ?? 0, cy = p.points[0]?.y ?? 0;
                    minX = Math.min(minX, cx - p.radius); minY = Math.min(minY, cy - p.radius);
                    maxX = Math.max(maxX, cx + p.radius); maxY = Math.max(maxY, cy + p.radius);
                  }
                }
                for (const pin of pins) {
                  minX = Math.min(minX, pin.position.x); minY = Math.min(minY, pin.position.y);
                  maxX = Math.max(maxX, pin.position.x); maxY = Math.max(maxY, pin.position.y);
                }
                if (!isFinite(minX)) return;
                const contentW = maxX - minX, contentH = maxY - minY;
                const dx = (symbolWidth - contentW) / 2 - minX;
                const dy = (symbolHeight - contentH) / 2 - minY;
                // Snap offset to grid
                const snapDx = Math.round(dx / 5) * 5;
                const snapDy = Math.round(dy / 5) * 5;
                // Move all paths
                setPaths(prev => prev.map(p => ({
                  ...p,
                  points: p.points.map(pt => ({ x: pt.x + snapDx, y: pt.y + snapDy })),
                })));
                // Move all pins
                setPins(prev => prev.map(p => ({
                  ...p,
                  position: { x: p.position.x + snapDx, y: p.position.y + snapDy },
                })));
              }} disabled={paths.length === 0 && pins.length === 0} title="Center all primitives and pins within the bounding box">
                Center All
              </button>
              <button className="action-btn danger" onClick={handleClear}>
                Clear All
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={e => setSnapEnabled(e.target.checked)}
              />
              Snap to Grid
            </label>

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
                <div className="numeric-coords">
                  <div className="coord-row">
                    <label>X: <input type="number" value={Math.round(selectedPin.position.x)} onChange={e => updateSelectedPin({ position: { ...selectedPin.position, x: Number(e.target.value) } })} step={GRID_SIZE} /></label>
                    <label>Y: <input type="number" value={Math.round(selectedPin.position.y)} onChange={e => updateSelectedPin({ position: { ...selectedPin.position, y: Number(e.target.value) } })} step={GRID_SIZE} /></label>
                  </div>
                </div>
              </div>
            )}

            {/* Path properties (arc angles, radius) */}
            {selectedPathIds.size > 0 && (() => {
              if (selectedPathIds.size > 1) {
                // Multi-select summary
                const selectedPaths = paths.filter(p => selectedPathIds.has(p.id));
                const allSameType = selectedPaths.every(p => p.type === selectedPaths[0]?.type);
                return (
                  <div className="pin-properties">
                    <h4>{selectedPathIds.size} Items Selected</h4>
                    {allSameType && selectedPaths[0] && (
                      <label>
                        Type: <span style={{ color: getTheme().symbolStroke }}>{selectedPaths[0].type}</span>
                      </label>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={selectedPaths.every(p => !!p.dashed)}
                        onChange={e => updateSelectedPath({ dashed: e.target.checked })}
                      />
                      Dashed
                    </label>
                    {allSameType && selectedPaths[0]?.type === 'polyline' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPaths.every(p => !!p.closed)}
                          onChange={e => updateSelectedPath({ closed: e.target.checked })}
                        />
                        Closed
                      </label>
                    )}
                  </div>
                );
              }
              const selectedPath = paths.find(p => selectedPathIds.has(p.id));
              if (!selectedPath) return null;

              // Helper to update a specific point
              const updatePoint = (idx: number, axis: 'x' | 'y', val: number) => {
                setPaths(prev => prev.map(p => {
                  if (!selectedPathIds.has(p.id)) return p;
                  const newPoints = [...p.points];
                  newPoints[idx] = { ...newPoints[idx], [axis]: val };
                  return { ...p, points: newPoints };
                }));
              };

              // Rect helpers
              const rectX = selectedPath.type === 'rect' ? Math.min(selectedPath.points[0]?.x ?? 0, selectedPath.points[1]?.x ?? 0) : 0;
              const rectY = selectedPath.type === 'rect' ? Math.min(selectedPath.points[0]?.y ?? 0, selectedPath.points[1]?.y ?? 0) : 0;
              const rectW = selectedPath.type === 'rect' ? Math.abs((selectedPath.points[1]?.x ?? 0) - (selectedPath.points[0]?.x ?? 0)) : 0;
              const rectH = selectedPath.type === 'rect' ? Math.abs((selectedPath.points[1]?.y ?? 0) - (selectedPath.points[0]?.y ?? 0)) : 0;

              const updateRect = (field: 'x' | 'y' | 'w' | 'h', val: number) => {
                let x = rectX, y = rectY, w = rectW, h = rectH;
                if (field === 'x') x = val;
                if (field === 'y') y = val;
                if (field === 'w') w = Math.max(5, val);
                if (field === 'h') h = Math.max(5, val);
                setPaths(prev => prev.map(p =>
                  selectedPathIds.has(p.id)
                    ? { ...p, points: [{ x, y }, { x: x + w, y: y + h }] }
                    : p
                ));
              };

              return (
                <div className="pin-properties">
                  <h4>Path Properties</h4>
                  <label>
                    Type: <span style={{ color: getTheme().symbolStroke }}>{selectedPath.type}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={!!selectedPath.dashed}
                      onChange={e => updateSelectedPath({ dashed: e.target.checked })}
                    />
                    Dashed
                  </label>
                  {selectedPath.type === 'polyline' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={!!selectedPath.closed}
                        onChange={e => updateSelectedPath({ closed: e.target.checked })}
                      />
                      Closed
                    </label>
                  )}

                  {/* Numeric inputs for rect */}
                  {selectedPath.type === 'rect' && (
                    <div className="numeric-coords">
                      <div className="coord-row">
                        <label>X: <input type="number" value={Math.round(rectX)} onChange={e => updateRect('x', Number(e.target.value))} step={GRID_SIZE} /></label>
                        <label>Y: <input type="number" value={Math.round(rectY)} onChange={e => updateRect('y', Number(e.target.value))} step={GRID_SIZE} /></label>
                      </div>
                      <div className="coord-row">
                        <label>W: <input type="number" value={Math.round(rectW)} onChange={e => updateRect('w', Number(e.target.value))} step={GRID_SIZE} min={5} /></label>
                        <label>H: <input type="number" value={Math.round(rectH)} onChange={e => updateRect('h', Number(e.target.value))} step={GRID_SIZE} min={5} /></label>
                      </div>
                    </div>
                  )}

                  {/* Numeric inputs for circle */}
                  {selectedPath.type === 'circle' && (
                    <div className="numeric-coords">
                      <div className="coord-row">
                        <label>CX: <input type="number" value={Math.round(selectedPath.points[0]?.x ?? 0)} onChange={e => updatePoint(0, 'x', Number(e.target.value))} step={GRID_SIZE} /></label>
                        <label>CY: <input type="number" value={Math.round(selectedPath.points[0]?.y ?? 0)} onChange={e => updatePoint(0, 'y', Number(e.target.value))} step={GRID_SIZE} /></label>
                      </div>
                    </div>
                  )}

                  {/* Numeric inputs for line */}
                  {selectedPath.type === 'line' && (
                    <div className="numeric-coords">
                      <div className="coord-row">
                        <label>X1: <input type="number" value={Math.round(selectedPath.points[0]?.x ?? 0)} onChange={e => updatePoint(0, 'x', Number(e.target.value))} step={GRID_SIZE} /></label>
                        <label>Y1: <input type="number" value={Math.round(selectedPath.points[0]?.y ?? 0)} onChange={e => updatePoint(0, 'y', Number(e.target.value))} step={GRID_SIZE} /></label>
                      </div>
                      <div className="coord-row">
                        <label>X2: <input type="number" value={Math.round(selectedPath.points[1]?.x ?? 0)} onChange={e => updatePoint(1, 'x', Number(e.target.value))} step={GRID_SIZE} /></label>
                        <label>Y2: <input type="number" value={Math.round(selectedPath.points[1]?.y ?? 0)} onChange={e => updatePoint(1, 'y', Number(e.target.value))} step={GRID_SIZE} /></label>
                      </div>
                    </div>
                  )}

                  {/* Numeric inputs for text position */}
                  {selectedPath.type === 'text' && (
                    <div className="numeric-coords">
                      <div className="coord-row">
                        <label>X: <input type="number" value={Math.round(selectedPath.points[0]?.x ?? 0)} onChange={e => updatePoint(0, 'x', Number(e.target.value))} step={GRID_SIZE} /></label>
                        <label>Y: <input type="number" value={Math.round(selectedPath.points[0]?.y ?? 0)} onChange={e => updatePoint(0, 'y', Number(e.target.value))} step={GRID_SIZE} /></label>
                      </div>
                    </div>
                  )}

                  {/* Vertex list for polyline */}
                  {(selectedPath.type === 'polyline' || selectedPath.type === 'line') && selectedPath.points.length > 0 && (
                    <div className="numeric-coords vertex-list">
                      <span style={{ fontSize: '11px', color: 'var(--fc-text-muted, #888)' }}>Vertices ({selectedPath.points.length})</span>
                      {selectedPath.points.map((pt, i) => (
                        <div className="coord-row" key={i}>
                          <label>X: <input type="number" value={Math.round(pt.x)} onChange={e => updatePoint(i, 'x', Number(e.target.value))} step={GRID_SIZE} /></label>
                          <label>Y: <input type="number" value={Math.round(pt.y)} onChange={e => updatePoint(i, 'y', Number(e.target.value))} step={GRID_SIZE} /></label>
                        </div>
                      ))}
                    </div>
                  )}

                  {(selectedPath.type === 'arc' || selectedPath.type === 'circle') && (
                    <label>
                      Radius:
                      <input
                        type="number"
                        value={selectedPath.radius ?? 0}
                        onChange={e => updateSelectedPath({ radius: Number(e.target.value) })}
                        min={1}
                        step={1}
                      />
                    </label>
                  )}
                  {selectedPath.type === 'arc' && (
                    <>
                      <label>
                        Start Angle:
                        <input
                          type="number"
                          value={Math.round((selectedPath.startAngle ?? 0) * 180 / Math.PI)}
                          onChange={e => updateSelectedPath({ startAngle: Number(e.target.value) * Math.PI / 180 })}
                          step={5}
                        />
                        <span className="unit-hint">deg</span>
                      </label>
                      <label>
                        End Angle:
                        <input
                          type="number"
                          value={Math.round((selectedPath.endAngle ?? 0) * 180 / Math.PI)}
                          onChange={e => updateSelectedPath({ endAngle: Number(e.target.value) * Math.PI / 180 })}
                          step={5}
                        />
                        <span className="unit-hint">deg</span>
                      </label>
                    </>
                  )}
                  {selectedPath.type === 'text' && (
                    <>
                      <label>
                        Content:
                        <input
                          type="text"
                          value={selectedPath.content ?? ''}
                          onChange={e => updateSelectedPath({ content: e.target.value })}
                        />
                      </label>
                      <label>
                        Font Size:
                        <input
                          type="number"
                          value={selectedPath.fontSize ?? 12}
                          onChange={e => updateSelectedPath({ fontSize: Number(e.target.value) })}
                          min={4}
                          max={48}
                          step={1}
                        />
                      </label>
                      <label>
                        Weight:
                        <select
                          value={selectedPath.fontWeight ?? 'bold'}
                          onChange={e => updateSelectedPath({ fontWeight: e.target.value as 'normal' | 'bold' })}
                        >
                          <option value="bold">Bold</option>
                          <option value="normal">Normal</option>
                        </select>
                      </label>
                      <label>
                        Align:
                        <select
                          value={selectedPath.textAnchor ?? 'center'}
                          onChange={e => updateSelectedPath({ textAnchor: e.target.value as 'start' | 'center' | 'end' })}
                        >
                          <option value="start">Left</option>
                          <option value="center">Center</option>
                          <option value="end">Right</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Center: Canvas */}
          <div className="symbol-editor-canvas-area">
            <div ref={canvasContainerRef} className="symbol-editor-canvas-container">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="symbol-editor-canvas"
                style={{ cursor: isPanning ? 'grabbing' : activeHandle ? 'grabbing' : hoveredHandle || (marqueeStart ? 'crosshair' : (selectedTool === 'select' ? 'default' : 'crosshair')) }}
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
               selectedTool === 'text' ? 'Click to place text, then edit in properties panel' :
               selectedTool === 'select' ? 'Click to select, drag handles to resize/edit vertices, double-click segment to add vertex, Cmd+D to duplicate' :
               'Click and drag to draw'}
              {' \u00b7 Scroll to zoom, Shift+drag to pan'}
            </div>
          </div>

          {/* Right: Properties & Preview */}
          <div className="symbol-editor-properties">
            {/* AI Symbol Generation */}
            <div style={{ marginBottom: 12, padding: '8px', background: 'rgba(59,130,246,0.08)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.2)' }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12, color: '#60a5fa' }}>AI Generate</h4>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Describe a symbol, e.g. &quot;IEC normally open pushbutton with 2 pins&quot; or &quot;Allen-Bradley Micro850 PLC with 24 DI and 16 DO&quot;"
                style={{ width: '100%', height: 48, fontSize: 11, resize: 'vertical', background: '#1a1a2e', color: '#ccc', border: '1px solid #333', borderRadius: 4, padding: 6, boxSizing: 'border-box' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAIGenerate(); } }}
              />
              <button
                onClick={handleAIGenerate}
                disabled={aiGenerating || !aiPrompt.trim()}
                style={{ marginTop: 4, width: '100%', padding: '5px 0', fontSize: 11, background: aiGenerating ? '#333' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: aiGenerating ? 'wait' : 'pointer' }}
              >
                {aiGenerating ? 'Generating...' : 'Generate Symbol'}
              </button>
              {aiError && <div style={{ marginTop: 4, fontSize: 10, color: '#ef4444' }}>{aiError}</div>}
            </div>

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
              Standard:
              <select
                value={symbolStandard}
                onChange={e => setSymbolStandard(e.target.value)}
              >
                <option value="common">Common (both)</option>
                <option value="IEC 60617">IEC 60617</option>
                <option value="ANSI/NEMA">ANSI/NEMA</option>
              </select>
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

            {/* Multi-scale preview */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '8px 0' }}>
              <div style={{ width: 40, height: 40, border: '1px solid #333', background: '#1a1a1a' }}>
                <SymbolPreview symbol={tempSymbolDef} />
              </div>
              <div style={{ width: 80, height: 80, border: '1px solid #333', background: '#1a1a1a' }}>
                <SymbolPreview symbol={tempSymbolDef} />
              </div>
              <div style={{ width: 160, height: 160, border: '1px solid #333', background: '#1a1a1a' }}>
                <SymbolPreview symbol={tempSymbolDef} />
              </div>
            </div>

            {/* Validation results */}
            {validationReport.issues.length > 0 && (
              <div className="symbol-validation-results" style={{ margin: '8px 0', fontSize: 12 }}>
                {validationReport.issues.map(issue => (
                  <div key={issue.id} style={{
                    padding: '2px 6px',
                    marginBottom: 2,
                    borderLeft: `3px solid ${issue.severity === 'error' ? '#e74c3c' : issue.severity === 'warning' ? '#f39c12' : '#3498db'}`,
                    background: issue.severity === 'error' ? 'rgba(231,76,60,0.1)' : issue.severity === 'warning' ? 'rgba(243,156,18,0.1)' : 'rgba(52,152,219,0.1)',
                    color: '#ccc',
                  }}>
                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: 10, marginRight: 4,
                      color: issue.severity === 'error' ? '#e74c3c' : issue.severity === 'warning' ? '#f39c12' : '#3498db'
                    }}>
                      {issue.severity}
                    </span>
                    {issue.message}
                  </div>
                ))}
              </div>
            )}

            <div className="symbol-stats">
              <span>{paths.length} path(s)</span>
              <span>{pins.length} pin(s)</span>
              {validationReport.errorCount > 0 && (
                <span style={{ color: '#e74c3c' }}>{validationReport.errorCount} error(s)</span>
              )}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn secondary"
            onClick={handleExportToBuiltin}
            title="Save symbol directly to the symbol library"
          >
            {exportStatus || 'Save to Library'}
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              const primitivesList = editorPathsToPrimitives(paths);
              const id = editSymbolId || `custom-${generateId()}`;
              const entry = {
                id, name: symbolName, category: symbolCategory,
                width: symbolWidth, height: symbolHeight, svgPath: '',
                primitives: primitivesList.length > 0 ? primitivesList : [],
                pins: pins.map(p => ({ id: p.name || p.id, name: p.name, x: p.position.x, y: p.position.y, direction: p.direction, pinType: p.pinType })),
                tagPrefix, standard: symbolStandard || undefined,
              };
              const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `${id}.json`; a.click(); URL.revokeObjectURL(a.href);
            }}
            title="Download JSON to commit into builtin-symbols.json for deployment"
          >
            Export JSON
          </button>
          <button
            className="btn primary"
            onClick={handleSave}
            disabled={pins.length === 0 || validationReport.errorCount > 0}
            title={validationReport.errorCount > 0 ? `Fix ${validationReport.errorCount} error(s) before saving` : undefined}
          >
            {editSymbolId ? 'Save Changes' : 'Create Symbol'}
          </button>
        </div>
      </div>
    </div>
  );
}

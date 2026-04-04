/**
 * Canvas component - canvas element, resize, render trigger, context menu overlay
 */

import { useEffect, useRef } from 'react';
import { renderCircuit, type CircuitData, type SheetConnection } from '../renderer/circuit-renderer';
import type { Viewport, Point, DeviceTransform } from '../renderer/types';
import { snapToGrid, type InteractionMode, type SymbolCategory, type PinHit } from '../types';
import type { DraggingEndpointState, MarqueeRect, UseCanvasInteractionReturn } from '../hooks/useCanvasInteraction';

/** Imperative handle for direct rendering (bypasses React for zoom performance) */
export interface CanvasRenderHandle {
  /** Render immediately with a viewport override (no React re-render) */
  renderWithViewport: (vp: Viewport) => void;
}

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  circuit: CircuitData | null;
  viewport: Viewport;
  debugMode: boolean;
  devicePositions: Map<string, Point>;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  wireStart: PinHit | null;
  wireWaypoints?: Point[];
  interactionMode: InteractionMode;
  placementCategory: SymbolCategory | null;
  mouseWorldPos: Point | null;
  draggingEndpoint: DraggingEndpointState | null;
  isLoading: boolean;
  activeSheetId?: string;
  deviceTransforms?: Map<string, DeviceTransform>;
  marquee?: MarqueeRect | null;
  contextMenu?: UseCanvasInteractionReturn['contextMenu'];
  setContextMenu?: React.Dispatch<React.SetStateAction<UseCanvasInteractionReturn['contextMenu']>>;
  rotateDevice?: (tag: string, dir: 'cw' | 'ccw') => void;
  mirrorDevice?: (tag: string) => void;
  deleteDevices?: (tags: string[]) => void;
  selectedWireIndexValue?: number | null;
  addWaypoint?: (connectionIndex: number, segmentIndex: number, point: Point) => void;
  pasteDevice?: (worldX: number, worldY: number) => void;
  clipboard?: unknown;
  selectedAnnotationId?: string | null;
  /** Sheet-filtered connections for mapping wireIndex back to global index */
  sheetConnections?: SheetConnection[];
  /** Ref to expose imperative render handle for zoom bypass */
  renderHandleRef?: React.MutableRefObject<CanvasRenderHandle | null>;
  /** Open Symbol Editor for a given symbolKey (dev-only context menu) */
  onEditSymbol?: (symbolKey: string) => void;
  alignSelectedDevices?: (dir: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  /** Ghost paste preview data - built by parent from clipboard + mouse position */
  ghostPaste?: Array<{ category: string; x: number; y: number; tag: string; rotation?: number; mirrorH?: boolean }> | null;
  drawingShapePreview?: import('../renderer/circuit-renderer').RenderOptions['drawingShapePreview'];
  showGrid?: boolean;
  showPinLabels?: boolean;
  showDescriptions?: boolean;
}

export function Canvas({
  canvasRef,
  circuit,
  viewport,
  debugMode,
  devicePositions,
  selectedDevices,
  selectedWireIndex,
  wireStart,
  wireWaypoints = [],
  interactionMode,
  placementCategory,
  mouseWorldPos,
  draggingEndpoint,
  isLoading,
  activeSheetId,
  deviceTransforms,
  marquee,
  contextMenu,
  setContextMenu,
  rotateDevice,
  mirrorDevice,
  deleteDevices,
  addWaypoint,
  pasteDevice,
  clipboard,
  selectedAnnotationId,
  sheetConnections,
  renderHandleRef,
  onEditSymbol,
  alignSelectedDevices,
  ghostPaste,
  drawingShapePreview,
  showGrid = true,
  showPinLabels = true,
  showDescriptions = true,
}: CanvasProps) {
  const rafIdRef = useRef(0);
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  // Bitmap cache for smooth zoom — snapshot of last full render
  const snapshotRef = useRef<ImageBitmap | null>(null);
  const snapshotViewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 1 });

  // Build render options (shared between full render and resize)
  const getRenderOptions = () => ({
    selectedDevices,
    selectedWireIndex,
    wireStart,
    wirePreviewMouse: interactionMode === 'wire' && wireStart && mouseWorldPos
      ? mouseWorldPos
      : null,
    wireWaypoints: wireWaypoints,
    ghostSymbol: interactionMode === 'place' && placementCategory && mouseWorldPos
      ? { category: placementCategory, x: snapToGrid(mouseWorldPos.x), y: snapToGrid(mouseWorldPos.y) }
      : null,
    draggingEndpoint: draggingEndpoint && mouseWorldPos
      ? { connectionIndex: draggingEndpoint.connectionIndex, endpoint: draggingEndpoint.endpoint, mousePos: mouseWorldPos }
      : null,
    activeSheetId,
    deviceTransforms,
    marquee,
    showGrid,
    showPinLabels,
    showDescriptions,
    selectedAnnotationId,
    ghostPaste,
    drawingShapePreview,
  });

  // Full render + snapshot capture
  const doFullRender = (vp: Viewport) => {
    const canvas = canvasRef.current;
    if (!canvas || !circuit) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvasSizeRef.current = { w, h };
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    renderCircuit(ctx, circuit, vp, debugMode, devicePositions, getRenderOptions());

    // Capture snapshot for zoom bitmap scaling
    snapshotViewportRef.current = { ...vp };
    createImageBitmap(canvas).then(bmp => {
      snapshotRef.current?.close();
      snapshotRef.current = bmp;
    }).catch(() => {});
  };

  // Fast zoom render — scale cached bitmap instead of full redraw
  const doZoomRender = (newVp: Viewport) => {
    const canvas = canvasRef.current;
    const snapshot = snapshotRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Compute how the new viewport differs from the snapshot viewport
    const sv = snapshotViewportRef.current;
    const relativeScale = newVp.scale / sv.scale;
    const dx = newVp.offsetX - sv.offsetX * relativeScale;
    const dy = newVp.offsetY - sv.offsetY * relativeScale;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(relativeScale, relativeScale);
    ctx.drawImage(snapshot, 0, 0);
    ctx.restore();
  };

  // Expose imperative render handle for zoom bypass
  useEffect(() => {
    if (renderHandleRef) {
      renderHandleRef.current = {
        renderWithViewport: (vp: Viewport) => {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(() => doZoomRender(vp));
        },
      };
    }
  });

  // Render via RAF — cancel previous frame on each update to coalesce rapid changes
  useEffect(() => {
    if (!circuit) return;

    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => doFullRender(viewport));

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [canvasRef, circuit, viewport, debugMode, devicePositions, selectedDevices, selectedWireIndex, wireStart, interactionMode, placementCategory, mouseWorldPos, draggingEndpoint, activeSheetId, deviceTransforms, marquee, selectedAnnotationId, ghostPaste, drawingShapePreview]);

  // Re-render on window resize (container size changed)
  useEffect(() => {
    const handleResize = () => {
      if (!circuit) return;
      doFullRender(viewport);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef, circuit, viewport, debugMode, devicePositions, selectedDevices, selectedWireIndex, wireStart, activeSheetId, deviceTransforms, marquee, selectedAnnotationId]);

  return (
    <main className="canvas-container">
      {isLoading && (
        <div className="loading-overlay">Loading...</div>
      )}
      <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} className="canvas" />

      {/* Context Menu Overlay */}
      {contextMenu && setContextMenu && (
        <div
          className="context-menu-backdrop"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.target === 'device' && contextMenu.deviceTag && (
              <>
                <button className="context-menu-item" onClick={() => {
                  if (rotateDevice && contextMenu.deviceTag) rotateDevice(contextMenu.deviceTag, 'cw');
                  setContextMenu(null);
                }}>Rotate CW (R)</button>
                <button className="context-menu-item" onClick={() => {
                  if (rotateDevice && contextMenu.deviceTag) rotateDevice(contextMenu.deviceTag, 'ccw');
                  setContextMenu(null);
                }}>Rotate CCW (Shift+R)</button>
                <button className="context-menu-item" onClick={() => {
                  if (mirrorDevice && contextMenu.deviceTag) mirrorDevice(contextMenu.deviceTag);
                  setContextMenu(null);
                }}>Mirror (F)</button>
                {onEditSymbol && contextMenu.deviceTag && circuit && (() => {
                  const device = circuit.devices.find(d => d.id === contextMenu.deviceTag);
                  const part = device?.partId ? circuit.parts.find(p => p.id === device.partId) : null;
                  const symbolKey = part?.symbolCategory || part?.category || device?.function;
                  return symbolKey ? (
                    <button className="context-menu-item" onClick={() => {
                      onEditSymbol(symbolKey);
                      setContextMenu(null);
                    }}>Edit Symbol</button>
                  ) : null;
                })()}
                {selectedDevices.length >= 2 && alignSelectedDevices && (
                  <>
                    <div className="context-menu-separator" />
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('left'); setContextMenu(null); }}>Align Left</button>
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('center-x'); setContextMenu(null); }}>Align Center (H)</button>
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('right'); setContextMenu(null); }}>Align Right</button>
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('top'); setContextMenu(null); }}>Align Top</button>
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('center-y'); setContextMenu(null); }}>Align Center (V)</button>
                    <button className="context-menu-item" onClick={() => { alignSelectedDevices('bottom'); setContextMenu(null); }}>Align Bottom</button>
                  </>
                )}
                <div className="context-menu-separator" />
                <button className="context-menu-item danger" onClick={() => {
                  if (deleteDevices) deleteDevices(selectedDevices.length > 0 ? selectedDevices : [contextMenu.deviceTag!]);
                  setContextMenu(null);
                }}>Delete</button>
              </>
            )}
            {contextMenu.target === 'wire' && contextMenu.wireIndex !== undefined && (
              <>
                <button className="context-menu-item" onClick={() => {
                  if (addWaypoint && contextMenu.wireIndex !== undefined && sheetConnections) {
                    const sheetConn = sheetConnections[contextMenu.wireIndex];
                    const segIdx = sheetConn?.waypoints ? sheetConn.waypoints.length : 0;
                    const globalIdx = sheetConn?._globalIndex ?? contextMenu.wireIndex;
                    addWaypoint(globalIdx, segIdx, {
                      x: snapToGrid(contextMenu.worldX),
                      y: snapToGrid(contextMenu.worldY),
                    });
                  }
                  setContextMenu(null);
                }}>Add Waypoint</button>
              </>
            )}
            {contextMenu.target === 'canvas' && (
              <>
                {clipboard && pasteDevice && (
                  <button className="context-menu-item" onClick={() => {
                    pasteDevice(contextMenu.worldX, contextMenu.worldY);
                    setContextMenu(null);
                  }}>Paste</button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

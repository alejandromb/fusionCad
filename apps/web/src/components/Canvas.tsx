/**
 * Canvas component - canvas element, resize, render trigger, context menu overlay
 */

import { useEffect, useRef } from 'react';
import { renderCircuit, type CircuitData } from '../renderer/circuit-renderer';
import type { Viewport, Point, DeviceTransform } from '../renderer/types';
import { snapToGrid, type InteractionMode, type SymbolCategory, type PinHit } from '../types';
import type { DraggingEndpointState, MarqueeRect, UseCanvasInteractionReturn } from '../hooks/useCanvasInteraction';

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  circuit: CircuitData | null;
  viewport: Viewport;
  debugMode: boolean;
  devicePositions: Map<string, Point>;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  wireStart: PinHit | null;
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
}: CanvasProps) {
  const rafIdRef = useRef(0);
  const canvasSizeRef = useRef({ w: 0, h: 0 });

  // Render via RAF — cancel previous frame on each update to coalesce rapid changes
  useEffect(() => {
    if (!circuit) return;

    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Only reset canvas buffer when container size actually changes
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvasSizeRef.current = { w, h };
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      renderCircuit(ctx, circuit, viewport, debugMode, devicePositions, {
        selectedDevices,
        selectedWireIndex,
        wireStart,
        wirePreviewMouse: interactionMode === 'wire' && wireStart && mouseWorldPos
          ? mouseWorldPos
          : null,
        ghostSymbol: interactionMode === 'place' && placementCategory && mouseWorldPos
          ? { category: placementCategory, x: snapToGrid(mouseWorldPos.x), y: snapToGrid(mouseWorldPos.y) }
          : null,
        draggingEndpoint: draggingEndpoint && mouseWorldPos
          ? { connectionIndex: draggingEndpoint.connectionIndex, endpoint: draggingEndpoint.endpoint, mousePos: mouseWorldPos }
          : null,
        activeSheetId,
        deviceTransforms,
        marquee,
        showGrid: true,
        selectedAnnotationId,
      });
    });

    return () => cancelAnimationFrame(rafIdRef.current);
  }, [canvasRef, circuit, viewport, debugMode, devicePositions, selectedDevices, selectedWireIndex, wireStart, interactionMode, placementCategory, mouseWorldPos, draggingEndpoint, activeSheetId, deviceTransforms, marquee, selectedAnnotationId]);

  // Re-render on window resize (container size changed)
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !circuit) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      renderCircuit(ctx, circuit, viewport, debugMode, devicePositions, {
        selectedDevices, selectedWireIndex, wireStart,
        wirePreviewMouse: null, ghostSymbol: null, draggingEndpoint: null,
        activeSheetId, deviceTransforms, marquee, showGrid: true, selectedAnnotationId,
      });
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
                  if (addWaypoint && contextMenu.wireIndex !== undefined) {
                    const conn = circuit?.connections[contextMenu.wireIndex];
                    const segIdx = conn?.waypoints ? conn.waypoints.length : 0;
                    addWaypoint(contextMenu.wireIndex, segIdx, {
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

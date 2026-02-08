/**
 * StatusBar - displays cursor position, zoom, snap, mode info at bottom of canvas
 */
import type { Point, Viewport } from '../renderer/types';
import type { InteractionMode } from '../types';

interface StatusBarProps {
  mouseWorldPos: Point | null;
  viewport: Viewport;
  interactionMode: InteractionMode;
  selectedCount: number;
  gridSize?: number;
}

export function StatusBar({
  mouseWorldPos,
  viewport,
  interactionMode,
  selectedCount,
  gridSize = 20,
}: StatusBarProps) {
  const zoomPercent = Math.round(viewport.scale * 100);

  const modeLabels: Record<InteractionMode, string> = {
    select: 'Select',
    wire: 'Wire',
    place: 'Place',
    text: 'Text',
  };

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-item mode-indicator">
          {modeLabels[interactionMode]}
        </span>
        {selectedCount > 0 && (
          <span className="status-item selection-count">
            {selectedCount} selected
          </span>
        )}
      </div>
      <div className="status-bar-right">
        <span className="status-item cursor-pos">
          X: {mouseWorldPos ? Math.round(mouseWorldPos.x) : '—'}
          {' '}
          Y: {mouseWorldPos ? Math.round(mouseWorldPos.y) : '—'}
        </span>
        <span className="status-item grid-info">
          Grid: {gridSize}px
        </span>
        <span className="status-item zoom-level">
          {zoomPercent}%
        </span>
      </div>
    </div>
  );
}

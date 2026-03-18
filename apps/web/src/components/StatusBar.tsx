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
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  storageType?: 'rest' | 'indexeddb';
}

export function StatusBar({
  mouseWorldPos,
  viewport,
  interactionMode,
  selectedCount,
  gridSize = 20,
  snapEnabled = true,
  onToggleSnap,
  storageType,
}: StatusBarProps) {
  const zoomPercent = Math.round(viewport.scale * 100);

  const modeLabels: Record<InteractionMode, string> = {
    select: 'Select',
    pan: 'Pan',
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
        {storageType && (
          <span className="status-item storage-type">
            {storageType === 'rest' ? 'Cloud' : 'Local'}
          </span>
        )}
        <span className="status-item cursor-pos">
          X: {mouseWorldPos ? Math.round(mouseWorldPos.x) : '—'}
          {' '}
          Y: {mouseWorldPos ? Math.round(mouseWorldPos.y) : '—'}
        </span>
        <span
          className={`status-item grid-info ${onToggleSnap ? 'clickable' : ''}`}
          onClick={onToggleSnap}
          title={`Snap to Grid: ${snapEnabled ? 'ON' : 'OFF'} (G)`}
          style={onToggleSnap ? { cursor: 'pointer' } : undefined}
        >
          Grid: {gridSize}px {snapEnabled ? '⊞' : '⊟'}
        </span>
        <span className="status-item zoom-level">
          {zoomPercent}%
        </span>
      </div>
    </div>
  );
}

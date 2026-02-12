/**
 * Horizontal Toolbar - CAD-style toolbar with common operations
 *
 * Standard toolbar found in CAD applications with:
 * - Selection tools
 * - Edit operations (copy, paste, delete)
 * - Transform operations (rotate, mirror)
 * - Undo/Redo
 * - Zoom controls
 */

import type { InteractionMode } from '../types';

interface ToolbarProps {
  // Selection state
  selectedDevices: string[];
  selectedWireIndex: number | null;

  // Mode control
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;

  // Transform operations
  rotateDevice: (tag: string, direction: 'cw' | 'ccw') => void;
  mirrorDevice: (tag: string) => void;

  // Edit operations
  deleteDevices: (tags: string[]) => void;
  deleteWire: (connectionIndex: number) => void;
  copyDevice: () => void;
  pasteDevice: () => void;
  hasClipboard: boolean;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Zoom
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomLevel: number;
}

export function Toolbar({
  selectedDevices,
  selectedWireIndex,
  interactionMode,
  setInteractionMode,
  rotateDevice,
  mirrorDevice,
  deleteDevices,
  deleteWire,
  copyDevice,
  pasteDevice,
  hasClipboard,
  undo,
  redo,
  canUndo,
  canRedo,
  zoomIn,
  zoomOut,
  zoomToFit,
  zoomLevel,
}: ToolbarProps) {
  const hasDeviceSelection = selectedDevices.length > 0;
  const hasWireSelection = selectedWireIndex !== null;
  const hasSelection = hasDeviceSelection || hasWireSelection;
  const hasSingleSelection = selectedDevices.length === 1;

  const handleRotateCW = () => {
    if (hasSingleSelection) {
      rotateDevice(selectedDevices[0], 'cw');
    }
  };

  const handleRotateCCW = () => {
    if (hasSingleSelection) {
      rotateDevice(selectedDevices[0], 'ccw');
    }
  };

  const handleMirror = () => {
    if (hasSingleSelection) {
      mirrorDevice(selectedDevices[0]);
    }
  };

  const handleDelete = () => {
    if (hasDeviceSelection) {
      deleteDevices(selectedDevices);
    } else if (hasWireSelection) {
      deleteWire(selectedWireIndex);
    }
  };

  return (
    <div className="toolbar">
      {/* Mode tools */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${interactionMode === 'select' ? 'active' : ''}`}
          onClick={() => setInteractionMode('select')}
          title="Select (V)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/>
          </svg>
        </button>
        <button
          className={`toolbar-btn ${interactionMode === 'wire' ? 'active' : ''}`}
          onClick={() => setInteractionMode('wire')}
          title="Wire (W)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 12h6m4 0h6M10 12a2 2 0 104 0 2 2 0 00-4 0" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className={`toolbar-btn ${interactionMode === 'text' ? 'active' : ''}`}
          onClick={() => setInteractionMode('text')}
          title="Text (T)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M5 5h14M12 5v14M8 19h8" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Edit operations */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Cmd+Z)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Clipboard operations */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={copyDevice}
          disabled={!hasSelection}
          title="Copy (Cmd+C)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={pasteDevice}
          disabled={!hasClipboard}
          title="Paste (Cmd+V)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className="toolbar-btn delete-btn"
          onClick={handleDelete}
          disabled={!hasSelection}
          title="Delete (Del)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Transform operations */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={handleRotateCCW}
          disabled={!hasSingleSelection}
          title="Rotate CCW (Shift+R)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M1 4v6h6M4 15a8 8 0 108-8" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={handleRotateCW}
          disabled={!hasSingleSelection}
          title="Rotate CW (R)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M23 4v6h-6M20 15a8 8 0 10-8-8" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={handleMirror}
          disabled={!hasSingleSelection}
          title="Mirror (F)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M12 3v18M5 8l4 4-4 4M19 8l-4 4 4 4" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Zoom controls */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={zoomOut}
          title="Zoom Out (-)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M21 21l-4.35-4.35M8 11h6" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </button>
        <span className="toolbar-zoom-level" title="Zoom level">
          {Math.round(zoomLevel * 100)}%
        </span>
        <button
          className="toolbar-btn"
          onClick={zoomIn}
          title="Zoom In (+)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={zoomToFit}
          title="Zoom to Fit (Cmd+0)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </button>
      </div>

      {/* Selection info */}
      {hasSelection && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-selection-info">
            {selectedDevices.length} selected
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sidebar component - tools, insert symbol, status, properties
 */

import { useState } from 'react';
import type { Part } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { InteractionMode, SymbolCategory, PinHit } from '../types';
import { PropertiesPanel } from './PropertiesPanel';
import { InsertSymbolDialog } from './InsertSymbolDialog';

interface SidebarProps {
  interactionMode: InteractionMode;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  placementCategory: SymbolCategory | null;
  setPlacementCategory: React.Dispatch<React.SetStateAction<SymbolCategory | null>>;
  setWireStart: React.Dispatch<React.SetStateAction<PinHit | null>>;
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>;
  wireStart: PinHit | null;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  circuit: CircuitData | null;
  deleteDevices: (tags: string[]) => void;
  updateWireNumber: (connectionIndex: number, wireNumber: string) => void;
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  onAssignPart: (deviceTag: string, part: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;
}

export function Sidebar({
  interactionMode,
  setInteractionMode,
  placementCategory,
  setPlacementCategory,
  setWireStart,
  setSelectedDevices,
  wireStart,
  selectedDevices,
  selectedWireIndex,
  circuit,
  deleteDevices,
  updateWireNumber,
  debugMode,
  setDebugMode,
  onAssignPart,
}: SidebarProps) {
  const [showInsertSymbol, setShowInsertSymbol] = useState(false);

  // Handle symbol selection from dialog
  // The symbolId is the key for rendering (e.g., 'iec-power-supply')
  // We use it directly as the placement category since the renderer looks up by symbol ID
  const handleSelectSymbol = (symbolId: string, _category: string) => {
    setPlacementCategory(symbolId as SymbolCategory);
    setInteractionMode('place');
    setWireStart(null);
    setSelectedDevices([]);
  };

  // Get selected device info for properties panel
  const primarySelectedDevice = selectedDevices.length > 0 ? selectedDevices[0] : null;
  const selectedDeviceInfo = primarySelectedDevice && circuit
    ? circuit.devices.find(d => d.tag === primarySelectedDevice)
    : null;
  const selectedDevicePart = selectedDeviceInfo?.partId && circuit
    ? circuit.parts.find(p => p.id === selectedDeviceInfo.partId)
    : null;

  // Get selected wire info for wire properties panel
  const selectedWire = selectedWireIndex !== null && circuit
    ? circuit.connections[selectedWireIndex]
    : null;
  const selectedWireNet = selectedWire && circuit
    ? circuit.nets.find(n => n.id === selectedWire.netId)
    : null;

  return (
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
          <button
            className={`tool-btn ${interactionMode === 'text' ? 'active' : ''}`}
            onClick={() => {
              setInteractionMode('text');
              setPlacementCategory(null);
              setWireStart(null);
              setSelectedDevices([]);
            }}
            title="Place text annotations (T)"
          >
            Text
          </button>
        </div>
      </section>

      {/* Insert Section */}
      <section className="sidebar-section">
        <h3>Insert</h3>
        <div className="insert-buttons">
          <button
            className="insert-btn"
            onClick={() => setShowInsertSymbol(true)}
            title="Insert a symbol from the library (I)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Insert Symbol...
          </button>
        </div>
      </section>

      {/* Status Messages */}
      {(interactionMode === 'place' || interactionMode === 'wire' || interactionMode === 'text' || selectedDevices.length > 0) && (
        <section className="sidebar-section">
          {interactionMode === 'place' && placementCategory && (
            <p className="status-message success">
              Click to place {placementCategory}
            </p>
          )}
          {interactionMode === 'wire' && (
            <p className="status-message info">
              {wireStart
                ? `From ${wireStart.device}:${wireStart.pin} → click target pin`
                : 'Click a pin to start wire'}
            </p>
          )}
          {interactionMode === 'text' && (
            <p className="status-message info">
              Click to place text annotation
            </p>
          )}
          {interactionMode === 'select' && selectedDevices.length > 1 && (
            <p className="status-message info">
              {selectedDevices.length} devices selected
            </p>
          )}
        </section>
      )}

      {/* Properties Section */}
      {selectedDeviceInfo && (
        <section className="sidebar-section">
          <h3>Properties</h3>
          <PropertiesPanel
            device={selectedDeviceInfo}
            part={selectedDevicePart || null}
            circuit={circuit}
            onDeleteDevices={deleteDevices}
            selectedDevices={selectedDevices}
            onAssignPart={onAssignPart}
          />
        </section>
      )}

      {/* Wire Properties Section */}
      {selectedWire && selectedWireIndex !== null && (
        <section className="sidebar-section">
          <h3>Wire Properties</h3>
          <div className="properties-panel">
            <div className="property-row">
              <span className="property-label">Wire #</span>
              <input
                className="property-input"
                type="text"
                value={selectedWire.wireNumber || `W${String(selectedWireIndex + 1).padStart(3, '0')}`}
                onChange={(e) => updateWireNumber(selectedWireIndex, e.target.value)}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Net</span>
              <span className="property-value">{selectedWireNet?.name || 'unknown'}</span>
            </div>
            <div className="property-row">
              <span className="property-label">From</span>
              <span className="property-value">{selectedWire.fromDevice}:{selectedWire.fromPin}</span>
            </div>
            <div className="property-row">
              <span className="property-label">To</span>
              <span className="property-value">{selectedWire.toDevice}:{selectedWire.toPin}</span>
            </div>
          </div>
        </section>
      )}

      {/* Debug Section */}
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

      {/* Insert Symbol Dialog */}
      <InsertSymbolDialog
        isOpen={showInsertSymbol}
        onClose={() => setShowInsertSymbol(false)}
        onSelectSymbol={handleSelectSymbol}
      />
    </aside>
  );
}

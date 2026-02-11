/**
 * Sidebar component - tools, insert symbol, status, properties
 */

import { useState } from 'react';
import type { Part, Annotation } from '@fusion-cad/core-model';
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
  onUpdateDevice: (tag: string, updates: Partial<Pick<import('@fusion-cad/core-model').Device, 'tag' | 'function' | 'location'>>) => void;
  selectedAnnotationId: string | null;
  onUpdateAnnotation: (id: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style'>>) => void;
  onDeleteAnnotation: (id: string) => void;
  onSelectAnnotation: (id: string | null) => void;
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
  onUpdateDevice,
  selectedAnnotationId,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
}: SidebarProps) {
  const [showInsertSymbol, setShowInsertSymbol] = useState(false);

  // Handle symbol selection from dialog
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

  // Get selected annotation
  const selectedAnnotation = selectedAnnotationId && circuit
    ? (circuit.annotations || []).find(a => a.id === selectedAnnotationId)
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
      {(selectedDeviceInfo || selectedDevices.length > 1) && (
        <section className="sidebar-section">
          <h3>Properties</h3>
          <PropertiesPanel
            device={selectedDeviceInfo || null}
            part={selectedDevicePart || null}
            circuit={circuit}
            onDeleteDevices={deleteDevices}
            selectedDevices={selectedDevices}
            onAssignPart={onAssignPart}
            onUpdateDevice={onUpdateDevice}
          />
        </section>
      )}

      {/* Annotation Properties Section */}
      {selectedAnnotation && !selectedDeviceInfo && (
        <section className="sidebar-section">
          <h3>Annotation</h3>
          <div className="annotation-properties">
            <div className="property-row">
              <span className="property-label">Content</span>
            </div>
            <textarea
              className="annotation-content-input"
              value={selectedAnnotation.content}
              onChange={e => onUpdateAnnotation(selectedAnnotation.id, { content: e.target.value })}
              rows={3}
            />
            <div className="property-row">
              <span className="property-label">Font Size</span>
              <input
                className="property-input"
                type="number"
                min={8}
                max={72}
                value={selectedAnnotation.style?.fontSize || 14}
                onChange={e => onUpdateAnnotation(selectedAnnotation.id, {
                  style: { ...selectedAnnotation.style, fontSize: parseInt(e.target.value) || 14 },
                })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Font Weight</span>
              <select
                className="property-input"
                value={selectedAnnotation.style?.fontWeight || 'normal'}
                onChange={e => onUpdateAnnotation(selectedAnnotation.id, {
                  style: { ...selectedAnnotation.style, fontWeight: e.target.value as 'normal' | 'bold' },
                })}
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="property-row">
              <span className="property-label">Position</span>
              <span className="property-value">
                ({Math.round(selectedAnnotation.position.x)}, {Math.round(selectedAnnotation.position.y)})
              </span>
            </div>
            <button
              className="delete-btn"
              onClick={() => {
                onDeleteAnnotation(selectedAnnotation.id);
                onSelectAnnotation(null);
              }}
            >
              Delete Annotation
            </button>
          </div>
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

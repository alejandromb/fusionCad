/**
 * Sidebar component - properties panel only (tools moved to Toolbar, symbols to RightPanel)
 */

import type { Part, Annotation } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { InteractionMode, SymbolCategory, PinHit } from '../types';
import { PropertiesPanel } from './PropertiesPanel';

interface SidebarProps {
  interactionMode: InteractionMode;
  placementCategory: SymbolCategory | null;
  wireStart: PinHit | null;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  circuit: CircuitData | null;
  deleteDevices: (deviceIds: string[]) => void;
  updateWireNumber: (connectionIndex: number, wireNumber: string) => void;
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  onAssignPart: (deviceId: string, part: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;
  onUpdateDevice: (deviceId: string, updates: Partial<Pick<import('@fusion-cad/core-model').Device, 'tag' | 'function' | 'location'>>) => void;
  selectedAnnotationId: string | null;
  onUpdateAnnotation: (id: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style'>>) => void;
  onDeleteAnnotation: (id: string) => void;
  onSelectAnnotation: (id: string | null) => void;
}

export function Sidebar({
  interactionMode,
  placementCategory,
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
  // Get selected device info for properties panel (selectedDevices contains device IDs)
  const primarySelectedDeviceId = selectedDevices.length > 0 ? selectedDevices[0] : null;
  const selectedDeviceInfo = primarySelectedDeviceId && circuit
    ? circuit.devices.find(d => d.id === primarySelectedDeviceId)
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
                ? (() => {
                    const dev = circuit?.devices.find(d => d.id === wireStart.device);
                    return `From ${dev?.tag || wireStart.device}:${wireStart.pin} → click target pin`;
                  })()
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

    </aside>
  );
}

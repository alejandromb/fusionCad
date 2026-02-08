/**
 * PropertiesPanel - Enhanced device properties with part assignment
 */

import { useState } from 'react';
import type { Device, Part } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import { PartsCatalog } from './PartsCatalog';

type ManufacturerPart = Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>;

interface PropertiesPanelProps {
  device: Device | null;
  part: Part | null;
  circuit: CircuitData | null;
  onDeleteDevices: (tags: string[]) => void;
  selectedDevices: string[];
  onAssignPart: (deviceTag: string, part: ManufacturerPart) => void;
}

export function PropertiesPanel({
  device,
  part,
  circuit,
  onDeleteDevices,
  selectedDevices,
  onAssignPart,
}: PropertiesPanelProps) {
  const [showCatalog, setShowCatalog] = useState(false);

  if (!device) return null;

  // Determine category filter for the catalog - map from part category to a general category
  const catalogFilter = part?.category || undefined;

  const handleSelectPart = (selectedPart: ManufacturerPart) => {
    onAssignPart(device.tag, selectedPart);
    setShowCatalog(false);
  };

  // Get cross-references for this device if they exist
  const crossRefs = circuit?.connections?.filter(
    c => c.fromDevice === device.tag || c.toDevice === device.tag
  ) || [];

  return (
    <>
      <div className="properties-panel">
        {/* Device Info Section */}
        <div className="properties-section-label">Device</div>
        <div className="property-row">
          <span className="property-label">Tag</span>
          <span className="property-value">{device.tag}</span>
        </div>
        <div className="property-row">
          <span className="property-label">Function</span>
          <span className="property-value" title={device.function}>{device.function}</span>
        </div>
        {device.location && (
          <div className="property-row">
            <span className="property-label">Location</span>
            <span className="property-value">{device.location}</span>
          </div>
        )}

        {/* Part Info Section */}
        {part && (
          <>
            <div className="properties-section-label">Part</div>
            <div className="property-row">
              <span className="property-label">Manufacturer</span>
              <span className="property-value">{part.manufacturer}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Part #</span>
              <span className="property-value" title={part.partNumber}>{part.partNumber}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Description</span>
              <span className="property-value" title={part.description}>{part.description}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Category</span>
              <span className="property-value">{part.category}</span>
            </div>
          </>
        )}

        {/* Assign Part button */}
        <button
          className="assign-part-btn"
          onClick={() => setShowCatalog(true)}
        >
          {part && part.manufacturer !== 'Unassigned' ? 'Change Part' : 'Assign Part'}
        </button>

        {/* Specifications Section */}
        {part && (part.voltage || part.current || part.powerRating || part.temperatureRange) && (
          <>
            <div className="properties-section-label">Specifications</div>
            <div className="properties-specs">
              {part.voltage && (
                <div className="property-row">
                  <span className="property-label">Voltage</span>
                  <span className="property-value">{part.voltage}</span>
                </div>
              )}
              {part.current && (
                <div className="property-row">
                  <span className="property-label">Current</span>
                  <span className="property-value">{part.current}</span>
                </div>
              )}
              {part.powerRating && (
                <div className="property-row">
                  <span className="property-label">Power</span>
                  <span className="property-value">{part.powerRating}</span>
                </div>
              )}
              {part.temperatureRange && (
                <div className="property-row">
                  <span className="property-label">Temp Range</span>
                  <span className="property-value">{part.temperatureRange}</span>
                </div>
              )}
              {part.certifications && part.certifications.length > 0 && (
                <div className="property-row">
                  <span className="property-label">Certs</span>
                  <span className="property-value">{part.certifications.join(', ')}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Custom Attributes */}
        {part && part.attributes && Object.keys(part.attributes).length > 0 && (
          <>
            <div className="properties-section-label">Attributes</div>
            <div className="properties-attributes">
              {Object.entries(part.attributes).map(([key, value]) => (
                <div className="property-row" key={key}>
                  <span className="property-label">{key}</span>
                  <span className="property-value" title={String(value)}>{String(value)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Cross-References */}
        {crossRefs.length > 0 && (
          <>
            <div className="properties-section-label">Connections ({crossRefs.length})</div>
            <div className="properties-xrefs">
              {crossRefs.slice(0, 5).map((conn, idx) => {
                const isFrom = conn.fromDevice === device.tag;
                const otherDevice = isFrom ? conn.toDevice : conn.fromDevice;
                const otherPin = isFrom ? conn.toPin : conn.fromPin;
                const myPin = isFrom ? conn.fromPin : conn.toPin;
                return (
                  <div key={idx} className="property-row xref-row">
                    <span className="property-label">{myPin}</span>
                    <span className="property-value xref-link">
                      {otherDevice}:{otherPin}
                    </span>
                  </div>
                );
              })}
              {crossRefs.length > 5 && (
                <div className="property-row">
                  <span className="property-label" style={{ fontStyle: 'italic' }}>
                    +{crossRefs.length - 5} more
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Delete button */}
        <button
          className="delete-btn"
          onClick={() => onDeleteDevices(selectedDevices)}
        >
          {selectedDevices.length > 1 ? `Delete ${selectedDevices.length} Devices` : 'Delete Device'}
        </button>
      </div>

      {/* Parts Catalog Dialog */}
      {showCatalog && (
        <PartsCatalog
          onClose={() => setShowCatalog(false)}
          onSelectPart={handleSelectPart}
          filterCategory={catalogFilter}
        />
      )}
    </>
  );
}

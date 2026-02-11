/**
 * PropertiesPanel - Enhanced device properties with inline editing and part assignment
 */

import { useState, useRef, useEffect } from 'react';
import type { Device, Part } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import { PartsCatalog } from './PartsCatalog';

type ManufacturerPart = Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>;

type EditableField = 'tag' | 'function' | 'location' | null;

interface PropertiesPanelProps {
  device: Device | null;
  part: Part | null;
  circuit: CircuitData | null;
  onDeleteDevices: (tags: string[]) => void;
  selectedDevices: string[];
  onAssignPart: (deviceTag: string, part: ManufacturerPart) => void;
  onUpdateDevice?: (tag: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location'>>) => void;
}

function EditableValue({
  value,
  field,
  editingField,
  onStartEdit,
  onCommit,
  onCancel,
  editValue,
  setEditValue,
}: {
  value: string;
  field: EditableField;
  editingField: EditableField;
  onStartEdit: (field: NonNullable<EditableField>) => void;
  onCommit: () => void;
  onCancel: () => void;
  editValue: string;
  setEditValue: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField === field && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField, field]);

  if (editingField === field) {
    return (
      <input
        ref={inputRef}
        className="editable-field-input"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }

  return (
    <span
      className="property-value editable-field"
      title={`${value} (click to edit)`}
      onClick={() => onStartEdit(field as NonNullable<EditableField>)}
    >
      {value || '—'}
    </span>
  );
}

export function PropertiesPanel({
  device,
  part,
  circuit,
  onDeleteDevices,
  selectedDevices,
  onAssignPart,
  onUpdateDevice,
}: PropertiesPanelProps) {
  const [showCatalog, setShowCatalog] = useState(false);
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState('');

  // Multi-select summary
  if (selectedDevices.length > 1) {
    return (
      <div className="properties-panel">
        <div className="multi-select-summary">
          <div className="properties-section-label">Selection</div>
          <p style={{ fontSize: '0.85rem', margin: '0.25rem 0', color: '#e0e0e0' }}>
            {selectedDevices.length} devices selected
          </p>
          <div className="multi-select-tags">
            {selectedDevices.map(tag => (
              <span key={tag} className="multi-select-tag">{tag}</span>
            ))}
          </div>
        </div>
        <button
          className="delete-btn"
          onClick={() => onDeleteDevices(selectedDevices)}
        >
          Delete {selectedDevices.length} Devices
        </button>
      </div>
    );
  }

  if (!device) return null;

  const isSingleSelect = selectedDevices.length === 1;

  const handleStartEdit = (field: NonNullable<EditableField>) => {
    if (!isSingleSelect || !onUpdateDevice) return;
    setEditingField(field);
    setEditValue(
      field === 'tag' ? device.tag :
      field === 'function' ? (device.function || '') :
      (device.location || '')
    );
  };

  const handleCommit = () => {
    if (!editingField || !onUpdateDevice) {
      setEditingField(null);
      return;
    }

    const trimmed = editValue.trim();
    const original =
      editingField === 'tag' ? device.tag :
      editingField === 'function' ? (device.function || '') :
      (device.location || '');

    if (trimmed && trimmed !== original) {
      onUpdateDevice(device.tag, { [editingField]: trimmed });
    }
    setEditingField(null);
  };

  const handleCancel = () => {
    setEditingField(null);
  };

  // Determine category filter for the catalog
  const catalogFilter = part?.category || undefined;

  const handleSelectPart = (selectedPart: ManufacturerPart) => {
    onAssignPart(device.tag, selectedPart);
    setShowCatalog(false);
  };

  // Get cross-references for this device
  const crossRefs = circuit?.connections?.filter(
    c => c.fromDevice === device.tag || c.toDevice === device.tag
  ) || [];

  const editableProps = { editingField, onStartEdit: handleStartEdit, onCommit: handleCommit, onCancel: handleCancel, editValue, setEditValue };

  return (
    <>
      <div className="properties-panel">
        {/* Device Info Section */}
        <div className="properties-section-label">Device</div>
        <div className="property-row">
          <span className="property-label">Tag</span>
          {isSingleSelect && onUpdateDevice ? (
            <EditableValue value={device.tag} field="tag" {...editableProps} />
          ) : (
            <span className="property-value">{device.tag}</span>
          )}
        </div>
        <div className="property-row">
          <span className="property-label">Function</span>
          {isSingleSelect && onUpdateDevice ? (
            <EditableValue value={device.function || ''} field="function" {...editableProps} />
          ) : (
            <span className="property-value" title={device.function}>{device.function}</span>
          )}
        </div>
        <div className="property-row">
          <span className="property-label">Location</span>
          {isSingleSelect && onUpdateDevice ? (
            <EditableValue value={device.location || ''} field="location" {...editableProps} />
          ) : (
            <span className="property-value">{device.location || '—'}</span>
          )}
        </div>

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
          Delete Device
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

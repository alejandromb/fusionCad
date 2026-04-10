/**
 * BOM Editor — spreadsheet-like dialog for editing the Bill of Materials.
 *
 * - Auto rows (from devices) show with badges, quantity is editable (override)
 * - Manual rows are fully editable, can be added/deleted
 * - Hide/show auto rows
 * - CSV export
 * - Place on sheet (renders as annotations)
 */

import { useState, useMemo } from 'react';
import type { CircuitData } from '../renderer/circuit-renderer';
import { generateBom, bomToCSV, type BomRow } from '@fusion-cad/reports';

interface BomEditorProps {
  circuit: CircuitData | null;
  onClose: () => void;
  onUpdateCircuit: (updates: Partial<CircuitData>) => void;
  onPlaceBomOnSheet: (rows: BomRow[]) => void;
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generateRowId(): string {
  return 'manual-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function BomEditor({ circuit, onClose, onUpdateCircuit, onPlaceBomOnSheet }: BomEditorProps) {
  const [showHidden, setShowHidden] = useState(false);

  if (!circuit) return null;

  const overrides = circuit.bomOverrides || {};
  const bom = useMemo(
    () => generateBom(circuit.parts, circuit.devices, circuit.terminals || [], overrides),
    [circuit.parts, circuit.devices, circuit.terminals, overrides],
  );

  // Also generate without override application to know what's hidden
  const hiddenSet = new Set(overrides.hiddenRows || []);
  const fullBom = useMemo(
    () => generateBom(circuit.parts, circuit.devices, circuit.terminals || []),
    [circuit.parts, circuit.devices, circuit.terminals],
  );
  const hiddenRows = fullBom.rows.filter(r => hiddenSet.has(`${r.manufacturer}::${r.partNumber}`));

  const updateOverrides = (updates: Partial<typeof overrides>) => {
    onUpdateCircuit({
      bomOverrides: { ...overrides, ...updates },
    });
  };

  const setQuantityOverride = (rowId: string, qty: number | null) => {
    const next = { ...(overrides.quantityOverrides || {}) };
    if (qty == null) delete next[rowId];
    else next[rowId] = qty;
    updateOverrides({ quantityOverrides: next });
  };

  const hideRow = (rowId: string) => {
    const next = [...(overrides.hiddenRows || []), rowId];
    updateOverrides({ hiddenRows: next });
  };

  const unhideRow = (rowId: string) => {
    const next = (overrides.hiddenRows || []).filter(id => id !== rowId);
    updateOverrides({ hiddenRows: next });
  };

  const addManualRow = () => {
    const next = [
      ...(overrides.manualRows || []),
      {
        id: generateRowId(),
        partNumber: 'NEW-PART',
        manufacturer: '',
        description: '',
        quantity: 1,
      },
    ];
    updateOverrides({ manualRows: next });
  };

  const updateManualRow = (id: string, field: string, value: string | number) => {
    const next = (overrides.manualRows || []).map(r =>
      r.id === id ? { ...r, [field]: value } : r,
    );
    updateOverrides({ manualRows: next });
  };

  const deleteManualRow = (id: string) => {
    const next = (overrides.manualRows || []).filter(r => r.id !== id);
    updateOverrides({ manualRows: next });
  };

  const handleExport = () => {
    downloadCSV('bom.csv', bomToCSV(bom));
  };

  const handlePlaceOnSheet = () => {
    onPlaceBomOnSheet(bom.rows);
  };

  return (
    <div className="reports-backdrop" onClick={onClose}>
      <div
        className="reports-dialog bom-editor-dialog"
        onClick={e => e.stopPropagation()}
        style={{ width: '90vw', maxWidth: '1400px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Bill of Materials</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="report-btn" onClick={addManualRow} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              + Add Row
            </button>
            <button className="report-btn" onClick={handleExport} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              Export CSV
            </button>
            <button className="report-btn" onClick={handlePlaceOnSheet} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              Place on Sheet
            </button>
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1, border: '1px solid #444', borderRadius: 4 }}>
          <table className="bom-editor-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#222', zIndex: 1 }}>
              <tr>
                <th style={{ width: '40px', padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>#</th>
                <th style={{ width: '80px', padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Source</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Tag(s)</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Part Number</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Manufacturer</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Description</th>
                <th style={{ width: '70px', padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Qty</th>
                <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}>Notes</th>
                <th style={{ width: '80px', padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' }}></th>
              </tr>
            </thead>
            <tbody>
              {bom.rows.map((row, idx) => {
                const isManual = row.source === 'manual';
                const inputStyle = {
                  background: 'transparent',
                  border: '1px solid transparent',
                  color: '#eee',
                  padding: '4px 6px',
                  width: '100%',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                };
                return (
                  <tr key={row.rowId || idx} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '8px', color: '#888' }}>{idx + 1}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        background: isManual ? '#4a5' : '#456',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontSize: '0.7rem',
                      }}>
                        {isManual ? 'manual' : 'auto'}
                      </span>
                    </td>
                    <td style={{ padding: '4px', color: '#aaa' }}>
                      {row.deviceTags.length > 3
                        ? `${row.deviceTags[0]}-${row.deviceTags[row.deviceTags.length - 1]}`
                        : row.deviceTags.join(', ')}
                    </td>
                    <td style={{ padding: '4px' }}>
                      {isManual ? (
                        <input
                          style={inputStyle}
                          value={row.partNumber}
                          onChange={e => updateManualRow(row.rowId!, 'partNumber', e.target.value)}
                        />
                      ) : (
                        <span style={{ padding: '4px 6px' }}>{row.partNumber}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px' }}>
                      {isManual ? (
                        <input
                          style={inputStyle}
                          value={row.manufacturer}
                          onChange={e => updateManualRow(row.rowId!, 'manufacturer', e.target.value)}
                        />
                      ) : (
                        <span style={{ padding: '4px 6px' }}>{row.manufacturer}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px' }}>
                      {isManual ? (
                        <input
                          style={inputStyle}
                          value={row.description}
                          onChange={e => updateManualRow(row.rowId!, 'description', e.target.value)}
                        />
                      ) : (
                        <span style={{ padding: '4px 6px', color: '#bbb' }}>{row.description}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        style={{
                          ...inputStyle,
                          fontWeight: row.quantityOverridden ? 'bold' : 'normal',
                          color: row.quantityOverridden ? '#fc6' : '#eee',
                        }}
                        min={0}
                        value={row.quantity}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          if (isNaN(v)) return;
                          if (isManual) {
                            updateManualRow(row.rowId!, 'quantity', v);
                          } else {
                            setQuantityOverride(row.rowId!, v);
                          }
                        }}
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input
                        style={inputStyle}
                        value={row.notes || ''}
                        placeholder="—"
                        onChange={e => {
                          if (isManual) {
                            updateManualRow(row.rowId!, 'notes', e.target.value);
                          }
                          // Note: notes for auto rows would need a separate override field
                        }}
                        disabled={!isManual}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      {isManual ? (
                        <button
                          onClick={() => deleteManualRow(row.rowId!)}
                          style={{ background: '#a44', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          Delete
                        </button>
                      ) : (
                        <>
                          {row.quantityOverridden && (
                            <button
                              onClick={() => setQuantityOverride(row.rowId!, null)}
                              title="Reset to auto-calculated quantity"
                              style={{ background: '#555', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: '0.7rem', marginRight: 4 }}
                            >
                              Reset
                            </button>
                          )}
                          <button
                            onClick={() => hideRow(row.rowId!)}
                            title="Hide from BOM"
                            style={{ background: '#444', color: '#aaa', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Hide
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Hidden rows section */}
        {hiddenRows.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={() => setShowHidden(!showHidden)}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              {showHidden ? '▼' : '▶'} {hiddenRows.length} hidden row{hiddenRows.length !== 1 ? 's' : ''}
            </button>
            {showHidden && (
              <div style={{ padding: '0.5rem', background: '#1a1a1a', borderRadius: 4, marginTop: 4 }}>
                {hiddenRows.map(r => (
                  <div key={`${r.manufacturer}::${r.partNumber}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: '0.8rem' }}>
                    <span style={{ color: '#888' }}>
                      {r.quantity}× {r.partNumber} ({r.manufacturer})
                    </span>
                    <button
                      onClick={() => unhideRow(`${r.manufacturer}::${r.partNumber}`)}
                      style={{ background: '#456', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      Show
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {bom.warnings.length > 0 && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#3a2a1a', borderRadius: 4, fontSize: '0.8rem', color: '#fc6' }}>
            ⚠ {bom.warnings.length} device{bom.warnings.length !== 1 ? 's' : ''} without parts assigned
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ color: '#888', fontSize: '0.85rem' }}>
            {bom.rows.length} unique parts · {bom.totalItems} total components
          </span>
          <button className="reports-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

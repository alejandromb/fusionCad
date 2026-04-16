/**
 * Sidebar component - page explorer with sheet tree, title block, and theme/debug footer
 */

import { useState, useRef, useEffect } from 'react';
import type { Sheet, SheetLadderLayout } from '@fusion-cad/core-model';
import { ThemePicker } from './ThemePicker';
import { SHEET_SIZES } from '../renderer/title-block';
import type { ThemeId, CustomThemeInput } from '../renderer/theme';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { DeviceTransform, Point } from '../renderer/types';
import { SheetThumbnail } from './SheetThumbnail';

interface SidebarProps {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (sheetId: string, newName: string) => void;
  onDeleteSheet: (sheetId: string) => void;
  onDuplicateSheet?: (sheetId: string) => void;
  onReorderSheets: (fromIndex: number, toIndex: number) => void;
  activeSheet: Sheet | null;
  onUpdateSheet: (sheetId: string, updates: Partial<Pick<Sheet, 'titleBlock' | 'size'>>) => void;
  sheetLayout: SheetLadderLayout;
  onSetSheetLayout: (sheetId: string, layout: SheetLadderLayout) => void;
  rungSpacing: number;
  onSetRungSpacing: (spacing: number) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showPinLabels: boolean;
  setShowPinLabels: (show: boolean) => void;
  showDescriptions: boolean;
  setShowDescriptions: (show: boolean) => void;
  showPartNumbers: boolean;
  setShowPartNumbers: (show: boolean) => void;
  sheetScale: number;
  onSetSheetScale: (scale: number) => void;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  customColors: CustomThemeInput;
  setCustomColors: (colors: CustomThemeInput) => void;
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
  circuit: CircuitData | null;
  devicePositions: Map<string, Point>;
  deviceTransforms?: Map<string, DeviceTransform>;
}

export function Sidebar({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  onDuplicateSheet,
  onReorderSheets,
  activeSheet,
  onUpdateSheet,
  sheetLayout,
  onSetSheetLayout,
  rungSpacing,
  onSetRungSpacing,
  showGrid,
  setShowGrid,
  showPinLabels,
  setShowPinLabels,
  showDescriptions,
  setShowDescriptions,
  showPartNumbers,
  setShowPartNumbers,
  sheetScale,
  onSetSheetScale,
  themeId,
  setThemeId,
  customColors,
  setCustomColors,
  debugMode,
  setDebugMode,
  circuit,
  devicePositions,
  deviceTransforms,
}: SidebarProps) {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragSheetIdx, setDragSheetIdx] = useState<number | null>(null);
  const [sheetMenu, setSheetMenu] = useState<{ sheetId: string; x: number; y: number } | null>(null);
  const sheetMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheetMenu) return;
    const close = (e: MouseEvent) => {
      if (sheetMenuRef.current && !sheetMenuRef.current.contains(e.target as Node)) {
        setSheetMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [sheetMenu]);

  const handleStartRename = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (sheet) {
      setEditingSheetId(sheetId);
      setEditName(sheet.name);
    }
  };

  const handleRenameSubmit = () => {
    if (editingSheetId && editName.trim()) {
      onRenameSheet(editingSheetId, editName.trim());
    }
    setEditingSheetId(null);
  };

  return (
    <aside className="sidebar">
      {/* Pages Section */}
      <section className="sidebar-section">
        <h3>Pages</h3>
        <div className="page-tree">
          {sheets.map((sheet, idx) => (
            <div
              key={sheet.id}
              className={`page-tree-item ${sheet.id === activeSheetId ? 'active' : ''}`}
              onClick={() => onSelectSheet(sheet.id)}
              onDoubleClick={() => handleStartRename(sheet.id)}
              draggable={editingSheetId !== sheet.id}
              onDragStart={() => setDragSheetIdx(idx)}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderTop = '2px solid var(--fc-accent)'; }}
              onDragLeave={e => { e.currentTarget.style.borderTop = ''; }}
              onDrop={e => {
                e.currentTarget.style.borderTop = '';
                if (dragSheetIdx !== null && dragSheetIdx !== idx) {
                  onReorderSheets(dragSheetIdx, idx);
                }
                setDragSheetIdx(null);
              }}
              onDragEnd={() => setDragSheetIdx(null)}
            >
              {editingSheetId === sheet.id ? (
                <input
                  className="page-tree-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') setEditingSheetId(null);
                  }}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div
                  className="page-tree-row"
                  onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSheetMenu({ sheetId: sheet.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  {circuit && (
                    <SheetThumbnail
                      circuit={circuit}
                      sheetId={sheet.id}
                      devicePositions={devicePositions}
                      deviceTransforms={deviceTransforms}
                    />
                  )}
                  <span className="page-tree-name">{sheet.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="page-add-btn" onClick={onAddSheet}>
          + Add Page
        </button>

        {sheetMenu && (
          <div
            ref={sheetMenuRef}
            className="sheet-context-menu"
            style={{ left: sheetMenu.x, top: sheetMenu.y }}
          >
            <button
              className="sheet-context-menu-item"
              onClick={() => { handleStartRename(sheetMenu.sheetId); setSheetMenu(null); }}
            >
              Rename
            </button>
            {onDuplicateSheet && (
              <button
                className="sheet-context-menu-item"
                onClick={() => { onDuplicateSheet(sheetMenu.sheetId); setSheetMenu(null); }}
              >
                Duplicate
              </button>
            )}
            {sheets.length > 1 && (
              <button
                className="sheet-context-menu-item danger"
                onClick={() => { onDeleteSheet(sheetMenu.sheetId); setSheetMenu(null); }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </section>

      {/* Sheet settings + Title Block for active sheet */}
      {activeSheet && (
        <section className="sidebar-section">
          <div className="properties-panel">
            <div className="property-row">
              <span className="property-label">Sheet Size</span>
              <select
                className="property-input"
                value={activeSheet.size}
                onChange={e => onUpdateSheet(activeSheet.id, { size: e.target.value as Sheet['size'] })}
              >
                {Object.keys(SHEET_SIZES).map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>
            <div className="property-row">
              <span className="property-label">Layout</span>
              <select
                className="property-input"
                value={sheetLayout}
                onChange={e => onSetSheetLayout(activeSheet.id, e.target.value as SheetLadderLayout)}
              >
                <option value="single-column">Ladder (1 col)</option>
                <option value="dual-column">Ladder (2 col)</option>
                <option value="no-rungs">Plain</option>
                <option value="panel-layout">Panel Layout</option>
              </select>
            </div>
          </div>
          <details style={{ marginTop: '0.25rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '0.25rem 0', userSelect: 'none' }}>
              Title Block
            </summary>
            <div className="properties-panel" style={{ marginTop: '0.25rem' }}>
            <div className="property-row">
              <span className="property-label">Title</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.title || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, title: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Dwg #</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.drawingNumber || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, drawingNumber: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Revision</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.revision || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, revision: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Date</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.date || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, date: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Drawn By</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.drawnBy || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, drawnBy: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Project #</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.projectNumber || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, projectNumber: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Address 1</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.addressLine1 || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, addressLine1: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Address 2</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.addressLine2 || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, addressLine2: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Phone</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.phone || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, phone: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Logo</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  className="property-input"
                  style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/svg+xml';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, logoData: reader.result as string } as any });
                      };
                      reader.readAsDataURL(file);
                    };
                    input.click();
                  }}
                >
                  {activeSheet.titleBlock?.logoData ? 'Change' : 'Upload'}
                </button>
                {activeSheet.titleBlock?.logoData && (
                  <button
                    className="property-input"
                    style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}
                    onClick={() => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, logoData: undefined } as any })}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          </details>
          <div className="properties-panel" style={{ marginTop: '0.25rem' }}>
            {sheetLayout === 'panel-layout' && (
              <div className="property-row">
                <span className="property-label">Scale</span>
                <select
                  className="property-input"
                  value={sheetScale}
                  onChange={e => onSetSheetScale(parseFloat(e.target.value))}
                >
                  <option value="1">1:1</option>
                  <option value="2">1:2</option>
                  <option value="3">1:3</option>
                  <option value="5">1:5</option>
                  <option value="10">1:10</option>
                </select>
              </div>
            )}
            {sheetLayout !== 'no-rungs' && sheetLayout !== 'panel-layout' && (
              <div className="property-row">
                <span className="property-label">Rung Gap</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: 1 }}>
                  <input
                    type="range"
                    className="sidebar-range"
                    min="15"
                    max="50"
                    step="2.5"
                    value={rungSpacing}
                    onChange={e => onSetRungSpacing(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '0.7rem', minWidth: '2.5rem', textAlign: 'right', opacity: 0.7 }}>
                    {rungSpacing}mm
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Display Options */}
      <section className="sidebar-section">
        <h4 className="section-title">DISPLAY</h4>
        <label className="debug-toggle">
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
          <span>Show grid</span>
        </label>
        <label className="debug-toggle">
          <input type="checkbox" checked={showPinLabels} onChange={e => setShowPinLabels(e.target.checked)} />
          <span>Pin labels</span>
        </label>
        <label className="debug-toggle">
          <input type="checkbox" checked={showDescriptions} onChange={e => setShowDescriptions(e.target.checked)} />
          <span>Descriptions</span>
        </label>
        <label className="debug-toggle">
          <input type="checkbox" checked={showPartNumbers} onChange={e => setShowPartNumbers(e.target.checked)} />
          <span>Part numbers</span>
        </label>
      </section>

      {/* Theme & Debug Footer */}
      <section className="sidebar-section sidebar-footer">
        <ThemePicker
          themeId={themeId}
          setThemeId={setThemeId}
          customColors={customColors}
          setCustomColors={setCustomColors}
        />
        <label className="debug-toggle" style={{ marginTop: '0.5rem' }}>
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

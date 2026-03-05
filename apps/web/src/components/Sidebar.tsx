/**
 * Sidebar component - page explorer with sheet tree, title block, and theme/debug footer
 */

import { useState } from 'react';
import type { Sheet } from '@fusion-cad/core-model';
import { ThemePicker } from './ThemePicker';
import { SHEET_SIZES } from '../renderer/title-block';
import type { ThemeId, CustomThemeInput } from '../renderer/theme';

interface SidebarProps {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (sheetId: string, newName: string) => void;
  onDeleteSheet: (sheetId: string) => void;
  activeSheet: Sheet | null;
  onUpdateSheet: (sheetId: string, updates: Partial<Pick<Sheet, 'titleBlock' | 'size'>>) => void;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  customColors: CustomThemeInput;
  setCustomColors: (colors: CustomThemeInput) => void;
  debugMode: boolean;
  setDebugMode: (mode: boolean) => void;
}

export function Sidebar({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
  activeSheet,
  onUpdateSheet,
  themeId,
  setThemeId,
  customColors,
  setCustomColors,
  debugMode,
  setDebugMode,
}: SidebarProps) {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
          {sheets.map(sheet => (
            <div
              key={sheet.id}
              className={`page-tree-item ${sheet.id === activeSheetId ? 'active' : ''}`}
              onClick={() => onSelectSheet(sheet.id)}
              onDoubleClick={() => handleStartRename(sheet.id)}
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
                <>
                  <span className="page-tree-name">{sheet.name}</span>
                  {sheets.length > 1 && (
                    <button
                      className="page-delete-btn"
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteSheet(sheet.id);
                      }}
                      title="Delete page"
                    >
                      &times;
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <button className="page-add-btn" onClick={onAddSheet}>
          + Add Page
        </button>
      </section>

      {/* Title Block for active sheet */}
      {activeSheet && (
        <section className="sidebar-section">
          <h3>Title Block</h3>
          <div className="properties-panel">
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
              <span className="property-label">Company</span>
              <input
                className="property-input"
                type="text"
                value={activeSheet.titleBlock?.company || ''}
                onChange={e => onUpdateSheet(activeSheet.id, { titleBlock: { ...activeSheet.titleBlock, company: e.target.value } as any })}
              />
            </div>
            <div className="property-row">
              <span className="property-label">Sheet Size</span>
              <select
                className="property-input"
                value={activeSheet.size}
                onChange={e => onUpdateSheet(activeSheet.id, { size: e.target.value })}
              >
                {Object.keys(SHEET_SIZES).map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

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

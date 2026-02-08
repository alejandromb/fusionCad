/**
 * SheetTabs component - tab bar at canvas bottom for multi-sheet navigation
 */

import { useState } from 'react';
import type { Sheet } from '@fusion-cad/core-model';

interface SheetTabsProps {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onRenameSheet: (sheetId: string, newName: string) => void;
  onDeleteSheet: (sheetId: string) => void;
}

export function SheetTabs({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onRenameSheet,
  onDeleteSheet,
}: SheetTabsProps) {
  const [contextMenu, setContextMenu] = useState<{ sheetId: string; x: number; y: number } | null>(null);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleContextMenu = (e: React.MouseEvent, sheetId: string) => {
    e.preventDefault();
    setContextMenu({ sheetId, x: e.clientX, y: e.clientY });
  };

  const handleRename = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (sheet) {
      setEditingSheetId(sheetId);
      setEditName(sheet.name);
    }
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (editingSheetId && editName.trim()) {
      onRenameSheet(editingSheetId, editName.trim());
    }
    setEditingSheetId(null);
  };

  const handleDelete = (sheetId: string) => {
    setContextMenu(null);
    if (sheets.length <= 1) return; // Can't delete the last sheet
    onDeleteSheet(sheetId);
  };

  return (
    <>
      <div className="sheet-tabs">
        {sheets.map(sheet => (
          <button
            key={sheet.id}
            className={`sheet-tab ${sheet.id === activeSheetId ? 'active' : ''}`}
            onClick={() => onSelectSheet(sheet.id)}
            onContextMenu={(e) => handleContextMenu(e, sheet.id)}
            onDoubleClick={() => handleRename(sheet.id)}
          >
            {editingSheetId === sheet.id ? (
              <input
                className="sheet-tab-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setEditingSheetId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              sheet.name
            )}
          </button>
        ))}
        <button className="sheet-tab add-tab" onClick={onAddSheet} title="Add sheet">
          +
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="menu-backdrop" onClick={() => setContextMenu(null)} />
          <div
            className="sheet-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className="menu-item" onClick={() => handleRename(contextMenu.sheetId)}>
              Rename
            </button>
            <button
              className="menu-item danger"
              onClick={() => handleDelete(contextMenu.sheetId)}
              disabled={sheets.length <= 1}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}

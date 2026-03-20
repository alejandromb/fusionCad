/**
 * MenuBar - Tabbed menu bar with contextual toolbar
 *
 * Tabs: File, Edit, Draw, View, Insert, Tools, Help
 * Each tab shows relevant toolbar icons below when active.
 * "Draw" is the default tab (maps to existing CAD toolbar).
 */

import { useState, useRef, useEffect } from 'react';
import type { InteractionMode } from '../types';

export type MenuTab = 'file' | 'edit' | 'draw' | 'view' | 'insert' | 'tools' | 'help';

interface MenuBarProps {
  activeTab: MenuTab;
  setActiveTab: (tab: MenuTab) => void;

  // Project/file operations
  projectName: string;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  onNewProject: () => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onOpenExport: () => void;
  onOpenReports: () => void;
  onSaveNow: () => void;

  // Edit operations
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  copyDevice: () => void;
  pasteDevice: () => void;
  hasClipboard: boolean;
  deleteDevices: (ids: string[]) => void;
  deleteWire: (idx: number) => void;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  sheetConnections?: import('../renderer/circuit-renderer').SheetConnection[];
  selectAll: () => void;

  // Draw mode
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  rotateSelectedDevices: (dir: 'cw' | 'ccw') => void;
  mirrorDevice: (id: string) => void;
  alignSelectedDevices: (dir: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;

  // View
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomLevel: number;
  debugMode: boolean;
  setDebugMode: (v: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  themeId: string;
  setThemeId: (id: string) => void;

  // Insert
  onOpenSymbolPalette: () => void;
  onAddSheet: () => void;

  // Tools
  onOpenAIGenerate: () => void;
  onOpenERC: () => void;
  onOpenSymbolEditor: () => void;
  onOpenPartsCatalog: () => void;

  // Help
  onShowShortcuts: () => void;
}

// SVG icon components (inline, tiny)
const icons = {
  newFile: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  save: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  download: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  upload: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  export: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  report: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  rename: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  trash: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  undo: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  redo: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  copy: <svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  paste: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" strokeWidth="2" fill="none"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  selectAll: <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="4 2"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  select: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/></svg>,
  pan: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M18 11V6a2 2 0 00-4 0v4M14 10V4a2 2 0 00-4 0v7M10 10.5V6a2 2 0 00-4 0v8M20 11a2 2 0 00-2-2h-1l0 0v-1M6 14v0a6 6 0 006 6h4a4 4 0 004-4v-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  wire: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h6m4 0h6M10 12a2 2 0 104 0 2 2 0 00-4 0" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  text: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 5h14M12 5v14M8 19h8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  rotateCCW: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 4v6h6M4 15a8 8 0 108-8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  rotateCW: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M23 4v6h-6M20 15a8 8 0 10-8-8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  mirror: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v18M5 8l4 4-4 4M19 8l-4 4 4 4" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  zoomIn: <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2"/></svg>,
  zoomOut: <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M21 21l-4.35-4.35M8 11h6" stroke="currentColor" strokeWidth="2"/></svg>,
  zoomFit: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  grid: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  debug: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2a7 7 0 017 7v4a7 7 0 01-14 0V9a7 7 0 017-7zM3.5 11h17M8 2l1 3M16 2l-1 3M5 15l-3 2M19 15l3 2" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  symbol: <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  addSheet: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  ai: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  erc: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  parts: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" strokeWidth="2" fill="none"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
  symbolEditor: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  keyboard: <svg viewBox="0 0 24 24" width="18" height="18"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  fullscreen: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 3H5a2 2 0 00-2 2v3m18-5h-3a2 2 0 00-2 2v3m0 8v3a2 2 0 01-2 2h-3M3 16v3a2 2 0 002 2h3" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  alignLeft: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 3v18M8 7h12v4H8zM8 15h8v4H8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  alignCenterX: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v18M6 7h12v4H6zM8 15h8v4H8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  alignRight: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 3v18M4 7h12v4H4zM8 15h8v4H8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  alignTop: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 4h18M7 8v12h4V8zM15 8v8h4V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  alignCenterY: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12h18M7 6v12h4V6zM15 8v8h4V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  alignBottom: <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 20h18M7 4v12h4V4zM15 8v8h4V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>,
  info: <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2"/></svg>,
};

function ToolBtn({ icon, label, onClick, disabled, active, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  disabled?: boolean; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      className={`toolbar-btn ${active ? 'active' : ''} ${danger ? 'delete-btn' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {icon}
    </button>
  );
}

function ToolLabel({ text }: { text: string }) {
  return <span className="toolbar-label">{text}</span>;
}

function Divider() {
  return <div className="toolbar-divider" />;
}

export function MenuBar(props: MenuBarProps) {
  const { activeTab, setActiveTab } = props;
  const [openDropdown, setOpenDropdown] = useState<MenuTab | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasDeviceSelection = props.selectedDevices.length > 0;
  const hasWireSelection = props.selectedWireIndex !== null;
  const hasSelection = hasDeviceSelection || hasWireSelection;
  const hasSingleSelection = props.selectedDevices.length === 1;
  const hasMultiSelection = props.selectedDevices.length >= 2;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleTabClick = (tab: MenuTab) => {
    setActiveTab(tab);
    setOpenDropdown(null);
  };

  const handleTabRightClick = (tab: MenuTab, e: React.MouseEvent) => {
    e.preventDefault();
    setOpenDropdown(openDropdown === tab ? null : tab);
  };

  const tabs: { id: MenuTab; label: string }[] = [
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' },
    { id: 'draw', label: 'Draw' },
    { id: 'view', label: 'View' },
    { id: 'insert', label: 'Insert' },
    { id: 'tools', label: 'Tools' },
    { id: 'help', label: 'Help' },
  ];

  const handleDelete = () => {
    if (hasDeviceSelection) props.deleteDevices(props.selectedDevices);
    else if (hasWireSelection) {
      const globalIdx = props.sheetConnections?.[props.selectedWireIndex!]?._globalIndex ?? props.selectedWireIndex!;
      props.deleteWire(globalIdx);
    }
  };

  const handleMirror = () => {
    if (hasSingleSelection) props.mirrorDevice(props.selectedDevices[0]);
  };

  // Render contextual toolbar based on active tab
  function renderToolbar() {
    switch (activeTab) {
      case 'file':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.newFile} label="New Project" onClick={props.onNewProject} />
              <ToolBtn icon={icons.save} label="Save Now" onClick={props.onSaveNow} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.download} label="Download Backup (.json)" onClick={props.onExportBackup} />
              <ToolBtn icon={icons.upload} label="Import from Backup" onClick={props.onImportBackup} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.export} label="Export (SVG/CSV)" onClick={props.onOpenExport} />
              <ToolBtn icon={icons.report} label="Reports (BOM, Wire List)" onClick={props.onOpenReports} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.rename} label="Rename Project" onClick={props.onRenameProject} />
              <ToolBtn icon={icons.trash} label="Delete Project" onClick={props.onDeleteProject} danger />
            </div>
          </>
        );

      case 'edit':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.undo} label="Undo (Cmd+Z)" onClick={props.undo} disabled={!props.canUndo} />
              <ToolBtn icon={icons.redo} label="Redo (Cmd+Shift+Z)" onClick={props.redo} disabled={!props.canRedo} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.copy} label="Copy (Cmd+C)" onClick={props.copyDevice} disabled={!hasSelection} />
              <ToolBtn icon={icons.paste} label="Paste (Cmd+V)" onClick={props.pasteDevice} disabled={!props.hasClipboard} />
              <ToolBtn icon={icons.delete} label="Delete (Del)" onClick={handleDelete} disabled={!hasSelection} danger />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.selectAll} label="Select All (Cmd+A)" onClick={props.selectAll} />
            </div>
            {hasSelection && (
              <>
                <Divider />
                <div className="toolbar-selection-info">{props.selectedDevices.length} selected</div>
              </>
            )}
          </>
        );

      case 'draw':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.select} label="Select (V)" onClick={() => props.setInteractionMode('select')} active={props.interactionMode === 'select'} />
              <ToolBtn icon={icons.pan} label="Pan (H)" onClick={() => props.setInteractionMode('pan')} active={props.interactionMode === 'pan'} />
              <ToolBtn icon={icons.wire} label="Wire (W)" onClick={() => props.setInteractionMode('wire')} active={props.interactionMode === 'wire'} />
              <ToolBtn icon={icons.text} label="Text (T)" onClick={() => props.setInteractionMode('text')} active={props.interactionMode === 'text'} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.undo} label="Undo (Cmd+Z)" onClick={props.undo} disabled={!props.canUndo} />
              <ToolBtn icon={icons.redo} label="Redo (Cmd+Shift+Z)" onClick={props.redo} disabled={!props.canRedo} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.copy} label="Copy (Cmd+C)" onClick={props.copyDevice} disabled={!hasSelection} />
              <ToolBtn icon={icons.paste} label="Paste (Cmd+V)" onClick={props.pasteDevice} disabled={!props.hasClipboard} />
              <ToolBtn icon={icons.delete} label="Delete (Del)" onClick={handleDelete} disabled={!hasSelection} danger />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.rotateCCW} label="Rotate CCW (Shift+R)" onClick={() => props.rotateSelectedDevices('ccw')} disabled={!hasDeviceSelection} />
              <ToolBtn icon={icons.rotateCW} label="Rotate CW (R)" onClick={() => props.rotateSelectedDevices('cw')} disabled={!hasDeviceSelection} />
              <ToolBtn icon={icons.mirror} label="Mirror (F)" onClick={handleMirror} disabled={!hasSingleSelection} />
            </div>
            {hasMultiSelection && (
              <>
                <Divider />
                <div className="toolbar-group">
                  <ToolBtn icon={icons.alignLeft} label="Align Left" onClick={() => props.alignSelectedDevices('left')} />
                  <ToolBtn icon={icons.alignCenterX} label="Align Center (H)" onClick={() => props.alignSelectedDevices('center-x')} />
                  <ToolBtn icon={icons.alignRight} label="Align Right" onClick={() => props.alignSelectedDevices('right')} />
                  <ToolBtn icon={icons.alignTop} label="Align Top" onClick={() => props.alignSelectedDevices('top')} />
                  <ToolBtn icon={icons.alignCenterY} label="Align Center (V)" onClick={() => props.alignSelectedDevices('center-y')} />
                  <ToolBtn icon={icons.alignBottom} label="Align Bottom" onClick={() => props.alignSelectedDevices('bottom')} />
                </div>
              </>
            )}
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.zoomOut} label="Zoom Out (-)" onClick={props.zoomOut} />
              <span className="toolbar-zoom-level">{Math.round(props.zoomLevel * 100)}%</span>
              <ToolBtn icon={icons.zoomIn} label="Zoom In (+)" onClick={props.zoomIn} />
              <ToolBtn icon={icons.zoomFit} label="Zoom to Fit (Cmd+0)" onClick={props.zoomToFit} />
            </div>
            {hasSelection && (
              <>
                <Divider />
                <div className="toolbar-selection-info">{props.selectedDevices.length} selected</div>
              </>
            )}
          </>
        );

      case 'view':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.zoomOut} label="Zoom Out (-)" onClick={props.zoomOut} />
              <span className="toolbar-zoom-level">{Math.round(props.zoomLevel * 100)}%</span>
              <ToolBtn icon={icons.zoomIn} label="Zoom In (+)" onClick={props.zoomIn} />
              <ToolBtn icon={icons.zoomFit} label="Zoom to Fit (Cmd+0)" onClick={props.zoomToFit} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.fullscreen} label="Fullscreen (F11)" onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen();
              }} active={!!document.fullscreenElement} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.debug} label="Debug Mode" onClick={() => props.setDebugMode(!props.debugMode)} active={props.debugMode} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.grid} label="Snap to Grid (G)" onClick={() => props.setSnapEnabled(!props.snapEnabled)} active={props.snapEnabled} />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolLabel text="Theme:" />
              <select
                className="toolbar-select"
                value={props.themeId}
                onChange={e => props.setThemeId(e.target.value)}
                title="Color theme"
              >
                <option value="professional">Professional</option>
                <option value="high-contrast">High Contrast</option>
                <option value="blueprint">Blueprint</option>
                <option value="classic">Classic</option>
                <option value="light">Light</option>
              </select>
            </div>
          </>
        );

      case 'insert':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.symbol} label="Insert Symbol" onClick={props.onOpenSymbolPalette} />
              <ToolBtn icon={icons.text} label="Place Text (T)" onClick={() => { props.setInteractionMode('text'); props.setActiveTab('draw'); }} />
              <ToolBtn icon={icons.addSheet} label="Add Sheet" onClick={props.onAddSheet} />
            </div>
          </>
        );

      case 'tools':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.ai} label="AI Generate Circuit" onClick={props.onOpenAIGenerate} />
              <ToolLabel text="AI Generate" />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.erc} label="Electrical Rules Check" onClick={props.onOpenERC} />
              <ToolLabel text="ERC" />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.symbolEditor} label="Symbol Editor" onClick={props.onOpenSymbolEditor} />
              <ToolLabel text="Symbol Editor" />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.parts} label="Parts Catalog" onClick={props.onOpenPartsCatalog} />
              <ToolLabel text="Parts" />
            </div>
          </>
        );

      case 'help':
        return (
          <>
            <div className="toolbar-group">
              <ToolBtn icon={icons.keyboard} label="Keyboard Shortcuts (?)" onClick={props.onShowShortcuts} />
              <ToolLabel text="Shortcuts" />
            </div>
            <Divider />
            <div className="toolbar-group">
              <ToolBtn icon={icons.info} label="About fusionCad" onClick={() => {
                alert('fusionCad v0.1.0\nElectrical CAD for control schematics\nAutomation-first, local-first');
              }} />
              <ToolLabel text="About" />
            </div>
          </>
        );
    }
  }

  return (
    <div className="menu-bar-wrapper" ref={dropdownRef}>
      {/* Tab row */}
      <div className="menu-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`menu-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            onContextMenu={(e) => handleTabRightClick(tab.id, e)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contextual toolbar */}
      <div className="toolbar">
        {renderToolbar()}
      </div>
    </div>
  );
}

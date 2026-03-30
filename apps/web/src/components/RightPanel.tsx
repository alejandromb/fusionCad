/**
 * RightPanel - Symbol palette with search, category filter, standard filter,
 * favorites, parts catalog, and properties tabs.
 */

import { useState, useMemo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { getAllSymbols, getSymbolCategories } from '@fusion-cad/core-model';
import type { SymbolDefinition, Part, Annotation } from '@fusion-cad/core-model';
import type { InteractionMode, SymbolCategory, PinHit } from '../types';
import type { CircuitData } from '../renderer/circuit-renderer';
import { SymbolPreview } from './SymbolPreview';
import { PropertiesPanel } from './PropertiesPanel';
import { AIChatPanel } from './AIChatPanel';
import { BomNavigator } from './BomNavigator';

const FAVORITES_KEY = 'fusionCad_favoriteSymbols';
const STANDARD_KEY = 'fusionCad_preferredStandard';

const STANDARDS = ['All', 'IEC 60617', 'ANSI/NEMA', 'Layout'] as const;
type Standard = (typeof STANDARDS)[number];

type TabId = 'symbols' | 'favorites' | 'parts' | 'properties' | 'ai';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveFavorites(favs: Set<string>): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

function loadStandard(): Standard {
  try {
    const raw = localStorage.getItem(STANDARD_KEY);
    if (raw && STANDARDS.includes(raw as Standard)) return raw as Standard;
  } catch { /* ignore */ }
  return 'ANSI/NEMA';
}

// Categories to hide on schematic/ladder sheets (layout-only symbols)
const LAYOUT_ONLY_CATEGORIES = new Set(['Panel']);

// Categories to hide on panel-layout sheets (schematic-only symbols)
const SCHEMATIC_ONLY_CATEGORIES = new Set([
  'Control', 'Power', 'Field', 'Motor', 'Meter', 'Passive',
  'Ground', 'Terminal', 'PLC', 'Junction', 'No-Connect', 'Output', 'Connectors',
]);

interface RightPanelProps {
  onSelectSymbol: (symbolId: string, category: string) => void;
  interactionMode: InteractionMode;
  placementCategory: SymbolCategory | null;
  /** 'panel-layout' hides schematic symbols, anything else hides Panel symbols */
  sheetContext?: 'schematic' | 'panel-layout';
  /** Increments when symbols are registered (triggers palette refresh) */
  symbolLibVersion?: number;
  // Properties tab props
  wireStart: PinHit | null;
  selectedDevices: string[];
  selectedWireIndex: number | null;
  circuit: CircuitData | null;
  deleteDevices: (deviceIds: string[]) => void;
  onSelectDevices: (deviceIds: string[]) => void;
  updateWireNumber: (connectionIndex: number, wireNumber: string) => void;
  onAssignPart: (deviceId: string, part: Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>) => void;
  onUpdateDevice: (deviceId: string, updates: Partial<Pick<import('@fusion-cad/core-model').Device, 'tag' | 'function' | 'location'>>) => void;
  selectedAnnotationId: string | null;
  onUpdateAnnotation: (id: string, updates: Partial<Pick<Annotation, 'content' | 'position' | 'style'>>) => void;
  onDeleteAnnotation: (id: string) => void;
  onSelectAnnotation: (id: string | null) => void;
  sheetConnections?: import('../renderer/circuit-renderer').SheetConnection[];
  projectName: string;
  projectId: string | null;
  onProjectChanged: () => void;
}

export function RightPanel({
  onSelectSymbol,
  interactionMode,
  placementCategory,
  sheetContext,
  symbolLibVersion,
  wireStart,
  selectedDevices,
  selectedWireIndex,
  circuit,
  deleteDevices,
  onSelectDevices,
  updateWireNumber,
  onAssignPart,
  onUpdateDevice,
  selectedAnnotationId,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  sheetConnections,
  projectName,
  projectId,
  onProjectChanged,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('symbols');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStandard, setSelectedStandard] = useState<Standard>(loadStandard);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [collapsed, setCollapsed] = useState(false);
  const previousTabRef = useRef<TabId>('symbols');

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('fusionCad_rightPanelWidth');
    return saved ? parseInt(saved, 10) : 280;
  });
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(280);

  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  const handleResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = panelWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev: globalThis.PointerEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartXRef.current - ev.clientX; // dragging left = wider
      const newWidth = Math.min(600, Math.max(200, resizeStartWidthRef.current + delta));
      setPanelWidth(newWidth);
    };
    const handleUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('fusionCad_rightPanelWidth', String(panelWidthRef.current));
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, []);

  const allSymbols = useMemo(() => getAllSymbols(), [symbolLibVersion]);
  const categories = useMemo(() => getSymbolCategories(), [symbolLibVersion]);

  // Auto-switch to Properties tab when something is selected
  const hasSelection = selectedDevices.length > 0 || selectedWireIndex !== null || selectedAnnotationId !== null;

  useEffect(() => {
    if (hasSelection) {
      if (activeTab !== 'properties') {
        previousTabRef.current = activeTab;
        setActiveTab('properties');
      }
    } else {
      if (activeTab === 'properties') {
        setActiveTab(previousTabRef.current);
      }
    }
  }, [hasSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFavorite = useCallback((symbolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(symbolId)) next.delete(symbolId);
      else next.add(symbolId);
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleStandardChange = useCallback((std: Standard) => {
    setSelectedStandard(std);
    localStorage.setItem(STANDARD_KEY, std);
  }, []);

  const filteredSymbols = useMemo(() => {
    let symbols = allSymbols;

    // Standard/usage filter
    if (selectedStandard === 'Layout') {
      // Show only layout symbols (any category)
      symbols = symbols.filter(s => s.usage === 'layout');
    } else if (sheetContext === 'panel-layout') {
      // Panel-layout sheet: show layout symbols + Panel category, hide schematic-only
      symbols = symbols.filter(s => s.usage === 'layout' || LAYOUT_ONLY_CATEGORIES.has(s.category));
    } else {
      // Schematic sheet: hide layout symbols
      symbols = symbols.filter(s => s.usage !== 'layout' && !LAYOUT_ONLY_CATEGORIES.has(s.category));

      // Standard filter (IEC/ANSI)
      if (selectedStandard !== 'All') {
        symbols = symbols.filter(s =>
          s.standard === selectedStandard || s.standard === 'common'
        );
      }
    }

    if (selectedCategory) {
      symbols = symbols.filter(s => s.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      symbols = symbols.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query)
      );
    }

    return symbols;
  }, [allSymbols, selectedCategory, selectedStandard, searchQuery, sheetContext]);

  const favoriteSymbols = useMemo(() => {
    return allSymbols.filter(s => favorites.has(s.id));
  }, [allSymbols, favorites]);

  // Derived state for properties tab
  const primarySelectedDeviceId = selectedDevices.length > 0 ? selectedDevices[0] : null;
  const selectedDeviceInfo = primarySelectedDeviceId && circuit
    ? circuit.devices.find(d => d.id === primarySelectedDeviceId)
    : null;
  const selectedDevicePart = selectedDeviceInfo?.partId && circuit
    ? circuit.parts.find(p => p.id === selectedDeviceInfo.partId)
    : null;
  const selectedSheetConn = selectedWireIndex !== null && sheetConnections
    ? sheetConnections[selectedWireIndex]
    : null;
  const selectedWire = selectedSheetConn as import('../renderer/circuit-renderer').Connection | null;
  const selectedWireNet = selectedWire && circuit
    ? circuit.nets.find(n => n.id === selectedWire.netId)
    : null;
  const selectedAnnotation = selectedAnnotationId && circuit
    ? (circuit.annotations || []).find(a => a.id === selectedAnnotationId)
    : null;

  if (collapsed) {
    return (
      <aside className="right-panel right-panel-collapsed">
        <button
          className="right-panel-toggle"
          onClick={() => setCollapsed(false)}
          title="Show symbol palette"
        >
          &lsaquo;
        </button>
      </aside>
    );
  }

  const renderSymbolItem = (symbol: SymbolDefinition) => (
    <button
      key={symbol.id}
      className={`symbol-palette-item ${
        interactionMode === 'place' && placementCategory === symbol.id ? 'active' : ''
      }`}
      onClick={() => onSelectSymbol(symbol.id, symbol.category)}
      title={symbol.name}
    >
      <span
        className={`favorite-star ${favorites.has(symbol.id) ? 'active' : ''}`}
        onClick={(e) => toggleFavorite(symbol.id, e)}
        title={favorites.has(symbol.id) ? 'Remove from favorites' : 'Add to favorites'}
      >
        {favorites.has(symbol.id) ? '\u2605' : '\u2606'}
      </span>
      <div className="symbol-palette-preview">
        <SymbolPreview symbol={symbol} />
      </div>
      <span className="symbol-palette-name">{symbol.name}</span>
    </button>
  );

  const renderPropertiesContent = () => (
    <div className="right-panel-content right-panel-properties">
      {/* Status Messages */}
      {(interactionMode === 'place' || interactionMode === 'wire' || interactionMode === 'text' || selectedDevices.length > 0) && (
        <div className="properties-status">
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
        </div>
      )}

      {/* Device Properties */}
      {(selectedDeviceInfo || selectedDevices.length > 1) && (
        <div className="properties-section-wrap">
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
        </div>
      )}

      {/* Annotation Properties */}
      {selectedAnnotation && !selectedDeviceInfo && (
        <div className="properties-section-wrap">
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
        </div>
      )}

      {/* Wire Properties */}
      {selectedWire && selectedWireIndex !== null && (
        <div className="properties-section-wrap">
          <h3>Wire Properties</h3>
          <div className="properties-panel">
            <div className="property-row">
              <span className="property-label">Wire #</span>
              <input
                className="property-input"
                type="text"
                value={selectedWire.wireNumber || `W${String(selectedWireIndex + 1).padStart(3, '0')}`}
                onChange={(e) => updateWireNumber(selectedSheetConn?._globalIndex ?? selectedWireIndex, e.target.value)}
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
        </div>
      )}

      {/* Empty state when nothing selected */}
      {!selectedDeviceInfo && selectedDevices.length === 0 && !selectedAnnotation && selectedWireIndex === null && interactionMode === 'select' && (
        <div className="right-panel-empty">
          Select a device, wire, or annotation to view properties
        </div>
      )}
    </div>
  );

  return (
    <aside className="right-panel" style={{ width: panelWidth }}>
      {/* Resize handle */}
      <div
        className="right-panel-resize-handle"
        onPointerDown={handleResizeStart}
      />
      {/* Tab bar */}
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          AI
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'symbols' ? 'active' : ''}`}
          onClick={() => setActiveTab('symbols')}
        >
          Symbols
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          Favs
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'parts' ? 'active' : ''}`}
          onClick={() => setActiveTab('parts')}
        >
          Parts
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          Props
        </button>
        <button
          className="right-panel-toggle"
          onClick={() => setCollapsed(true)}
          title="Hide panel"
        >
          &rsaquo;
        </button>
      </div>

      {activeTab === 'symbols' ? (
        <div className="right-panel-content">
          {/* Search bar */}
          <div className="right-panel-search">
            <input
              type="text"
              placeholder="Search symbols..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Standard filter chips */}
          <div className="standard-filter">
            {STANDARDS.map(std => (
              <button
                key={std}
                className={`standard-chip ${selectedStandard === std ? 'active' : ''}`}
                onClick={() => handleStandardChange(std)}
              >
                {std}
              </button>
            ))}
          </div>

          {/* Category filter chips */}
          <div className="right-panel-categories">
            <button
              className={`category-chip ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Symbol grid */}
          <div className="symbol-palette-grid">
            {filteredSymbols.map(renderSymbolItem)}

            {filteredSymbols.length === 0 && (
              <div className="right-panel-empty">
                No symbols found
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'favorites' ? (
        <div className="right-panel-content">
          <div className="symbol-palette-grid">
            {favoriteSymbols.map(renderSymbolItem)}

            {favoriteSymbols.length === 0 && (
              <div className="favorites-empty">
                Click &#9734; on any symbol to add it to favorites
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'properties' ? (
        renderPropertiesContent()
      ) : activeTab === 'ai' ? (
        <AIChatPanel circuit={circuit} projectName={projectName} projectId={projectId} onProjectChanged={onProjectChanged} />
      ) : activeTab === 'parts' ? (
        <div className="right-panel-content" style={{ padding: '0.5rem', overflowY: 'auto' }}>
          <BomNavigator
            circuit={circuit}
            onSelectDevice={(deviceId) => {
              onSelectSymbol('', ''); // clear placement
              // Select the device by ID
              if (circuit) {
                const dev = circuit.devices.find(d => d.id === deviceId);
                if (dev && onSelectDevices) onSelectDevices([deviceId]);
              }
            }}
            onAssignPart={onAssignPart}
          />
        </div>
      ) : (
        null
      )}
    </aside>
  );
}

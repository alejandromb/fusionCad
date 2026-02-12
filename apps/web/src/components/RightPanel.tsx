/**
 * RightPanel - Symbol palette with search, category filter, standard filter,
 * favorites, and tabs.
 */

import { useState, useMemo, useCallback } from 'react';
import { getAllSymbols, getSymbolCategories } from '@fusion-cad/core-model';
import type { SymbolDefinition } from '@fusion-cad/core-model';
import type { InteractionMode, SymbolCategory } from '../types';
import { SymbolPreview } from './SymbolPreview';

const FAVORITES_KEY = 'fusionCad_favoriteSymbols';
const STANDARD_KEY = 'fusionCad_preferredStandard';

const STANDARDS = ['All', 'IEC 60617', 'ANSI/NEMA'] as const;
type Standard = (typeof STANDARDS)[number];

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
  return 'All';
}

interface RightPanelProps {
  onSelectSymbol: (symbolId: string, category: string) => void;
  interactionMode: InteractionMode;
  placementCategory: SymbolCategory | null;
}

export function RightPanel({
  onSelectSymbol,
  interactionMode,
  placementCategory,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'symbols' | 'favorites' | 'parts'>('symbols');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStandard, setSelectedStandard] = useState<Standard>(loadStandard);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [collapsed, setCollapsed] = useState(false);

  const allSymbols = useMemo(() => getAllSymbols(), []);
  const categories = useMemo(() => getSymbolCategories(), []);

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

    // Standard filter
    if (selectedStandard !== 'All') {
      symbols = symbols.filter(s =>
        s.standard === selectedStandard || s.standard === 'common'
      );
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
  }, [allSymbols, selectedCategory, selectedStandard, searchQuery]);

  const favoriteSymbols = useMemo(() => {
    return allSymbols.filter(s => favorites.has(s.id));
  }, [allSymbols, favorites]);

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

  return (
    <aside className="right-panel">
      {/* Tab bar */}
      <div className="right-panel-tabs">
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
          Favorites
        </button>
        <button
          className={`right-panel-tab ${activeTab === 'parts' ? 'active' : ''}`}
          onClick={() => setActiveTab('parts')}
        >
          Parts
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
      ) : (
        <div className="right-panel-content">
          <div className="right-panel-empty">
            Parts catalog coming soon
          </div>
        </div>
      )}
    </aside>
  );
}

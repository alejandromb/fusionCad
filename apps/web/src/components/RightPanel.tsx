/**
 * RightPanel - Symbol palette with search, category filter, and tabs.
 * Replaces the old sidebar symbol palette and Insert button.
 */

import { useState, useMemo } from 'react';
import { getAllSymbols, getSymbolCategories } from '@fusion-cad/core-model';
import type { SymbolDefinition } from '@fusion-cad/core-model';
import type { InteractionMode, SymbolCategory } from '../types';
import { SymbolPreview } from './SymbolPreview';

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
  const [activeTab, setActiveTab] = useState<'symbols' | 'parts'>('symbols');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const allSymbols = useMemo(() => getAllSymbols(), []);
  const categories = useMemo(() => getSymbolCategories(), []);

  const filteredSymbols = useMemo(() => {
    let symbols = allSymbols;

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
  }, [allSymbols, selectedCategory, searchQuery]);

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
            {filteredSymbols.map(symbol => (
              <button
                key={symbol.id}
                className={`symbol-palette-item ${
                  interactionMode === 'place' && placementCategory === symbol.id ? 'active' : ''
                }`}
                onClick={() => onSelectSymbol(symbol.id, symbol.category)}
                title={symbol.name}
              >
                <div className="symbol-palette-preview">
                  <SymbolPreview symbol={symbol} />
                </div>
                <span className="symbol-palette-name">{symbol.name}</span>
              </button>
            ))}

            {filteredSymbols.length === 0 && (
              <div className="right-panel-empty">
                No symbols found
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

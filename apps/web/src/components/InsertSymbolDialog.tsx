/**
 * Insert Symbol Dialog
 *
 * Modal dialog for searching and inserting symbols.
 * Replaces the old sidebar symbol palette.
 */

import { useState, useMemo } from 'react';
import { getAllSymbols, getSymbolCategories } from '@fusion-cad/core-model';
import type { SymbolDefinition } from '@fusion-cad/core-model';

interface InsertSymbolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbolId: string, category: string) => void;
}

export function InsertSymbolDialog({
  isOpen,
  onClose,
  onSelectSymbol,
}: InsertSymbolDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Get all symbols and categories
  const allSymbols = useMemo(() => getAllSymbols(), []);
  const categories = useMemo(() => getSymbolCategories(), []);

  // Filter symbols based on search and category
  const filteredSymbols = useMemo(() => {
    let symbols = allSymbols;

    // Filter by category
    if (selectedCategory) {
      symbols = symbols.filter(s => s.category === selectedCategory);
    }

    // Filter by search query
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

  // Group symbols by category for display
  const symbolsByCategory = useMemo(() => {
    const groups: Record<string, SymbolDefinition[]> = {};
    for (const symbol of filteredSymbols) {
      if (!groups[symbol.category]) {
        groups[symbol.category] = [];
      }
      groups[symbol.category].push(symbol);
    }
    return groups;
  }, [filteredSymbols]);

  if (!isOpen) return null;

  const handleSymbolClick = (symbol: SymbolDefinition) => {
    onSelectSymbol(symbol.id, symbol.category);
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog insert-symbol-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Insert Symbol</h2>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-body">
          {/* Search Bar */}
          <div className="insert-symbol-search">
            <input
              type="text"
              placeholder="Search symbols..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Category Filter */}
          <div className="insert-symbol-categories">
            <button
              className={`category-btn ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              All ({allSymbols.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Symbol Grid */}
          <div className="insert-symbol-grid">
            {Object.entries(symbolsByCategory).map(([category, symbols]) => (
              <div key={category} className="symbol-category-group">
                <h4 className="symbol-category-header">{category}</h4>
                <div className="symbol-grid">
                  {symbols.map(symbol => (
                    <button
                      key={symbol.id}
                      className="symbol-grid-item"
                      onClick={() => handleSymbolClick(symbol)}
                      title={symbol.name}
                    >
                      <div className="symbol-preview">
                        <SymbolPreview symbol={symbol} />
                      </div>
                      <span className="symbol-name">{symbol.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {filteredSymbols.length === 0 && (
              <div className="no-symbols-found">
                No symbols found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini SVG preview of a symbol
 */
function SymbolPreview({ symbol }: { symbol: SymbolDefinition }) {
  const { width, height } = symbol.geometry;
  const paths = symbol.paths || [];

  // Calculate viewBox with padding
  const padding = 5;
  const viewBox = `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`;

  return (
    <svg
      viewBox={viewBox}
      className="symbol-preview-svg"
      style={{ width: '100%', height: '100%' }}
    >
      {paths.map((path, i) => (
        <path
          key={i}
          d={path.d}
          fill={path.fill ? '#00ff00' : 'none'}
          stroke="#00ff00"
          strokeWidth={path.strokeWidth || 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Draw pin indicators */}
      {symbol.pins.map(pin => (
        <circle
          key={pin.id}
          cx={pin.position.x}
          cy={pin.position.y}
          r={2}
          fill="#00ff00"
        />
      ))}
    </svg>
  );
}

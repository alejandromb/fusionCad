/**
 * Insert Symbol Dialog
 *
 * Modal dialog for searching and inserting symbols.
 * Replaces the old sidebar symbol palette.
 */

import { useState, useMemo } from 'react';
import { getAllSymbols, getSymbolCategories } from '@fusion-cad/core-model';
import type { SymbolDefinition, SymbolPrimitive } from '@fusion-cad/core-model';

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
 * Render a single SymbolPrimitive to an SVG JSX element.
 */
function renderPrimitiveToSVG(p: SymbolPrimitive, i: number): JSX.Element | null {
  const stroke = ('stroke' in p && p.stroke) || '#00ff00';
  const fill = ('fill' in p && p.fill) || 'none';
  const sw = ('strokeWidth' in p && p.strokeWidth) || 2;

  switch (p.type) {
    case 'rect':
      return <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'circle':
      return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'line':
      return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={stroke} strokeWidth={sw} />;
    case 'arc': {
      const r = p.r;
      const x1 = p.cx + r * Math.cos(p.startAngle);
      const y1 = p.cy + r * Math.sin(p.startAngle);
      const x2 = p.cx + r * Math.cos(p.endAngle);
      const y2 = p.cy + r * Math.sin(p.endAngle);
      const largeArc = Math.abs(p.endAngle - p.startAngle) > Math.PI ? 1 : 0;
      const sweep = p.endAngle > p.startAngle ? 1 : 0;
      return <path key={i} d={`M${x1},${y1} A${r},${r} 0 ${largeArc},${sweep} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={sw} />;
    }
    case 'ellipse':
      return <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'polyline': {
      const pts = p.points.map(pt => `${pt.x},${pt.y}`).join(' ');
      if (p.closed) return <polygon key={i} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      return <polyline key={i} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
    case 'text':
      return <text key={i} x={p.x} y={p.y} fontSize={p.fontSize ?? 20} fontWeight={p.fontWeight ?? 'bold'} fill="#00ff00" textAnchor={p.textAnchor || 'middle'} dominantBaseline="central">{p.content}</text>;
    case 'path':
      return <path key={i} d={p.d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
    default:
      return null;
  }
}

/**
 * Mini SVG preview of a symbol
 */
function SymbolPreview({ symbol }: { symbol: SymbolDefinition }) {
  const { width, height } = symbol.geometry;
  const primitives = symbol.primitives;
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
      {primitives && primitives.length > 0
        ? primitives.map((p, i) => renderPrimitiveToSVG(p, i))
        : paths.map((path, i) => (
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

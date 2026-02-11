/**
 * Symbol Library Manager
 *
 * Modal dialog for browsing, searching, importing, and exporting symbol definitions.
 * Renders symbol previews on mini canvases using the same SVG path renderer as the main canvas.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SymbolDefinition, SymbolPath, SymbolText, SymbolPrimitive } from '@fusion-cad/core-model';
import {
  getAllSymbols,
  getSymbolDefinition,
  registerSymbol,
  SYMBOL_CATEGORY_GROUPS,
} from '@fusion-cad/core-model';
import { SymbolEditor } from './SymbolEditor';

interface SymbolLibraryProps {
  onClose: () => void;
  onSelectSymbol?: (category: string) => void;
  storageProvider?: import('../storage/storage-provider').StorageProvider;
}

// ---------------------------------------------------------------------------
// SVG path parsing (mirrors renderer/symbols.ts logic for preview rendering)
// ---------------------------------------------------------------------------

interface PathCommand {
  type: string;
  args: number[];
}

function parseSVGPath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const regex = /([MmLlHhVvAaCcQqZz])([^MmLlHhVvAaCcQqZz]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();
    let args: number[] = [];
    if (argsStr) {
      args = argsStr
        .replace(/,/g, ' ')
        .replace(/-/g, ' -')
        .split(/\s+/)
        .filter((s) => s.length > 0)
        .map(parseFloat);
    }
    commands.push({ type, args });
  }

  return commands;
}

function svgArcToCanvasArc(
  x1: number, y1: number, x2: number, y2: number,
  r: number, largeArc: boolean, sweep: boolean
): { cx: number; cy: number; startAngle: number; endAngle: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy) / 2;
  const rAdj = Math.max(r, d);
  const h = Math.sqrt(Math.max(0, rAdj * rAdj - d * d));
  const px = -dy / (2 * d);
  const py = dx / (2 * d);
  const sign = largeArc !== sweep ? 1 : -1;
  const cx = mx + sign * h * px;
  const cy = my + sign * h * py;
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const endAngle = Math.atan2(y2 - cy, x2 - cx);
  return { cx, cy, startAngle, endAngle };
}

function renderPathCommands(
  ctx: CanvasRenderingContext2D,
  commands: PathCommand[],
  offsetX: number,
  offsetY: number
): void {
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  ctx.beginPath();

  for (const cmd of commands) {
    const { type, args } = cmd;
    const isRelative = type === type.toLowerCase();
    const cmdUpper = type.toUpperCase();

    switch (cmdUpper) {
      case 'M': {
        if (isRelative) { currentX += args[0]; currentY += args[1]; }
        else { currentX = args[0]; currentY = args[1]; }
        startX = currentX; startY = currentY;
        ctx.moveTo(offsetX + currentX, offsetY + currentY);
        for (let i = 2; i < args.length; i += 2) {
          if (isRelative) { currentX += args[i]; currentY += args[i + 1]; }
          else { currentX = args[i]; currentY = args[i + 1]; }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }
      case 'L': {
        for (let i = 0; i < args.length; i += 2) {
          if (isRelative) { currentX += args[i]; currentY += args[i + 1]; }
          else { currentX = args[i]; currentY = args[i + 1]; }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }
      case 'H': {
        for (const arg of args) {
          if (isRelative) { currentX += arg; } else { currentX = arg; }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }
      case 'V': {
        for (const arg of args) {
          if (isRelative) { currentY += arg; } else { currentY = arg; }
          ctx.lineTo(offsetX + currentX, offsetY + currentY);
        }
        break;
      }
      case 'A': {
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          const largeArc = args[i + 3];
          const sweep = args[i + 4];
          let endX = args[i + 5];
          let endY = args[i + 6];
          if (isRelative) { endX = currentX + endX; endY = currentY + endY; }
          if (rx === ry) {
            const radius = rx;
            const arc = svgArcToCanvasArc(currentX, currentY, endX, endY, radius, largeArc === 1, sweep === 1);
            ctx.arc(offsetX + arc.cx, offsetY + arc.cy, radius, arc.startAngle, arc.endAngle, sweep === 0);
          } else {
            ctx.lineTo(offsetX + endX, offsetY + endY);
          }
          currentX = endX; currentY = endY;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < args.length; i += 6) {
          let x1 = args[i], y1 = args[i + 1], x2 = args[i + 2], y2 = args[i + 3], x = args[i + 4], y = args[i + 5];
          if (isRelative) { x1 += currentX; y1 += currentY; x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
          ctx.bezierCurveTo(offsetX + x1, offsetY + y1, offsetX + x2, offsetY + y2, offsetX + x, offsetY + y);
          currentX = x; currentY = y;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i < args.length; i += 4) {
          let x1 = args[i], y1 = args[i + 1], x = args[i + 2], y = args[i + 3];
          if (isRelative) { x1 += currentX; y1 += currentY; x += currentX; y += currentY; }
          ctx.quadraticCurveTo(offsetX + x1, offsetY + y1, offsetX + x, offsetY + y);
          currentX = x; currentY = y;
        }
        break;
      }
      case 'Z': {
        ctx.closePath();
        currentX = startX; currentY = startY;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Symbol preview renderer
// ---------------------------------------------------------------------------

function renderSymbolPreview(
  canvas: HTMLCanvasElement,
  category: string,
  size: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.scale(dpr, dpr);

  // Clear with dark background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);

  const def = getSymbolDefinition(category);
  if (!def) {
    // Draw placeholder
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', size / 2, size / 2);
    return;
  }

  // Calculate scale to fit symbol in canvas with padding
  const padding = 8;
  const available = size - padding * 2;
  const scaleX = available / def.geometry.width;
  const scaleY = available / def.geometry.height;
  const scale = Math.min(scaleX, scaleY, 1.5); // cap at 1.5x to avoid huge symbols

  // Center the symbol
  const scaledW = def.geometry.width * scale;
  const scaledH = def.geometry.height * scale;
  const offsetX = (size - scaledW) / 2;
  const offsetY = (size - scaledH) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Render primitives (preferred) or paths
  if (def.primitives && def.primitives.length > 0) {
    renderPrimitivesToCanvas(ctx, def.primitives, 0, 0);
  } else if (def.paths && def.paths.length > 0) {
    renderSymbolPaths(ctx, def.paths, 0, 0);
    if (def.texts && def.texts.length > 0) {
      renderSymbolTexts(ctx, def.texts, 0, 0);
    }
  } else {
    // Fallback: draw bounding rectangle
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, def.geometry.width, def.geometry.height);
  }

  // Draw pin dots
  ctx.fillStyle = '#00ffff';
  for (const pin of def.pins) {
    ctx.beginPath();
    ctx.arc(pin.position.x, pin.position.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderSymbolPaths(
  ctx: CanvasRenderingContext2D,
  paths: SymbolPath[],
  x: number,
  y: number
): void {
  for (const path of paths) {
    const commands = parseSVGPath(path.d);
    const shouldStroke = path.stroke !== false;
    const shouldFill = path.fill === true;
    const strokeWidth = path.strokeWidth ?? 2;

    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#00ff00';
    ctx.lineWidth = strokeWidth;

    renderPathCommands(ctx, commands, x, y);

    if (shouldFill) ctx.fill();
    if (shouldStroke) ctx.stroke();
  }
}

function renderSymbolTexts(
  ctx: CanvasRenderingContext2D,
  texts: SymbolText[],
  x: number,
  y: number
): void {
  for (const text of texts) {
    const fontSize = text.fontSize ?? 20;
    const fontWeight = text.fontWeight ?? 'bold';
    ctx.fillStyle = '#00ff00';
    ctx.font = `${fontWeight} ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.content, x + text.x, y + text.y);
  }
}

// ---------------------------------------------------------------------------
// Typed primitive renderer for canvas previews
// ---------------------------------------------------------------------------

function renderPrimitivesToCanvas(
  ctx: CanvasRenderingContext2D,
  primitives: SymbolPrimitive[],
  x: number,
  y: number,
): void {
  for (const p of primitives) {
    const strokeColor = ('stroke' in p && p.stroke) || '#00ff00';
    const fillColor = ('fill' in p && p.fill) || 'none';
    const lineWidth = ('strokeWidth' in p && p.strokeWidth) || 2;

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor !== 'none' ? fillColor : '#00ff00';
    ctx.lineWidth = lineWidth;

    switch (p.type) {
      case 'rect': {
        ctx.beginPath();
        ctx.rect(x + p.x, y + p.y, p.width, p.height);
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.arc(x + p.cx, y + p.cy, p.r, 0, Math.PI * 2);
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(x + p.x1, y + p.y1);
        ctx.lineTo(x + p.x2, y + p.y2);
        ctx.stroke();
        break;
      }
      case 'arc': {
        ctx.beginPath();
        ctx.arc(x + p.cx, y + p.cy, p.r, p.startAngle, p.endAngle);
        ctx.stroke();
        break;
      }
      case 'ellipse': {
        ctx.beginPath();
        ctx.ellipse(x + p.cx, y + p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'polyline': {
        if (p.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(x + p.points[0].x, y + p.points[0].y);
        for (let i = 1; i < p.points.length; i++) {
          ctx.lineTo(x + p.points[i].x, y + p.points[i].y);
        }
        if (p.closed) ctx.closePath();
        if (fillColor !== 'none') ctx.fill();
        if (strokeColor !== 'none') ctx.stroke();
        break;
      }
      case 'text': {
        const fontSize = p.fontSize ?? 20;
        const fontWeight = p.fontWeight ?? 'bold';
        ctx.fillStyle = '#00ff00';
        ctx.font = `${fontWeight} ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.content, x + p.x, y + p.y);
        break;
      }
      case 'path': {
        const commands = parseSVGPath(p.d);
        const shouldStroke = p.stroke !== 'none';
        const shouldFill = p.fill != null && p.fill !== 'none';
        ctx.strokeStyle = '#00ff00';
        ctx.fillStyle = '#00ff00';
        ctx.lineWidth = p.strokeWidth ?? 2;
        renderPathCommands(ctx, commands, x, y);
        if (shouldFill) ctx.fill();
        if (shouldStroke) ctx.stroke();
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SymbolPreviewCanvas component
// ---------------------------------------------------------------------------

function SymbolPreviewCanvas({
  category,
  size,
}: {
  category: string;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderSymbolPreview(canvasRef.current, category, size);
    }
  }, [category, size]);

  return <canvas ref={canvasRef} />;
}

// ---------------------------------------------------------------------------
// Main SymbolLibrary component
// ---------------------------------------------------------------------------

export function SymbolLibrary({ onClose, onSelectSymbol, storageProvider }: SymbolLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolDefinition | null>(null);
  const [symbols, setSymbols] = useState<SymbolDefinition[]>(() => getAllSymbols());
  const [importError, setImportError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editSymbolId, setEditSymbolId] = useState<string | undefined>(undefined);

  // Refresh symbol list
  const refreshSymbols = useCallback(() => {
    setSymbols(getAllSymbols());
  }, []);

  // Gather group names from the category groups
  const groupNames = SYMBOL_CATEGORY_GROUPS.map((g) => g.name);

  // Build a map: category ID -> group name
  const categoryToGroup = new Map<string, string>();
  for (const group of SYMBOL_CATEGORY_GROUPS) {
    for (const cat of group.categories) {
      categoryToGroup.set(cat.id, group.name);
    }
  }

  // Filter symbols by search query and active group
  const filteredSymbols = symbols.filter((sym) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = sym.name.toLowerCase().includes(q);
      const categoryMatch = sym.category.toLowerCase().includes(q);
      if (!nameMatch && !categoryMatch) return false;
    }

    // Group filter
    if (activeGroup) {
      const symGroup = categoryToGroup.get(sym.category);
      if (symGroup !== activeGroup) return false;
    }

    return true;
  });

  // Group filtered symbols by their group for display
  const symbolsByGroup = new Map<string, SymbolDefinition[]>();
  for (const sym of filteredSymbols) {
    const group = categoryToGroup.get(sym.category) || 'Other';
    const list = symbolsByGroup.get(group) || [];
    list.push(sym);
    symbolsByGroup.set(group, list);
  }

  // Import handler
  const handleImport = () => {
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const def = JSON.parse(reader.result as string) as SymbolDefinition;
          if (def.id && def.category && def.geometry && def.pins) {
            registerSymbol(def);
            refreshSymbols();
            setSelectedSymbol(def);
          } else {
            setImportError('Invalid symbol file: missing required fields (id, category, geometry, pins)');
          }
        } catch (err) {
          setImportError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Export handler
  const handleExport = (def: SymbolDefinition) => {
    const json = JSON.stringify(def, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${def.category}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle selecting a symbol for placement
  const handlePlaceSymbol = (def: SymbolDefinition) => {
    if (onSelectSymbol) {
      onSelectSymbol(def.category);
      onClose();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="symbol-library-overlay" onClick={onClose}>
      <div className="symbol-library" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="symbol-library-header">
          <h2>Symbol Library</h2>
          <div className="symbol-library-actions">
            <button className="btn-primary" onClick={() => {
              setEditSymbolId(undefined);
              setShowEditor(true);
            }}>
              + Create Symbol
            </button>
            <button className="btn-secondary" onClick={handleImport}>
              Import JSON
            </button>
            <button className="symbol-library-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        {importError && (
          <div className="symbol-library-error">{importError}</div>
        )}

        {/* Search bar */}
        <div className="symbol-library-search-row">
          <input
            type="text"
            className="symbol-library-search"
            placeholder="Search symbols by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <span className="symbol-library-count">
            {filteredSymbols.length} symbol{filteredSymbols.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="symbol-library-body">
          {/* Category filter sidebar */}
          <div className="symbol-library-categories">
            <button
              className={`symbol-library-cat-btn ${activeGroup === null ? 'active' : ''}`}
              onClick={() => setActiveGroup(null)}
            >
              All
            </button>
            {groupNames.map((name) => (
              <button
                key={name}
                className={`symbol-library-cat-btn ${activeGroup === name ? 'active' : ''}`}
                onClick={() => setActiveGroup(activeGroup === name ? null : name)}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Main content area */}
          <div className="symbol-library-content">
            {selectedSymbol ? (
              /* Detail view */
              <div className="symbol-library-detail">
                <button
                  className="symbol-library-back"
                  onClick={() => setSelectedSymbol(null)}
                >
                  &larr; Back to grid
                </button>

                <div className="symbol-library-detail-layout">
                  <div className="symbol-library-detail-preview">
                    <SymbolPreviewCanvas
                      category={selectedSymbol.category}
                      size={160}
                    />
                  </div>

                  <div className="symbol-library-detail-info">
                    <h3>{selectedSymbol.name}</h3>
                    <div className="symbol-library-detail-meta">
                      <div className="symbol-library-detail-row">
                        <span className="detail-label">Category</span>
                        <span className="detail-value">{selectedSymbol.category}</span>
                      </div>
                      <div className="symbol-library-detail-row">
                        <span className="detail-label">Size</span>
                        <span className="detail-value">
                          {selectedSymbol.geometry.width} x {selectedSymbol.geometry.height}
                        </span>
                      </div>
                      <div className="symbol-library-detail-row">
                        <span className="detail-label">Pins</span>
                        <span className="detail-value">{selectedSymbol.pins.length}</span>
                      </div>
                      <div className="symbol-library-detail-row">
                        <span className="detail-label">Paths</span>
                        <span className="detail-value">
                          {selectedSymbol.paths?.length ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Pin list */}
                    <div className="symbol-library-pin-list">
                      <h4>Pins</h4>
                      <div className="symbol-library-pins">
                        {selectedSymbol.pins.map((pin) => (
                          <div key={pin.id} className="symbol-library-pin">
                            <span className="pin-id">{pin.id}</span>
                            <span className="pin-name">{pin.name}</span>
                            <span className="pin-type">{pin.pinType}</span>
                            <span className="pin-dir">{pin.direction}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="symbol-library-detail-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditSymbolId(selectedSymbol.id);
                          setShowEditor(true);
                        }}
                      >
                        Edit Symbol
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => handleExport(selectedSymbol)}
                      >
                        Export JSON
                      </button>
                      {onSelectSymbol && (
                        <button
                          className="btn-primary"
                          onClick={() => handlePlaceSymbol(selectedSymbol)}
                        >
                          Place Symbol
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Grid view */
              <div className="symbol-library-grid-area">
                {filteredSymbols.length === 0 ? (
                  <div className="symbol-library-empty">
                    No symbols found{searchQuery ? ` matching "${searchQuery}"` : ''}.
                  </div>
                ) : (
                  /* Group symbols by group name */
                  Array.from(symbolsByGroup.entries()).map(([groupName, groupSymbols]) => (
                    <div key={groupName} className="symbol-library-group">
                      <div className="symbol-library-group-header">
                        {groupName}
                        <span className="symbol-library-group-count">
                          {groupSymbols.length}
                        </span>
                      </div>
                      <div className="symbol-library-grid">
                        {groupSymbols.map((sym) => (
                          <div
                            key={sym.id}
                            className="symbol-library-card"
                            onClick={() => setSelectedSymbol(sym)}
                            title={`${sym.name} (${sym.category})`}
                          >
                            <SymbolPreviewCanvas
                              category={sym.category}
                              size={60}
                            />
                            <span className="symbol-library-card-name">
                              {sym.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Symbol Editor */}
      <SymbolEditor
        isOpen={showEditor}
        onClose={() => {
          setShowEditor(false);
          setEditSymbolId(undefined);
        }}
        onSave={(symbol) => {
          refreshSymbols();
          setSelectedSymbol(symbol);
        }}
        editSymbolId={editSymbolId}
        storageProvider={storageProvider}
      />
    </div>
  );
}

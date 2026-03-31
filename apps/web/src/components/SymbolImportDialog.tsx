/**
 * Symbol Import Dialog — upload SVG or DXF files and convert to fusionCad symbols
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { importSvg, importDxf, finalizeImportedSymbol, simplifyLayoutPrimitives, type ImportedSymbol, type PinCandidate } from '@fusion-cad/core-engine';
import type { SymbolPrimitive } from '@fusion-cad/core-model';
import { registerSymbol } from '@fusion-cad/core-model';
import { saveSymbol as saveSymbolApi } from '../api/symbols';

interface SymbolImportDialogProps {
  onClose: () => void;
  onSymbolRegistered?: () => void;
}

export function SymbolImportDialog({ onClose, onSymbolRegistered }: SymbolImportDialogProps) {
  const [rawImported, setRawImported] = useState<ImportedSymbol | null>(null);
  const [sourceContent, setSourceContent] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<'svg' | 'dxf' | null>(null);
  const [fileName, setFileName] = useState('');
  const [symbolName, setSymbolName] = useState('');
  const [symbolId, setSymbolId] = useState('');
  const [category, setCategory] = useState('custom');
  const [tagPrefix] = useState('X');
  const [targetWidth, setTargetWidth] = useState(40);
  const [usage, setUsage] = useState<'schematic' | 'layout'>('schematic');
  const [simplifyLayout, setSimplifyLayout] = useState(true);
  const [preserveLabels, setPreserveLabels] = useState(true);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute display version: apply optimization dynamically based on current settings
  const imported = useMemo(() => {
    if (!rawImported) return null;
    if (usage === 'layout' && simplifyLayout) {
      const optimized = simplifyLayoutPrimitives(rawImported.primitives, { preserveLabels });
      return {
        ...rawImported,
        primitives: optimized,
        pinCandidates: [], // layout footprints don't have electrical pins
      };
    }
    return rawImported;
  }, [rawImported, usage, simplifyLayout, preserveLabels]);

  const pins = imported?.pinCandidates ?? [];

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setSaved(false);
    const name = file.name.replace(/\.(svg|dxf|dwg)$/i, '');
    setFileName(file.name);
    setSymbolName(name);
    setSymbolId(`imported-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);

    try {
      const text = await file.text();
      let result: ImportedSymbol;
      if (file.name.toLowerCase().endsWith('.dxf')) {
        setSourceFormat('dxf');
        result = importDxf(text, targetWidth);
      } else if (file.name.toLowerCase().endsWith('.svg')) {
        setSourceFormat('svg');
        result = importSvg(text, targetWidth);
      } else {
        setError('Unsupported format. Use SVG or DXF. For DWG, convert to DXF first.');
        return;
      }
      setSourceContent(text);
      result.sourceName = file.name;
      setRawImported(result);
    } catch (err: any) {
      setError(`Parse error: ${err.message}`);
    }
  }, [targetWidth]);

  const reimportCurrent = useCallback((nextWidth: number) => {
    if (!sourceContent || !sourceFormat) return;
    try {
      const nextImported = sourceFormat === 'dxf'
        ? importDxf(sourceContent, nextWidth)
        : importSvg(sourceContent, nextWidth);
      nextImported.sourceName = fileName;
      setError('');
      setRawImported(nextImported);
      setSaved(false);
    } catch (err: any) {
      setError(`Parse error: ${err.message}`);
    }
  }, [fileName, sourceContent, sourceFormat]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSave = useCallback(async () => {
    if (!imported) return;

    const confirmedPins = pins.map((p: PinCandidate) => ({
      x: p.x,
      y: p.y,
      name: p.name,
      direction: p.suggestedDirection,
      pinType: 'passive',
    }));

    const symbolDef = finalizeImportedSymbol(
      imported,
      symbolId,
      symbolName,
      category,
      confirmedPins,
      tagPrefix,
      usage,
    );

    registerSymbol(symbolDef);

    // Persist: try API first (database), fall back to localStorage
    try {
      await saveSymbolApi(symbolDef);
    } catch {
      // Offline or API error — save to localStorage as fallback
      try {
        const stored = JSON.parse(localStorage.getItem('fusionCad_importedSymbols') || '[]');
        // Replace if same ID exists
        const idx = stored.findIndex((s: any) => s.id === symbolDef.id);
        if (idx >= 0) stored[idx] = symbolDef; else stored.push(symbolDef);
        localStorage.setItem('fusionCad_importedSymbols', JSON.stringify(stored));
      } catch { /* ignore */ }
    }

    setSaved(true);
    onSymbolRegistered?.();
  }, [imported, pins, symbolId, symbolName, category, tagPrefix]);

  const removePin = (idx: number) => {
    if (!rawImported) return;
    const newCandidates = rawImported.pinCandidates.filter((_, i) => i !== idx);
    setRawImported({ ...rawImported, pinCandidates: newCandidates });
  };

  const updatePinName = (idx: number, name: string) => {
    if (!rawImported) return;
    const newCandidates = rawImported.pinCandidates.map((p, i) => i === idx ? { ...p, name } : p);
    setRawImported({ ...rawImported, pinCandidates: newCandidates });
  };

  const renderPreview = ({
    width = '100%',
    height,
    maxWidth,
  }: {
    width?: number | string;
    height: number | string;
    maxWidth?: string;
  }) => {
    if (!imported) return null;

    return (
      <svg
        viewBox={`-2 -2 ${imported.bounds.width + 4} ${imported.bounds.height + 4}`}
        width={width}
        height={height}
        style={{ display: 'block', maxWidth }}
      >
        {imported.primitives.map((p: SymbolPrimitive, i: number) => {
          switch (p.type) {
            case 'line': return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'rect': return <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'circle': return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'arc': return <path key={i} d={`M ${p.cx + p.r * Math.cos(p.startAngle)} ${p.cy + p.r * Math.sin(p.startAngle)} A ${p.r} ${p.r} 0 0 1 ${p.cx + p.r * Math.cos(p.endAngle)} ${p.cy + p.r * Math.sin(p.endAngle)}`} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'polyline': return <polyline key={i} points={p.points.map((pt: {x:number;y:number}) => `${pt.x},${pt.y}`).join(' ')} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'path': return <path key={i} d={p.d} stroke="#aaa" strokeWidth="0.3" fill="none" />;
            case 'text': return <text key={i} x={p.x} y={p.y} fontSize={p.fontSize || 2} fill="#888">{p.content}</text>;
            default: return null;
          }
        })}
        {pins.map((pin, i) => (
          <circle key={`pin-${i}`} cx={pin.x} cy={pin.y} r="1" fill="#FFB400" opacity="0.7" />
        ))}
      </svg>
    );
  };

  return (
    <>
      <div className="dialog-backdrop" onClick={onClose}>
        <div
          className="dialog"
          onClick={e => e.stopPropagation()}
          style={{ width: '500px', maxHeight: '80vh', overflow: 'auto' }}
        >
          <div className="dialog-header">
            <h3>Import Symbol</h3>
            <button className="dialog-close" onClick={onClose}>x</button>
          </div>

          <div className="dialog-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Drop zone */}
            {!imported && (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--fc-border-strong)',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  opacity: 0.7,
                }}
              >
                <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  Drop SVG or DXF file here
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                  or click to browse. For DWG, convert to DXF first.
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg,.dxf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            )}

            {error && (
              <div style={{ color: '#ff4444', fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(255,0,0,0.1)', borderRadius: '4px' }}>
                {error}
              </div>
            )}

            {/* Import result */}
            {imported && (
              <>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                  Imported from: {fileName} — {imported.primitives.length} elements, {imported.bounds.width.toFixed(1)} x {imported.bounds.height.toFixed(1)} mm
                </div>

                {/* Preview */}
              <div style={{ background: '#111', borderRadius: '4px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                  {renderPreview({ height: 150, maxWidth: '400px' })}
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>
                      Use large preview for inspection and screenshots.
                    </div>
                    <button
                      className="assign-part-btn"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                      onClick={() => {
                        setPreviewZoom(1);
                        setExpandedPreview(true);
                      }}
                    >
                      Open Large Preview
                    </button>
                  </div>
                </div>

                {/* Step 1: What is this? */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <button
                    className="assign-part-btn"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      background: usage === 'schematic' ? 'var(--fc-accent)' : undefined,
                      color: usage === 'schematic' ? '#fff' : undefined,
                      fontWeight: usage === 'schematic' ? 'bold' : undefined,
                    }}
                    onClick={() => { setUsage('schematic'); setCategory('Control'); }}
                  >
                    Schematic Symbol
                  </button>
                  <button
                    className="assign-part-btn"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      background: usage === 'layout' ? 'var(--fc-accent)' : undefined,
                      color: usage === 'layout' ? '#fff' : undefined,
                      fontWeight: usage === 'layout' ? 'bold' : undefined,
                    }}
                    onClick={() => { setUsage('layout'); setCategory('Panel'); }}
                  >
                    Layout Footprint
                  </button>
                </div>

                {usage === 'layout' && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={simplifyLayout} onChange={e => setSimplifyLayout(e.target.checked)} />
                      Simplified outline (recommended for panel layout)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={preserveLabels} onChange={e => setPreserveLabels(e.target.checked)} />
                      Preserve readable labels like "24 VDC"
                    </label>
                  </>
                )}

                {/* Step 2: Name (required) */}
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>Name</span>
                  <input className="property-input" style={{ width: '100%', textAlign: 'left' }} value={symbolName} onChange={e => {
                    setSymbolName(e.target.value);
                    setSymbolId(`imported-${e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
                  }} />
                  <span>Width (mm)</span>
                  <input
                    className="property-input"
                    style={{ width: '60px' }}
                    type="number"
                    value={targetWidth}
                    onChange={e => {
                      const nextWidth = Number(e.target.value);
                      setTargetWidth(nextWidth);
                      reimportCurrent(nextWidth);
                    }}
                  />
                </div>

                {/* Detected pins */}
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    Pins ({pins.length} detected)
                  </div>
                  {pins.length === 0 && (
                    <div style={{ fontSize: '0.75rem', opacity: 0.5, fontStyle: 'italic' }}>
                      No pins detected. You can add them in the Symbol Editor after import.
                    </div>
                  )}
                  <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {pins.map((pin, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem', padding: '0.15rem 0' }}>
                        <input
                          className="property-input"
                          style={{ width: '50px', textAlign: 'left', padding: '0.15rem 0.3rem' }}
                          value={pin.name}
                          onChange={e => updatePinName(idx, e.target.value)}
                        />
                        <span style={{ opacity: 0.5 }}>
                          ({pin.x.toFixed(1)}, {pin.y.toFixed(1)}) {pin.suggestedDirection} — {pin.source}
                        </span>
                        <button
                          onClick={() => removePin(idx)}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ff6666', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="assign-part-btn"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setRawImported(null);
                      setSourceContent(null);
                      setSourceFormat(null);
                      setSaved(false);
                    }}
                  >
                    Import Different File
                  </button>
                  <button
                    className="assign-part-btn"
                    style={{ flex: 1, background: saved ? 'rgba(0,200,80,0.2)' : undefined }}
                    onClick={handleSave}
                    disabled={!symbolName || !symbolId}
                  >
                    {saved ? 'Saved!' : 'Save to Library'}
                  </button>
                </div>

                {saved && (
                  <div style={{ fontSize: '0.8rem', color: '#00C850', textAlign: 'center', lineHeight: 1.5 }}>
                    Symbol "{symbolName}" saved.
                    {usage === 'layout'
                      ? ' Set a sheet to "Panel Layout", then click the "Layout" filter in the palette.'
                      : ' Find it in the symbol palette — search by name or browse the "All" filter.'
                    }
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {expandedPreview && imported && (
        <div
          onClick={() => setExpandedPreview(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1280px, 96vw)',
              height: 'min(900px, 92vh)',
              background: 'var(--fc-bg-panel)',
              border: '1px solid var(--fc-border-strong)',
              borderRadius: '10px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div className="dialog-header" style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--fc-border)' }}>
              <h3 style={{ margin: 0 }}>Large Preview</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button className="assign-part-btn" style={{ padding: '0.35rem 0.65rem' }} onClick={() => setPreviewZoom(z => Math.max(0.5, z - 0.25))}>-</button>
                <div style={{ minWidth: '64px', textAlign: 'center', fontSize: '0.8rem', opacity: 0.8 }}>
                  {Math.round(previewZoom * 100)}%
                </div>
                <button className="assign-part-btn" style={{ padding: '0.35rem 0.65rem' }} onClick={() => setPreviewZoom(z => Math.min(4, z + 0.25))}>+</button>
                <button className="assign-part-btn" style={{ padding: '0.35rem 0.65rem' }} onClick={() => setPreviewZoom(1)}>Reset</button>
                <button className="dialog-close" onClick={() => setExpandedPreview(false)}>x</button>
              </div>
            </div>
            <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', opacity: 0.7, borderBottom: '1px solid var(--fc-border)' }}>
              {fileName} — {imported.primitives.length} elements — {imported.bounds.width.toFixed(1)} x {imported.bounds.height.toFixed(1)} mm
            </div>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                background: '#0b0b0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.25rem',
              }}
            >
              <div
                style={{
                  width: `${Math.max(700, imported.bounds.width * 8 * previewZoom)}px`,
                  minHeight: `${Math.max(420, imported.bounds.height * 8 * previewZoom)}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderPreview({
                  width: Math.max(700, (imported.bounds.width + 4) * 8 * previewZoom),
                  height: Math.max(420, (imported.bounds.height + 4) * 8 * previewZoom),
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Symbol Import Dialog — upload SVG or DXF files and convert to fusionCad symbols
 */

import { useState, useRef, useCallback } from 'react';
import { importSvg, importDxf, finalizeImportedSymbol, type ImportedSymbol, type PinCandidate } from '@fusion-cad/core-engine';
import { registerSymbol } from '@fusion-cad/core-model';

const SYMBOL_CATEGORIES = [
  { value: 'PLC', label: 'PLC' },
  { value: 'Control', label: 'Control' },
  { value: 'Power', label: 'Power' },
  { value: 'Motor', label: 'Motor' },
  { value: 'Field', label: 'Field Devices' },
  { value: 'Connectors', label: 'Connectors' },
  { value: 'Terminal', label: 'Terminal' },
  { value: 'Ground', label: 'Ground' },
  { value: 'Meter', label: 'Meter' },
  { value: 'Passive', label: 'Passive' },
  { value: 'Output', label: 'Output' },
  { value: 'Panel', label: 'Panel' },
  { value: 'Junction', label: 'Junction' },
  { value: 'custom', label: 'Custom' },
];

interface SymbolImportDialogProps {
  onClose: () => void;
}

export function SymbolImportDialog({ onClose }: SymbolImportDialogProps) {
  const [imported, setImported] = useState<ImportedSymbol | null>(null);
  const [fileName, setFileName] = useState('');
  const [symbolName, setSymbolName] = useState('');
  const [symbolId, setSymbolId] = useState('');
  const [category, setCategory] = useState('custom');
  const [tagPrefix, setTagPrefix] = useState('X');
  const [targetWidth, setTargetWidth] = useState(40);
  const [usage, setUsage] = useState<'schematic' | 'layout'>('schematic');
  const [pins, setPins] = useState<PinCandidate[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setSaved(false);
    const text = await file.text();
    const name = file.name.replace(/\.(svg|dxf|dwg)$/i, '');
    setFileName(file.name);
    setSymbolName(name);
    setSymbolId(`imported-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`);

    try {
      let result: ImportedSymbol;
      if (file.name.toLowerCase().endsWith('.dxf')) {
        result = importDxf(text, targetWidth);
      } else if (file.name.toLowerCase().endsWith('.svg')) {
        result = importSvg(text, targetWidth);
      } else {
        setError('Unsupported format. Use SVG or DXF. For DWG, convert to DXF first.');
        return;
      }
      result.sourceName = file.name;
      setImported(result);
      setPins(result.pinCandidates);
    } catch (err: any) {
      setError(`Parse error: ${err.message}`);
    }
  }, [targetWidth]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSave = useCallback(() => {
    if (!imported) return;

    const confirmedPins = pins.map(p => ({
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
    setSaved(true);
  }, [imported, pins, symbolId, symbolName, category, tagPrefix]);

  const removePin = (idx: number) => {
    setPins(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePinName = (idx: number, name: string) => {
    setPins(prev => prev.map((p, i) => i === idx ? { ...p, name } : p));
  };

  return (
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

              {/* Symbol properties */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                <span>Type</span>
                <select className="property-input" style={{ width: '100%' }} value={usage} onChange={e => {
                  const val = e.target.value as 'schematic' | 'layout';
                  setUsage(val);
                  setCategory(val === 'layout' ? 'Panel' : 'Control');
                }}>
                  <option value="schematic">Schematic Symbol</option>
                  <option value="layout">Layout Footprint</option>
                </select>
                <span>Name</span>
                <input className="property-input" style={{ width: '100%', textAlign: 'left' }} value={symbolName} onChange={e => setSymbolName(e.target.value)} />
                <span>ID</span>
                <input className="property-input" style={{ width: '100%', textAlign: 'left' }} value={symbolId} onChange={e => setSymbolId(e.target.value)} />
                <span>Category</span>
                <select className="property-input" style={{ width: '100%' }} value={category} onChange={e => setCategory(e.target.value)}>
                  <optgroup label="Primary">
                    <option value="Control">Schematic</option>
                    <option value="Panel">Layout</option>
                  </optgroup>
                  <optgroup label="Subcategory">
                    {SYMBOL_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                </select>
                <span>Tag prefix</span>
                <input className="property-input" style={{ width: '60px', textAlign: 'left' }} value={tagPrefix} onChange={e => setTagPrefix(e.target.value)} />
                <span>Width (mm)</span>
                <input className="property-input" style={{ width: '60px' }} type="number" value={targetWidth} onChange={e => setTargetWidth(Number(e.target.value))} />
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
                  onClick={() => { setImported(null); setPins([]); setSaved(false); }}
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
                <div style={{ fontSize: '0.8rem', color: '#00C850', textAlign: 'center' }}>
                  Symbol "{symbolName}" registered. Find it in the symbol palette under "{category}".
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

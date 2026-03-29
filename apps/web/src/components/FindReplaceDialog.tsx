/**
 * Find/Replace Dialog — search and replace device tags, functions, wire numbers, annotations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Device } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';

interface FindReplaceDialogProps {
  circuit: CircuitData | null;
  onClose: () => void;
  onUpdateDevice: (deviceId: string, updates: Partial<Pick<Device, 'tag' | 'function' | 'location'>>) => void;
  onSelectDevices: (deviceIds: string[]) => void;
  activeSheetId?: string;
}

type SearchField = 'tag' | 'function' | 'all';

interface SearchResult {
  type: 'tag' | 'function' | 'location' | 'wireNumber' | 'annotation';
  deviceId?: string;
  connectionIndex?: number;
  annotationId?: string;
  value: string;
  label: string;  // display label like "K1 — tag"
}

export function FindReplaceDialog({
  circuit,
  onClose,
  onUpdateDevice,
  onSelectDevices,
  activeSheetId,
}: FindReplaceDialogProps) {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchField, setSearchField] = useState<SearchField>('all');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [replacedCount, setReplacedCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Search across all entities
  const results: SearchResult[] = useCallback(() => {
    if (!circuit || !searchText) return [];
    const results: SearchResult[] = [];
    const match = (value: string) => {
      if (!value) return false;
      return caseSensitive
        ? value.includes(searchText)
        : value.toLowerCase().includes(searchText.toLowerCase());
    };

    // Filter to active sheet
    const sheetDevices = activeSheetId
      ? circuit.devices.filter(d => d.sheetId === activeSheetId)
      : circuit.devices;

    for (const device of sheetDevices) {
      if ((searchField === 'all' || searchField === 'tag') && match(device.tag)) {
        results.push({
          type: 'tag',
          deviceId: device.id,
          value: device.tag,
          label: `${device.tag} — tag`,
        });
      }
      if ((searchField === 'all' || searchField === 'function') && device.function && match(device.function)) {
        results.push({
          type: 'function',
          deviceId: device.id,
          value: device.function,
          label: `${device.tag} — ${device.function}`,
        });
      }
    }

    return results;
  }, [circuit, searchText, searchField, caseSensitive, activeSheetId])();

  // Navigate to result
  const goToResult = useCallback((idx: number) => {
    const clamped = results.length > 0 ? ((idx % results.length) + results.length) % results.length : 0;
    setActiveResultIdx(clamped);
    const result = results[clamped];
    if (result?.deviceId) {
      onSelectDevices([result.deviceId]);
    }
  }, [results, onSelectDevices]);

  const handleNext = () => goToResult(activeResultIdx + 1);
  const handlePrev = () => goToResult(activeResultIdx - 1);

  const handleReplace = useCallback(() => {
    const result = results[activeResultIdx];
    if (!result || !result.deviceId) return;

    const device = circuit?.devices.find(d => d.id === result.deviceId);
    if (!device) return;

    if (result.type === 'tag') {
      const newTag = caseSensitive
        ? device.tag.replace(searchText, replaceText)
        : device.tag.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceText);
      onUpdateDevice(device.id, { tag: newTag });
    } else if (result.type === 'function') {
      const fn = device.function || '';
      const newFn = caseSensitive
        ? fn.replace(searchText, replaceText)
        : fn.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceText);
      onUpdateDevice(device.id, { function: newFn });
    }

    setReplacedCount(c => c + 1);
    // Move to next result
    if (results.length > 1) {
      handleNext();
    }
  }, [results, activeResultIdx, circuit, searchText, replaceText, caseSensitive, onUpdateDevice, handleNext]);

  const handleReplaceAll = useCallback(() => {
    let count = 0;
    for (const result of results) {
      if (!result.deviceId) continue;
      const device = circuit?.devices.find(d => d.id === result.deviceId);
      if (!device) continue;

      if (result.type === 'tag') {
        const newTag = device.tag.replace(
          new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi'),
          replaceText
        );
        onUpdateDevice(device.id, { tag: newTag });
        count++;
      } else if (result.type === 'function') {
        const fn = device.function || '';
        const newFn = fn.replace(
          new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi'),
          replaceText
        );
        onUpdateDevice(device.id, { function: newFn });
        count++;
      }
    }
    setReplacedCount(c => c + count);
  }, [results, circuit, searchText, replaceText, caseSensitive, onUpdateDevice]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        handlePrev();
      } else if (showReplace && (e.ctrlKey || e.metaKey)) {
        handleReplace();
      } else {
        handleNext();
      }
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog find-replace-dialog"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{ width: '380px', maxHeight: '500px' }}
      >
        <div className="dialog-header">
          <h3>{showReplace ? 'Find & Replace' : 'Find'}</h3>
          <button className="dialog-close" onClick={onClose}>x</button>
        </div>

        <div className="dialog-body" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Search input */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={searchInputRef}
              className="property-input"
              style={{ flex: 1, width: 'auto', textAlign: 'left' }}
              placeholder="Search..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setActiveResultIdx(0); setReplacedCount(0); }}
            />
            <select
              className="property-input"
              style={{ width: '80px' }}
              value={searchField}
              onChange={e => setSearchField(e.target.value as SearchField)}
            >
              <option value="all">All</option>
              <option value="tag">Tags</option>
              <option value="function">Type</option>
            </select>
          </div>

          {/* Replace input */}
          {showReplace && (
            <input
              className="property-input"
              style={{ width: '100%', textAlign: 'left', boxSizing: 'border-box' }}
              placeholder="Replace with..."
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
            />
          )}

          {/* Options row */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
              Match case
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showReplace} onChange={e => setShowReplace(e.target.checked)} />
              Replace
            </label>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>
              {searchText ? `${results.length} found` : ''}
              {replacedCount > 0 ? ` · ${replacedCount} replaced` : ''}
            </span>
          </div>

          {/* Navigation + Replace buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="assign-part-btn"
              style={{ flex: 1, padding: '0.35rem' }}
              onClick={handlePrev}
              disabled={results.length === 0}
            >
              Prev
            </button>
            <button
              className="assign-part-btn"
              style={{ flex: 1, padding: '0.35rem' }}
              onClick={handleNext}
              disabled={results.length === 0}
            >
              Next
            </button>
            {showReplace && (
              <>
                <button
                  className="assign-part-btn"
                  style={{ flex: 1, padding: '0.35rem' }}
                  onClick={handleReplace}
                  disabled={results.length === 0 || !replaceText}
                >
                  Replace
                </button>
                <button
                  className="assign-part-btn"
                  style={{ flex: 1, padding: '0.35rem' }}
                  onClick={handleReplaceAll}
                  disabled={results.length === 0 || !replaceText}
                >
                  All
                </button>
              </>
            )}
          </div>

          {/* Results list */}
          {results.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', borderTop: '1px solid var(--fc-border-strong)', paddingTop: '0.5rem' }}>
              {results.map((r, idx) => (
                <div
                  key={`${r.type}-${r.deviceId}-${idx}`}
                  onClick={() => goToResult(idx)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    borderRadius: '3px',
                    background: idx === activeResultIdx ? 'var(--fc-accent)' : 'transparent',
                    color: idx === activeResultIdx ? '#fff' : 'var(--fc-text-primary)',
                    opacity: idx === activeResultIdx ? 1 : 0.7,
                  }}
                >
                  {r.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

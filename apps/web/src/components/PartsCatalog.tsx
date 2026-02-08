/**
 * Parts Catalog Dialog - browse and select manufacturer parts
 */

import { useState, useMemo } from 'react';
import { ALL_MANUFACTURER_PARTS, getManufacturers } from '@fusion-cad/core-model';
import type { Part } from '@fusion-cad/core-model';

type ManufacturerPart = Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>;

interface PartsCatalogProps {
  onClose: () => void;
  onSelectPart?: (part: ManufacturerPart) => void;
  onPlacePart?: (part: ManufacturerPart, symbolCategory: string) => void;
  filterCategory?: string;
}

type SortField = 'partNumber' | 'manufacturer' | 'description' | 'category' | 'voltage' | 'current';
type SortDir = 'asc' | 'desc';

export function PartsCatalog({ onClose, onSelectPart, onPlacePart, filterCategory }: PartsCatalogProps) {
  const [search, setSearch] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>(filterCategory || 'all');
  const [sortField, setSortField] = useState<SortField>('partNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const manufacturers = useMemo(() => getManufacturers(), []);

  // Get unique categories from the parts
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const part of ALL_MANUFACTURER_PARTS) {
      set.add(part.category);
    }
    return Array.from(set).sort();
  }, []);

  // Filter and sort parts
  const filteredParts = useMemo(() => {
    let parts = [...ALL_MANUFACTURER_PARTS];

    // Search filter
    if (search) {
      const lower = search.toLowerCase();
      parts = parts.filter(
        p =>
          p.partNumber.toLowerCase().includes(lower) ||
          p.description.toLowerCase().includes(lower) ||
          p.manufacturer.toLowerCase().includes(lower) ||
          p.category.toLowerCase().includes(lower)
      );
    }

    // Manufacturer filter
    if (manufacturerFilter !== 'all') {
      parts = parts.filter(p => p.manufacturer === manufacturerFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      parts = parts.filter(p => p.category === categoryFilter);
    }

    // Sort
    parts.sort((a, b) => {
      const aVal = (a[sortField] || '').toString().toLowerCase();
      const bVal = (b[sortField] || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return parts;
  }, [search, manufacturerFilter, categoryFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const handleSelect = (part: ManufacturerPart) => {
    if (onSelectPart) {
      onSelectPart(part);
    }
  };

  const handlePlacePart = (part: ManufacturerPart) => {
    if (onPlacePart) {
      // Use symbolCategory if available, otherwise fall back to category, or 'generic'
      const symbolCategory = part.symbolCategory || part.category || 'generic';
      onPlacePart(part, symbolCategory);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog parts-catalog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Parts Catalog</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="parts-filters">
          <input
            className="parts-search"
            type="text"
            placeholder="Search parts by name, number, or manufacturer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="parts-filter-row">
            <select
              className="parts-filter-select"
              value={manufacturerFilter}
              onChange={e => setManufacturerFilter(e.target.value)}
            >
              <option value="all">All Manufacturers</option>
              {manufacturers.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select
              className="parts-filter-select"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span className="parts-count">{filteredParts.length} parts</span>
          </div>
        </div>

        <div className="parts-table-container">
          <table className="parts-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('partNumber')}>
                  Part #{sortIndicator('partNumber')}
                </th>
                <th onClick={() => handleSort('manufacturer')}>
                  Manufacturer{sortIndicator('manufacturer')}
                </th>
                <th onClick={() => handleSort('description')}>
                  Description{sortIndicator('description')}
                </th>
                <th onClick={() => handleSort('category')}>
                  Category{sortIndicator('category')}
                </th>
                <th onClick={() => handleSort('voltage')}>
                  Voltage{sortIndicator('voltage')}
                </th>
                <th onClick={() => handleSort('current')}>
                  Current{sortIndicator('current')}
                </th>
                <th>Certs</th>
                {onSelectPart && <th></th>}
                {onPlacePart && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredParts.length === 0 ? (
                <tr>
                  <td colSpan={7 + (onSelectPart ? 1 : 0) + (onPlacePart ? 1 : 0)} className="parts-empty">
                    No parts match your search criteria
                  </td>
                </tr>
              ) : (
                filteredParts.map((part, idx) => (
                  <tr
                    key={`${part.manufacturer}-${part.partNumber}-${idx}`}
                    className="parts-row"
                    onClick={() => handleSelect(part)}
                  >
                    <td className="parts-cell-pn">{part.partNumber}</td>
                    <td>{part.manufacturer}</td>
                    <td className="parts-cell-desc">{part.description}</td>
                    <td className="parts-cell-cat">{part.category}</td>
                    <td>{part.voltage || '-'}</td>
                    <td>{part.current || '-'}</td>
                    <td className="parts-cell-certs">
                      {part.certifications?.join(', ') || '-'}
                    </td>
                    {onSelectPart && (
                      <td>
                        <button
                          className="parts-select-btn"
                          onClick={e => {
                            e.stopPropagation();
                            handleSelect(part);
                          }}
                        >
                          Select
                        </button>
                      </td>
                    )}
                    {onPlacePart && (
                      <td>
                        <button
                          className="parts-place-btn"
                          onClick={e => {
                            e.stopPropagation();
                            handlePlacePart(part);
                          }}
                        >
                          Place
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

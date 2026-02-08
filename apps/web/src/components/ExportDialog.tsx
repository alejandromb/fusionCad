/**
 * Export Dialog - choose format and export drawings
 */

import { useState } from 'react';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { Point, DeviceTransform } from '../renderer/types';
import { exportToSVG, downloadSVG } from '../export/svg-export';
import { exportToPDF } from '../export/pdf-export';

interface ExportDialogProps {
  circuit: CircuitData | null;
  positions: Map<string, Point>;
  deviceTransforms: Map<string, DeviceTransform>;
  activeSheetId?: string;
  projectName?: string;
  onClose: () => void;
}

export function ExportDialog({
  circuit,
  positions,
  deviceTransforms,
  activeSheetId,
  projectName = 'drawing',
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<'svg' | 'pdf'>('svg');
  const [printMode, setPrintMode] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!circuit) return;
    setExporting(true);

    try {
      const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      if (format === 'svg') {
        const svg = exportToSVG(circuit, positions, {
          printMode,
          deviceTransforms,
        });
        downloadSVG(svg, `${filename}.svg`);
      } else if (format === 'pdf') {
        await exportToPDF(circuit, positions, {
          deviceTransforms,
          title: projectName,
          activeSheetId,
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Export Drawing</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          <div className="export-option">
            <label>Format</label>
            <div className="export-format-buttons">
              <button
                className={`format-btn ${format === 'svg' ? 'active' : ''}`}
                onClick={() => setFormat('svg')}
              >
                SVG
              </button>
              <button
                className={`format-btn ${format === 'pdf' ? 'active' : ''}`}
                onClick={() => setFormat('pdf')}
              >
                PDF
              </button>
            </div>
          </div>

          {format === 'svg' && (
            <div className="export-option">
              <label>
                <input
                  type="checkbox"
                  checked={printMode}
                  onChange={(e) => setPrintMode(e.target.checked)}
                />
                Print mode (white background, black lines)
              </label>
            </div>
          )}

          <div className="export-info">
            {format === 'svg' && 'Vector format — infinitely scalable, editable in Inkscape/Illustrator'}
            {format === 'pdf' && 'PDF document — suitable for printing and sharing'}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={exporting || !circuit}
          >
            {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

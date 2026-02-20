/**
 * Reports dialog - modal with report generation buttons + CSV export
 */

import { useState } from 'react';
import type { CircuitData } from '../renderer/circuit-renderer';
import {
  generateWireList,
  wireListToCSV,
  generateBom,
  bomToCSV,
  generateTerminalPlan,
  terminalPlanToCSV,
  generateCableSchedule,
  cableScheduleToCSV,
} from '@fusion-cad/reports';
import type { BomReport } from '@fusion-cad/reports';

interface ReportsDialogProps {
  circuit: CircuitData | null;
  onClose: () => void;
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsDialog({ circuit, onClose }: ReportsDialogProps) {
  const [bomPreview, setBomPreview] = useState<BomReport | null>(null);

  if (!circuit) return null;

  const handleWireList = () => {
    const report = generateWireList(circuit.connections, circuit.nets);
    downloadCSV('wirelist.csv', wireListToCSV(report));
  };

  const handleBOM = () => {
    const report = generateBom(circuit.parts, circuit.devices, circuit.terminals || []);
    if (report.warnings.length > 0) {
      setBomPreview(report);
    } else {
      downloadCSV('bom.csv', bomToCSV(report));
    }
  };

  const handleBOMDownload = () => {
    if (bomPreview) {
      downloadCSV('bom.csv', bomToCSV(bomPreview));
      setBomPreview(null);
    }
  };

  const handleTerminalPlan = () => {
    const report = generateTerminalPlan(
      circuit.terminals || [],
      circuit.parts
    );
    downloadCSV('terminal-plan.csv', terminalPlanToCSV(report));
  };

  const handleCableSchedule = () => {
    const report = generateCableSchedule(circuit.connections, circuit.nets);
    downloadCSV('cable-schedule.csv', cableScheduleToCSV(report));
  };

  // BOM preview with warnings
  if (bomPreview) {
    return (
      <div className="reports-backdrop" onClick={() => setBomPreview(null)}>
        <div className="reports-dialog bom-preview-dialog" onClick={e => e.stopPropagation()}>
          <h2>Bill of Materials</h2>

          <div className="bom-warnings">
            <div className="bom-warnings-header">
              {bomPreview.warnings.length} device{bomPreview.warnings.length !== 1 ? 's' : ''} without real parts assigned
            </div>
            <ul className="bom-warnings-list">
              {bomPreview.warnings.map(w => (
                <li key={w.deviceTag}>
                  <strong>{w.deviceTag}</strong> — {w.deviceFunction}
                  <span className="bom-warning-badge">
                    {w.reason === 'unassigned' ? 'No part' : 'TBD'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {bomPreview.rows.length > 0 && (
            <div className="bom-preview-summary">
              {bomPreview.rows.length} assigned part{bomPreview.rows.length !== 1 ? 's' : ''} ({bomPreview.totalItems} total items)
            </div>
          )}

          <div className="bom-preview-actions">
            <button className="report-btn bom-download-btn" onClick={handleBOMDownload}>
              Download BOM CSV
            </button>
            <button className="reports-close" onClick={() => setBomPreview(null)}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-backdrop" onClick={onClose}>
      <div className="reports-dialog" onClick={e => e.stopPropagation()}>
        <h2>Reports</h2>
        <div className="reports-list">
          <button className="report-btn" onClick={handleBOM}>
            <span className="report-name">Bill of Materials</span>
            <span className="report-desc">Device list with parts and quantities</span>
          </button>
          <button className="report-btn" onClick={handleWireList}>
            <span className="report-name">Wire List</span>
            <span className="report-desc">All wire connections with numbers</span>
          </button>
          <button className="report-btn" onClick={handleTerminalPlan}>
            <span className="report-name">Terminal Plan</span>
            <span className="report-desc">Terminal block assignments and wiring</span>
          </button>
          <button className="report-btn" onClick={handleCableSchedule}>
            <span className="report-name">Cable Schedule</span>
            <span className="report-desc">Cables grouped by device pairs</span>
          </button>
        </div>
        <button className="reports-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/**
 * Reports dialog - modal with report generation buttons + CSV export
 */

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
  if (!circuit) return null;

  const handleWireList = () => {
    const report = generateWireList(circuit.connections, circuit.nets);
    downloadCSV('wirelist.csv', wireListToCSV(report));
  };

  const handleBOM = () => {
    const report = generateBom(circuit.parts, circuit.devices, circuit.terminals || []);
    downloadCSV('bom.csv', bomToCSV(report));
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

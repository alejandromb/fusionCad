/**
 * ERC Dialog - runs Electrical Rules Check and displays results
 */

import { useState, useMemo } from 'react';
import type { CircuitData } from '../renderer/circuit-renderer';
import { runERC, type ERCReport, type ERCSeverity, type ERCCircuitData } from '@fusion-cad/core-engine';

interface ERCDialogProps {
  circuit: CircuitData | null;
  onClose: () => void;
}

const SEVERITY_ORDER: Record<ERCSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<ERCSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function ERCDialog({ circuit, onClose }: ERCDialogProps) {
  const [report, setReport] = useState<ERCReport | null>(null);
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  const handleRunERC = () => {
    if (!circuit) return;

    const ercData: ERCCircuitData = {
      devices: circuit.devices,
      nets: circuit.nets,
      parts: circuit.parts,
      connections: circuit.connections.map(c => ({
        fromDevice: c.fromDevice,
        fromPin: c.fromPin,
        toDevice: c.toDevice,
        toPin: c.toPin,
        netId: c.netId,
        sheetId: c.sheetId,
      })),
    };

    setReport(runERC(ercData));
  };

  const filteredViolations = useMemo(() => {
    if (!report) return [];
    return report.violations
      .filter(v => {
        if (v.severity === 'error' && !showErrors) return false;
        if (v.severity === 'warning' && !showWarnings) return false;
        if (v.severity === 'info' && !showInfo) return false;
        return true;
      })
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [report, showErrors, showWarnings, showInfo]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog erc-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Electrical Rules Check</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          <div className="erc-run-section">
            <button
              className="erc-run-btn"
              onClick={handleRunERC}
              disabled={!circuit}
            >
              Run ERC
            </button>
            {report && (
              <span className="erc-timestamp">
                Last run: {new Date(report.checkedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {report && (
            <>
              <div className="erc-summary">
                <span className="erc-summary-item erc-summary-error">
                  {report.errorCount} error{report.errorCount !== 1 ? 's' : ''}
                </span>
                <span className="erc-summary-item erc-summary-warning">
                  {report.warningCount} warning{report.warningCount !== 1 ? 's' : ''}
                </span>
                <span className="erc-summary-item erc-summary-info">
                  {report.infoCount} info
                </span>
              </div>

              <div className="erc-filters">
                <label className={`erc-filter-btn ${showErrors ? 'active error' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showErrors}
                    onChange={e => setShowErrors(e.target.checked)}
                  />
                  Errors
                </label>
                <label className={`erc-filter-btn ${showWarnings ? 'active warning' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showWarnings}
                    onChange={e => setShowWarnings(e.target.checked)}
                  />
                  Warnings
                </label>
                <label className={`erc-filter-btn ${showInfo ? 'active info' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showInfo}
                    onChange={e => setShowInfo(e.target.checked)}
                  />
                  Info
                </label>
              </div>

              {filteredViolations.length === 0 ? (
                <div className="erc-empty">
                  {report.violations.length === 0
                    ? 'No violations found. Circuit passes all checks.'
                    : 'All violations filtered out.'}
                </div>
              ) : (
                <div className="erc-table-container">
                  <table className="erc-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Severity</th>
                        <th>Rule</th>
                        <th>Message</th>
                        <th>Devices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViolations.map(v => (
                        <tr key={v.id} className={`erc-row erc-row-${v.severity}`}>
                          <td className="erc-cell-id">{v.id}</td>
                          <td>
                            <span className={`erc-severity erc-severity-${v.severity}`}>
                              {SEVERITY_LABEL[v.severity]}
                            </span>
                          </td>
                          <td className="erc-cell-rule">{v.rule}</td>
                          <td className="erc-cell-message">{v.message}</td>
                          <td className="erc-cell-devices">
                            {v.deviceTags?.join(', ') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!report && (
            <div className="erc-empty">
              Click "Run ERC" to check the circuit for errors and warnings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

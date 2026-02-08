/**
 * Header component - project name, save status, project menu
 */

import type { ProjectSummary } from '../api/projects';
import type { CircuitData } from '../renderer/circuit-renderer';

interface HeaderProps {
  projectId: string | null;
  projectName: string;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  projectsList: ProjectSummary[];
  showProjectMenu: boolean;
  setShowProjectMenu: (show: boolean) => void;
  switchProject: (id: string) => Promise<void>;
  createNewProject: () => Promise<void>;
  deleteCurrentProject: () => Promise<void>;
  renameProject: () => Promise<void>;
  circuit: CircuitData | null;
  onOpenReports: () => void;
  onOpenExport?: () => void;
  onOpenSymbols?: () => void;
  onOpenParts?: () => void;
  onOpenERC?: () => void;
}

export function Header({
  projectId,
  projectName,
  saveStatus,
  projectsList,
  showProjectMenu,
  setShowProjectMenu,
  switchProject,
  createNewProject,
  deleteCurrentProject,
  renameProject,
  circuit,
  onOpenReports,
  onOpenExport,
  onOpenSymbols,
  onOpenParts,
  onOpenERC,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1>fusionCad</h1>
      </div>

      <div className="header-center">
        <div className="project-selector">
          <button
            className="project-button"
            onClick={() => setShowProjectMenu(!showProjectMenu)}
          >
            <span className="project-name">{projectName}</span>
            <span className="dropdown-arrow">&#9660;</span>
          </button>
          <span className={`save-status ${saveStatus}`}>
            {saveStatus === 'saved' && '\u2713'}
            {saveStatus === 'saving' && '\u25CF'}
            {saveStatus === 'unsaved' && '\u25CB'}
            {saveStatus === 'error' && '\u2717'}
          </span>

          {showProjectMenu && (
            <div className="project-menu">
              <div className="menu-section">
                <div className="menu-header">Projects</div>
                {projectsList.map(p => (
                  <button
                    key={p.id}
                    className={`menu-item ${p.id === projectId ? 'active' : ''}`}
                    onClick={() => switchProject(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <button className="menu-item" onClick={createNewProject}>
                + New Project
              </button>
              <button className="menu-item" onClick={renameProject}>
                Rename...
              </button>
              <button className="menu-item danger" onClick={deleteCurrentProject}>
                Delete Project
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="header-right">
        {circuit && onOpenSymbols && (
          <button className="reports-header-btn" onClick={onOpenSymbols}>
            Symbols
          </button>
        )}
        {circuit && onOpenParts && (
          <button className="reports-header-btn" onClick={onOpenParts}>
            Parts
          </button>
        )}
        {circuit && onOpenExport && (
          <button className="reports-header-btn" onClick={onOpenExport}>
            Export
          </button>
        )}
        {circuit && onOpenERC && (
          <button className="reports-header-btn" onClick={onOpenERC}>
            ERC
          </button>
        )}
        {circuit && (
          <button className="reports-header-btn" onClick={onOpenReports}>
            Reports
          </button>
        )}
        {circuit && (
          <span className="circuit-stats">
            {circuit.devices.length} devices &middot; {circuit.connections.length} wires
          </span>
        )}
      </div>
    </header>
  );
}

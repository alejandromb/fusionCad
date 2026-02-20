/**
 * Upgrade CTA — shown when free user hits project limit.
 */

interface UpgradeCTAProps {
  onClose: () => void;
  onContinueLocally: () => void;
}

export function UpgradeCTA({ onClose, onContinueLocally }: UpgradeCTAProps) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog upgrade-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Project Limit Reached</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          <p className="upgrade-message">
            Your free plan allows <strong>1 cloud project</strong>. Upgrade to Pro for unlimited cloud projects.
          </p>

          <div className="upgrade-actions">
            <button className="btn-primary upgrade-btn" disabled>
              Upgrade to Pro (coming soon)
            </button>
            <button className="btn-secondary" onClick={onContinueLocally}>
              Continue locally
            </button>
          </div>

          <p className="upgrade-note">
            Local projects are saved in your browser and work offline. They are not synced to the cloud.
          </p>
        </div>
      </div>
    </div>
  );
}

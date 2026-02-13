/**
 * AI Prompt Dialog - natural language circuit generation
 */

import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AIPromptDialogProps {
  projectId: string;
  onClose: () => void;
  onGenerated: () => void;
}

const EXAMPLE_PROMPTS = [
  'Motor starter for a 30 HP motor at 208V with HOA switch, pilot light, and PLC remote contact',
  '10 HP 480V motor starter with emergency stop and running indicator',
  '5 HP single phase 240V motor, NEMA enclosed starter, manual start stop only',
];

export function AIPromptDialog({ projectId, onClose, onGenerated }: AIPromptDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/ai-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Generation failed');
        setLoading(false);
        return;
      }

      setSummary(data.summary);
      // Trigger project reload after short delay
      setTimeout(() => {
        onGenerated();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog ai-prompt-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>AI Circuit Generator</h2>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-body">
          <p className="ai-prompt-description">
            Describe your motor control panel requirements in plain English.
            The AI will generate the complete schematic with power circuit,
            control ladder, and real Schneider Electric parts.
          </p>

          <textarea
            className="ai-prompt-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g., I need a motor starter panel for a 30 HP motor at 208V with an HOA switch, pilot light, and PLC remote contact..."
            rows={4}
            disabled={loading}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleGenerate();
              }
            }}
          />

          <div className="ai-prompt-examples">
            <span className="ai-prompt-examples-label">Examples:</span>
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                className="ai-prompt-example"
                onClick={() => setPrompt(ex)}
                disabled={loading}
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div className="ai-prompt-error">{error}</div>
          )}

          {summary && (
            <div className="ai-prompt-success">
              <strong>Generated successfully!</strong>
              <pre>{summary}</pre>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

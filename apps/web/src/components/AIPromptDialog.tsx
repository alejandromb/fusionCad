/**
 * AI Prompt Dialog - natural language circuit generation
 */

import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const ANON_ID_KEY = 'fusionCad_anonId';

/** Get or create a persistent anonymous ID for rate limiting */
function getAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

interface AiQuota {
  used: number;
  limit: number;  // -1 = unlimited
  remaining: number;
}

interface AIPromptDialogProps {
  projectId: string;
  onClose: () => void;
  onGenerated: () => void;
  getAccessToken?: () => Promise<string | null>;
  initialQuota?: AiQuota | null;
}

const EXAMPLE_PROMPTS = [
  'Motor starter for a 30 HP motor at 208V with HOA switch, pilot light, and PLC remote contact',
  '10 HP 480V motor starter with emergency stop and running indicator',
  'Power distribution for a CompactLogix PLC with 24VDC supply, surge protection, and cabinet light',
];

export function AIPromptDialog({ projectId, onClose, onGenerated, getAccessToken, initialQuota }: AIPromptDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [quota, setQuota] = useState<AiQuota | null>(initialQuota ?? null);

  const isLimitReached = quota && quota.limit > 0 && quota.remaining <= 0;

  const handleGenerate = async () => {
    if (!prompt.trim() || isLimitReached) return;
    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Authenticated user: send Bearer token
      if (getAccessToken) {
        const token = await getAccessToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      // Always send anonymous ID as fallback for rate limiting
      headers['x-anon-id'] = getAnonId();

      const response = await fetch(`${API_BASE}/api/projects/${projectId}/ai-generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (response.status === 429) {
        setQuota({ used: data.used ?? 0, limit: data.limit ?? 1, remaining: 0 });
        setError(data.message || 'AI generation limit reached. Sign up for more.');
        setLoading(false);
        return;
      }

      if (!response.ok || !data.success) {
        setError(data.error || 'Generation failed');
        setLoading(false);
        return;
      }

      // Update quota from response
      if (data.aiQuota) {
        setQuota(data.aiQuota);
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
            Describe your electrical control or power circuit requirements in plain English.
            The AI will generate the complete schematic with proper layout and wiring.
            Supports motor starters, power distribution, PLC power supplies, and more.
          </p>

          {quota && quota.limit > 0 && (
            <div className={`ai-quota-bar ${isLimitReached ? 'ai-quota-exhausted' : ''}`}>
              {isLimitReached
                ? `Daily limit reached (${quota.used}/${quota.limit}). Sign up for more generations.`
                : `${quota.used} of ${quota.limit} AI generations used today`}
            </div>
          )}

          <textarea
            className="ai-prompt-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g., 30 HP motor starter at 208V with HOA switch, or power distribution with 24VDC supply for a CompactLogix PLC..."
            rows={4}
            disabled={loading || !!isLimitReached}
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
                disabled={loading || !!isLimitReached}
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
            disabled={loading || !prompt.trim() || !!isLimitReached}
          >
            {loading ? 'Generating...' : isLimitReached ? 'Limit Reached' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

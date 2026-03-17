/**
 * AIChatPanel - Persistent AI assistant chat in the right sidebar.
 *
 * Context-aware: knows the current circuit state and can help with
 * drawing, symbol creation, part selection, and general questions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { CircuitData } from '../renderer/circuit-renderer';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AIChatPanelProps {
  circuit: CircuitData | null;
  projectName: string;
  projectId: string | null;
  onProjectChanged: () => void;
}

const CHAT_HISTORY_KEY = 'fusionCad_aiChatHistory';

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveHistory(messages: Message[]): void {
  // Keep last 50 messages to avoid bloating localStorage
  const trimmed = messages.slice(-50);
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
}

function buildCircuitContext(circuit: CircuitData | null, projectName: string): string {
  if (!circuit) return 'No circuit loaded.';

  const deviceSummary = circuit.devices.length > 0
    ? circuit.devices.slice(0, 20).map(d => `${d.tag} (${d.function || 'no desc'})`).join(', ')
    : 'none';

  const truncated = circuit.devices.length > 20 ? ` ...and ${circuit.devices.length - 20} more` : '';

  return `Project: "${projectName}"
Devices (${circuit.devices.length}): ${deviceSummary}${truncated}
Wires: ${circuit.connections.length}
Sheets: ${circuit.sheets?.length || 1}
Blocks: ${circuit.blocks?.length || 0}`;
}

export function AIChatPanel({ circuit, projectName, projectId, onProjectChanged }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save history when messages change
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages);
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = buildCircuitContext(circuit, projectName);

      const resp = await fetch(`${API_BASE}/api/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          projectId,
          circuitContext: context,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await resp.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply || data.error || 'No response received.',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);

      // If the AI modified the circuit, reload the project
      if (data.actionsPerformed && data.actionsPerformed > 0) {
        onProjectChanged();
      }
    } catch (err: any) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Connection error: ${err.message}. Make sure the API is running.`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, circuit, projectName, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
  };

  return (
    <div className="ai-chat-panel">
      {/* Messages area */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-icon">AI</div>
            <p>Ask me anything about your drawing, symbols, parts, or electrical design.</p>
            <div className="ai-chat-suggestions">
              <button onClick={() => setInput('What symbols do I need for a PLC relay interlock circuit?')}>
                PLC relay interlock symbols?
              </button>
              <button onClick={() => setInput('How should I wire the sequential startup for 16 machines?')}>
                Sequential startup wiring?
              </button>
              <button onClick={() => setInput('What Allen-Bradley parts do I need for a Micro850 project?')}>
                Micro850 parts list?
              </button>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
            <div className="ai-chat-msg-header">
              <span className="ai-chat-msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
            </div>
            <div className="ai-chat-msg-content">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-chat-msg ai-chat-msg-assistant">
            <div className="ai-chat-msg-header">
              <span className="ai-chat-msg-role">AI</span>
            </div>
            <div className="ai-chat-msg-content ai-chat-typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="ai-chat-input-area">
        {messages.length > 0 && (
          <button className="ai-chat-clear" onClick={handleClear} title="Clear chat history">
            Clear
          </button>
        )}
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your drawing..."
          rows={2}
          disabled={loading}
        />
        <button
          className="ai-chat-send"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

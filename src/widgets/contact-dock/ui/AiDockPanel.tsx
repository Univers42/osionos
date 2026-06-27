/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiDockPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pinned AI chat tab for the dock. Streams from the default agent endpoint
 * (/api/agent/chat) via useAgentStream; each run appends a user message then
 * grows the assistant reply from `delta` events. Accent left-border marks it
 * as the AI surface. Reduced-motion friendly (no spinners beyond opacity).
 */

import React, { useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';

import { useAgentStream, type StreamPayload } from '@/shared/agent/useAgentStream';
import { IconButton } from '@/shared/ui';

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
}

interface AiDockPanelProps {
  onClose: () => void;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const AiDockPanel: React.FC<AiDockPanelProps> = ({ onClose }) => {
  const { send, streaming } = useAgentStream();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const patch = (id: string, body: string) =>
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, body } : m)));

  async function run() {
    const prompt = draft.trim();
    if (!prompt || streaming) return;
    setDraft('');
    setError(null);
    const reply: AiMessage = { id: newId('a'), role: 'assistant', body: '' };
    setMessages((cur) => [...cur, { id: newId('u'), role: 'user', body: prompt }, reply]);
    const text = { value: '' };
    try {
      await send({ prompt }, (event: string, data: StreamPayload) => {
        if (event === 'delta') patch(reply.id, (text.value += data.text ?? ''));
        if (event === 'result' && !text.value.trim()) patch(reply.id, (text.value = data.text ?? ''));
        if (event === 'error') setError(data.message ?? 'Assistant failed.');
        endRef.current?.scrollIntoView({ block: 'end' });
      });
      if (!text.value.trim()) patch(reply.id, 'No response.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant is unavailable.');
    }
  }

  return (
    <section
      className="pointer-events-auto flex h-[26rem] w-[19rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-lg border border-l-2 border-[var(--osio-border-default)] border-l-[var(--osio-accent)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]"
      aria-label="AI assistant"
    >
      <header className="flex min-h-11 shrink-0 items-center gap-[var(--osio-space-2)] border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-[var(--osio-space-3)]">
        <Sparkles size={16} className="text-[var(--osio-accent)]" aria-hidden="true" />
        <span className="flex-1 truncate text-sm font-semibold text-[var(--osio-fg-default)]">Assistant</span>
        <IconButton size="sm" aria-label="Close assistant" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </IconButton>
      </header>

      <div className="flex-1 space-y-[var(--osio-space-2)] overflow-y-auto px-[var(--osio-space-3)] py-[var(--osio-space-3)]">
        {messages.length === 0 && !error && (
          <p className="text-sm text-[var(--osio-fg-muted)]">Ask the assistant anything.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-md px-[var(--osio-space-3)] py-[var(--osio-space-2)] text-sm ${
              m.role === 'user'
                ? 'ml-auto bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]'
                : 'bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]'
            }`}
          >
            {m.body || <span className="text-[var(--osio-fg-muted)]">…</span>}
          </div>
        ))}
        {error && <p className="text-sm text-[var(--osio-danger)]">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        className="flex items-end gap-[var(--osio-space-2)] border-t border-[var(--osio-border-default)] p-[var(--osio-space-2)]"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void run(); }
          }}
          rows={1}
          placeholder="Message the assistant"
          aria-label="Message the assistant"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-[var(--osio-space-2)] py-[var(--osio-space-2)] text-sm outline-none focus:border-[var(--osio-accent)] placeholder:text-[var(--osio-fg-subtle)]"
        />
        <button
          type="submit"
          disabled={streaming || !draft.trim()}
          aria-label="Send to assistant"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity duration-150 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
};

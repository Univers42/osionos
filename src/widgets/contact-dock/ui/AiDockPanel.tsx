/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiDockPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pinned AI chat tab for the dock.
 *
 * The tab answers through the SAME inference port as the Assistant pane — one
 * AI path (see aiDockModel.ts). It used to speak to the retired claude-CLI
 * route, which no deployed config enables. With no AI service configured the
 * tab is not shown at all: no dead tab, no error.
 *
 * The answer is markdown, rendered by the engine the app already has, with no
 * raw HTML and no remote images.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';

import { isAiConfigured } from '@/features/ai/api/aiClient';
import { PLATFORM_CONNECTION_ID, readAiSelection } from '@/features/ai/model/aiSelection';
import { withAccountContext } from '@/features/ai/model/viewContext';
import { useUserStore } from '@/features/auth';
import { ANSWER_TABLE_CLASS, renderAssistantMarkdown } from '@/features/chat/model/assistantMarkdown';
import { IconButton } from '@/shared/ui';
import { errorWords } from '@/widgets/chat-shell/ui/errorWords';

import { aiDockPort, aiDockTabVisible, runAiDockTurn } from '../model/aiDockModel';

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

/** The assistant's answer, as markdown. */
const DockAnswer: React.FC<{ body: string }> = ({ body }) => {
  const elements = useMemo(() => renderAssistantMarkdown(body), [body]);
  return (
    <div className={`${ANSWER_TABLE_CLASS} [&_a]:text-[var(--osio-accent)] [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xs [&_pre]:bg-[var(--osio-bg-muted)] [&_pre]:p-1.5 [&_pre]:font-mono [&_pre]:text-2xs [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4`}>
      {elements}
    </div>
  );
};

export const AiDockPanel: React.FC<AiDockPanelProps> = ({ onClose }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // The local conversation, and the server-side one it is mapped to.
  const conversationId = useRef(`dock-${crypto.randomUUID()}`);
  const serverConversationId = useRef<string | undefined>(undefined);
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id);

  const patch = (id: string, body: string) =>
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, body } : m)));

  async function run() {
    const prompt = draft.trim();
    if (!prompt || streaming) return;
    setDraft('');
    setError(null);
    setStreaming(true);
    const reply: AiMessage = { id: newId('a'), role: 'assistant', body: '' };
    setMessages((cur) => [...cur, { id: newId('u'), role: 'user', body: prompt }, reply]);
    const text = { value: '' };
    // The choice the user made in the Assistant: the same connection and model.
    const selection = readAiSelection();
    const dockContext = withAccountContext(undefined);
    try {
      await runAiDockTurn({
        port: aiDockPort(),
        conversationId: conversationId.current,
        text: prompt,
        connectionId: selection?.connectionId ?? PLATFORM_CONNECTION_ID,
        ...(selection?.model ? { model: selection.model } : {}),
        ...(serverConversationId.current ? { serverConversationId: serverConversationId.current } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(dockContext ? { context: dockContext } : {}),
        onServerConversationId: (id) => { serverConversationId.current = id; },
        onDelta: (chunk) => {
          text.value += chunk;
          patch(reply.id, text.value);
          endRef.current?.scrollIntoView({ block: 'end' });
        },
        onError: (code) => setError(errorWords(code)),
      });
      if (!text.value.trim()) patch(reply.id, 'No response.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant is unavailable.');
    } finally {
      setStreaming(false);
    }
  }

  // No AI service: no tab. The dock's AI is one service's answer, not a
  // second route that answers on its own.
  if (!aiDockTabVisible(isAiConfigured())) return null;

  return (
    <section
      className="pointer-events-auto flex h-[26rem] w-[19rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-lg border border-l-2 border-[var(--osio-border-default)] border-l-[var(--osio-accent)] bg-[var(--osio-bg-elevated)] shadow-[var(--osio-shadow-menu)]"
      aria-label="AI assistant"
    >
      <header className="flex min-h-11 shrink-0 items-center gap-[var(--osio-space-2)] border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-[var(--osio-space-3)]">
        <Sparkles size={16} className="text-[var(--osio-accent)]" aria-hidden="true" />
        <span className="flex-1 truncate text-sm font-semibold text-[var(--osio-fg-default)]">Assistant</span>
        <IconButton size="sm" label="Close assistant" onClick={onClose}>
          <X size={16} aria-hidden="true" />
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
                ? 'ml-auto whitespace-pre-wrap bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]'
                : 'bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]'
            }`}
          >
            {m.role === 'assistant' ? (
              m.body ? (
                <DockAnswer body={m.body} />
              ) : (
                <span className="text-[var(--osio-fg-muted)]">…</span>
              )
            ) : (
              m.body
            )}
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
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity duration-(--osio-dur-fast) ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentComposer.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import { Loader2, Send, TerminalSquare } from "lucide-react";

interface AgentComposerProps {
  draft: string;
  running: boolean;
  onDraftChange: (value: string) => void;
  onSend: (prompt: string) => void;
}

/** The message box: Cmd/Ctrl+Enter or the button sends. */
export const AgentComposer: React.FC<AgentComposerProps> = ({ draft, running, onDraftChange, onSend }) => (
  <form onSubmit={(event) => { event.preventDefault(); onSend(draft); }} className="border-t border-[var(--osio-border-default)] p-4">
    <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-2 focus-within:border-[var(--osio-accent)]">
      <span className="mb-2 ml-1 hidden text-[var(--osio-fg-subtle)] sm:inline-flex"><TerminalSquare size={16} aria-hidden="true" /></span>
      <textarea name="message-claude-mcp"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSend(draft);
          }
        }}
        rows={2}
        placeholder="Message Claude MCP"
        className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      <button type="submit" disabled={running || !draft.trim()} className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
        {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
      </button>
    </div>
  </form>
);

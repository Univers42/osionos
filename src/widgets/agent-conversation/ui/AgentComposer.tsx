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
import { ArrowUp, Loader2 } from "lucide-react";

import { COMPOSER_SEND_CLASS, ComposerCard } from "@/shared/ui/composer/ComposerCard";

import { DEFAULT_PROMPT } from "../model/agentOptions";

interface AgentComposerProps {
  draft: string;
  running: boolean;
  onDraftChange: (value: string) => void;
  onSend: (prompt: string) => void;
}

/**
 * The message box. Enter sends, Shift+Enter makes a new line, and Enter while an
 * input method is composing (IME) is left to the method.
 */
export const AgentComposer: React.FC<AgentComposerProps> = ({ draft, running, onDraftChange, onSend }) => (
  <form onSubmit={(event) => { event.preventDefault(); onSend(draft); }} className="px-4 pb-4 pt-2">
    <ComposerCard className="mx-auto flex max-w-3xl items-end gap-2 p-2">
      <textarea name="message-claude-mcp"
        aria-label="Message Claude"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onSend(draft);
        }}
        rows={2}
        placeholder={DEFAULT_PROMPT}
        className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      <button type="submit" disabled={running || !draft.trim()} className={`${COMPOSER_SEND_CLASS} h-8 w-8`} aria-label="Send message">
        {running ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
      </button>
    </ComposerCard>
  </form>
);

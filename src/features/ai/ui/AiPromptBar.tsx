/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiPromptBar.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * Notion's "Edit with AI" bar: one line the width of the text column, the AI
 * mark on the left and a round send arrow on the right. Enter sends too.
 */

import React from "react";
import { ArrowUp, Sparkles } from "lucide-react";

interface AiPromptBarProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const AiPromptBar: React.FC<AiPromptBarProps> = ({ inputRef, value, busy, onChange, onSubmit }) => {
  const canSend = !busy && value.trim().length > 0;
  return (
    <div className="flex h-12 items-center gap-3 px-3">
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
      >
        <Sparkles size={14} />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (canSend) onSubmit();
        }}
        placeholder="Edit with AI"
        aria-label="Ask AI anything"
        className="min-w-0 flex-1 bg-transparent text-base text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSend}
        title="Send"
        aria-label="Send"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--osio-fg-muted)] text-[var(--osio-bg-surface)] transition-opacity enabled:hover:bg-[var(--osio-fg-default)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        <ArrowUp size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
};

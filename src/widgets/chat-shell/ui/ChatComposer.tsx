/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ChatComposer.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import { ArrowUp, Plug } from "lucide-react";

import { ModelPicker } from "./ModelPicker";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Opens the "connect a provider" flow (the composer's + affordance). */
  onConnect: () => void;
  model: string;
  onModelChange: (value: string) => void;
  autoFocus?: boolean;
}

/** Controlled composer (parent owns the text so it survives a connect prompt). */
export const ChatComposer: React.FC<Props> = ({ value, onChange, onSubmit, onConnect, model, onModelChange, autoFocus }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; };
  useEffect(() => { if (ref.current) grow(ref.current); }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div className="rounded-2xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-shadow-sm)] focus-within:border-[var(--osio-accent)]">
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Do anything with AI…"
        aria-label="Message the assistant"
        className="block w-full resize-none bg-transparent px-4 pt-3 text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
      />
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <button
          type="button"
          onClick={onConnect}
          aria-label="Connect a provider"
          title="Connect a provider (Claude, …)"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Plug size={15} /> Connect
        </button>
        <ModelPicker value={model} onChange={onModelChange} />
        <button
          type="button"
          aria-label="Send message"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="ml-auto rounded-full bg-[var(--osio-accent)] p-2 text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] disabled:opacity-40"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
};

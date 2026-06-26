/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmptyStateHero.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { AppMark } from "./AppMark";
import { ChatComposer } from "./ChatComposer";
import { ConnectorsStrip } from "./ConnectorsStrip";

const SUGGESTIONS = ["Write a meeting agenda", "Summarize my notes", "Draft an email", "Brainstorm ideas"];

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onConnect: () => void;
  onPick: (text: string) => void;
  model: string;
  onModelChange: (value: string) => void;
}

/** The launcher empty state (per ai_prompt_chat.png): mark + heading + composer + connectors + cards. */
export const EmptyStateHero: React.FC<Props> = ({ value, onChange, onSubmit, onConnect, onPick, model, onModelChange }) => (
  <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
    <AppMark size={56} />
    <h1 className="text-2xl font-semibold tracking-tight text-[var(--osio-fg-default)]">How can I help you today?</h1>
    <div className="w-full">
      <ChatComposer
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onConnect={onConnect}
        model={model}
        onModelChange={onModelChange}
        autoFocus
      />
    </div>
    <ConnectorsStrip />
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-3 text-left text-xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);

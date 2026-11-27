/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentHeader.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import { Bot, FilePlus2, RotateCcw } from "lucide-react";

interface AgentHeaderProps {
  title: string;
  subtitle: string;
  canOpenCreatedPage: boolean;
  onOpenCreatedPage: () => void;
  onReset: () => void;
}

/** The page title, what the conversation holds, and its two actions. */
export const AgentHeader: React.FC<AgentHeaderProps> = ({ title, subtitle, canOpenCreatedPage, onOpenCreatedPage, onReset }) => (
  <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--osio-border-default)] px-5">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent-subtle)] text-[var(--osio-accent)]">
        <Bot size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <p className="truncate text-xs text-[var(--osio-fg-muted)]">{subtitle}</p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {canOpenCreatedPage ? (
        <button type="button" onClick={onOpenCreatedPage} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-3 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          <FilePlus2 size={14} aria-hidden="true" />
          Open page
        </button>
      ) : null}
      <button type="button" onClick={onReset} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--osio-border-default)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" aria-label="Reset conversation" title="Reset conversation">
        <RotateCcw size={16} aria-hidden="true" />
      </button>
    </div>
  </header>
);

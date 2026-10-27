/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ThemeEditorToolbar.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

interface ThemeEditorToolbarProps {
  name: string;
  problemCount: number;
  restored: boolean;
  shipped: boolean;
  onSave: () => void;
  onRevert: () => void;
}

export const ThemeEditorToolbar: React.FC<ThemeEditorToolbarProps> = ({ name, problemCount, restored, shipped, onSave, onRevert }) => {
  const problemLabel = problemCount === 0 ? "No problems" : problemCount === 1 ? "1 problem" : `${problemCount} problems`;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
      <span className="text-sm font-medium text-[var(--osio-fg-default)]">{name}</span>
      <span className="text-xs text-[var(--osio-fg-muted)]">{problemLabel}</span>
      {shipped && <span className="rounded-md bg-[var(--osio-bg-surface)] px-2 py-0.5 text-xs text-[var(--osio-fg-muted)]">Built-in theme. Saving makes your own copy.</span>}
      {restored && <span className="rounded-md bg-[var(--osio-bg-surface)] px-2 py-0.5 text-xs text-[var(--osio-fg-muted)]">Draft restored</span>}
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onRevert} className="rounded-md border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-default)]">Revert</button>
        <button type="button" onClick={onSave} className="rounded-md bg-[var(--osio-accent)] px-2 py-1 text-xs text-[var(--osio-accent-fg)]">Save</button>
      </div>
    </div>
  );
};

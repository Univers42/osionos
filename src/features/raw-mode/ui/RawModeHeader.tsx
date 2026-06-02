/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RawModeHeader.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Code2, Columns2, Eye, GripVertical, Save, X } from "lucide-react";
import type { RawLayoutMode } from "../model/rawModeLayout";

interface RawModeHeaderProps {
  title: string;
  mode: RawLayoutMode;
  dirty: boolean;
  showLineNumbers: boolean;
  onMode: (mode: RawLayoutMode) => void;
  onToggleLineNumbers: () => void;
  onSave: () => void;
  onExit: () => void;
  onDragStart: (event: React.PointerEvent) => void;
}

const TABS: ReadonlyArray<{ mode: RawLayoutMode; label: string; Icon: typeof Code2 }> = [
  { mode: "code", label: "Code", Icon: Code2 },
  { mode: "split", label: "Split", Icon: Columns2 },
  { mode: "preview", label: "Preview", Icon: Eye },
];

/** VSCode-style title/tab bar; the grip is draggable to slide & split panes. */
export function RawModeHeader({ title, mode, dirty, showLineNumbers, onMode, onToggleLineNumbers, onSave, onExit, onDragStart }: Readonly<RawModeHeaderProps>) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm select-none">
      <button type="button" onPointerDown={onDragStart} title="Drag to split / reorganize the panes" className="flex cursor-grab items-center gap-1 rounded px-1.5 py-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)] active:cursor-grabbing">
        <GripVertical size={14} />
        <span className="max-w-40 truncate text-[var(--osio-fg-default)]">{title || "Untitled"}.md</span>
        {dirty && <span className="text-[var(--osio-accent)]">●</span>}
      </button>
      <div className="ml-1 flex items-center rounded-md border border-[var(--osio-border-default)] p-0.5">
        {TABS.map(({ mode: tab, label, Icon }) => (
          <button key={tab} type="button" onClick={() => onMode(tab)} aria-pressed={mode === tab} title={label} className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${mode === tab ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onToggleLineNumbers} aria-pressed={showLineNumbers} title="Toggle line numbers" className={`rounded px-2 py-0.5 text-xs ${showLineNumbers ? "text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]"} hover:bg-[var(--osio-bg-subtle)]`}>#</button>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={onSave} className="flex items-center gap-1 rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg,#fff)] hover:opacity-90"><Save size={13} /> Save</button>
        <button type="button" onClick={onExit} title="Exit raw mode" className="flex items-center rounded-md px-1.5 py-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]"><X size={15} /></button>
      </div>
    </div>
  );
}

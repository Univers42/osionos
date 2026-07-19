/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeStatusBar.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { GitBranch, SquareTerminal } from "lucide-react";

interface Props {
  fileCount: number;
  onToggleTerminal: () => void;
}

/** The bottom status bar spanning the shell — mode, project size, and a terminal
 *  toggle. Branch / language / diagnostics slots fill as later phases land. */
export const IdeStatusBar: React.FC<Props> = ({ fileCount, onToggleTerminal }) => {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 font-mono text-[11px] text-[var(--osio-code-fg-muted)]">
      <span className="inline-flex items-center gap-1 text-[var(--osio-accent)]">IDE</span>
      <button
        type="button"
        onClick={onToggleTerminal}
        title="Toggle terminal"
        className="inline-flex items-center gap-1 hover:text-[var(--osio-code-fg)]"
      >
        <SquareTerminal size={12} /> Terminal
      </button>
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1 opacity-70" title="Git status arrives with the sandbox">
        <GitBranch size={12} /> —
      </span>
      <span>{fileCount} {fileCount === 1 ? "file" : "files"}</span>
      <span>UTF-8</span>
    </footer>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeSidePanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { IdePanel } from "@/features/ide/model/ideModeStore";
import { IdeFileTree } from "@/features/ide/ui/IdeFileTree";

const TITLES: Record<IdePanel, string> = {
  explorer: "Explorer",
  search: "Search",
  scm: "Source Control",
  run: "Run",
  problems: "Problems",
};

/** The resizable left panel body — its content follows the active activity-bar
 *  panel. P0 wires the Explorer (read-only file tree); Search/SCM/Run/Problems
 *  are placeholders that later phases (P1/P5/P6) fill in place. */
export const IdeSidePanel: React.FC<{ panel: IdePanel }> = ({ panel }) => {
  return (
    <aside
      aria-label={TITLES[panel]}
      className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]"
    >
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        {TITLES[panel]}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {panel === "explorer" ? (
          <IdeFileTree />
        ) : (
          <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
            {panel === "search" && "Global search arrives in the next step."}
            {panel === "scm" && "Source control arrives with the sandbox + git."}
            {panel === "run" && "Run and debug arrives with the sandbox shell."}
            {panel === "problems" && "Diagnostics arrive with the language servers."}
          </p>
        )}
      </div>
    </aside>
  );
};

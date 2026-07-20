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
import { IdeExplorerPanel } from "@/features/ide/ui/IdeExplorerPanel";
import { IdeSearchPanel } from "@/features/ide/ui/IdeSearchPanel";
import { IdeSourceControl } from "@/features/ide/ui/IdeSourceControl";
import { IdeProblemsPanel } from "@/features/ide/ui/IdeProblemsPanel";
import { IdeRunPanel } from "@/features/ide/ui/IdeRunPanel";

const TITLES: Record<IdePanel, string> = {
  explorer: "Explorer",
  search: "Search",
  scm: "Source Control",
  run: "Run",
  problems: "Problems",
};

/** The resizable left panel body — its content follows the active activity-bar
 *  panel. Explorer/Search/SCM/Run/Problems are all live (Run streams the code
 *  runner; full DAP debugging lands with the sandbox shell). The Explorer owns
 *  its own header (project name + toolbar), so it renders without the shared title. */
export const IdeSidePanel: React.FC<{ panel: IdePanel }> = ({ panel }) => {
  if (panel === "explorer") {
    return (
      <aside aria-label="Explorer" className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]">
        <IdeExplorerPanel />
      </aside>
    );
  }

  return (
    <aside
      aria-label={TITLES[panel]}
      className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]"
    >
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        {TITLES[panel]}
      </div>
      {panel === "search" ? (
        <IdeSearchPanel />
      ) : panel === "scm" ? (
        <IdeSourceControl />
      ) : panel === "problems" ? (
        <IdeProblemsPanel />
      ) : panel === "run" ? (
        <IdeRunPanel />
      ) : (
        <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
          {TITLES[panel]} is not available yet.
        </p>
      )}
    </aside>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerViewSwitch.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Segmented toggle at the top of the Explorer panel: present the workspace as the
 * file TREE or the folders GALLERY. Picking "Gallery" swaps THIS sidebar's body to
 * the folder list (FilesPanel reads useExplorerView) AND opens the cover-card
 * gallery in the editor area — one sidebar, no redundant second rail.
 */

import React from "react";
import { LayoutGrid, List } from "lucide-react";

import { useHomeVariantStore } from "@/widgets/home-variants/model/homeVariantStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { homeTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useExplorerView, type ExplorerView } from "../../model/explorerView";

const BTN = "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-[120ms]";

export const ExplorerViewSwitch: React.FC = () => {
  const view = useExplorerView((s) => s.view);
  const setView = useExplorerView((s) => s.setView);

  const select = (next: ExplorerView) => {
    setView(next);
    if (next === "gallery") {
      // Show the cover-card gallery in the editor area. The folder rail lives in
      // THIS panel now, so the home gallery body is cards only; openTab dedups on
      // the Home tab id, focusing the existing Home tab.
      useHomeVariantStore.getState().setVariant("workspace");
      const layout = useWorkspaceLayout.getState();
      layout.openTab(homeTab(), layout.activePaneId);
    }
  };

  const tab = (id: ExplorerView, Icon: typeof List, label: string) => (
    <button
      type="button"
      aria-pressed={view === id}
      onClick={() => select(id)}
      className={`${BTN} ${
        view === id
          ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
          : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      }`}
    >
      <Icon size={13} aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div className="mx-2 mt-2 flex items-center gap-1 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1">
      {tab("tree", List, "Tree")}
      {tab("gallery", LayoutGrid, "Gallery")}
    </div>
  );
};

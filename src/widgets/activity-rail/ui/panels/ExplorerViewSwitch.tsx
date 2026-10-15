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
 * the folder list (ExplorerPanel reads useExplorerView) AND opens the cover-card
 * gallery in the editor area — one sidebar, no redundant second rail.
 */

import React from "react";
import { LayoutGrid, List } from "lucide-react";

import { useHomeVariantStore } from "@/widgets/home-variants/model/homeVariantStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { homeTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useExplorerView, type ExplorerView } from "../../model/explorerView";

// The MiniTabs segmented look (track, raised selected segment), kept as toggle buttons:
// the two views are a pressed state, not tabs of one panel.
const BTN = "flex h-[var(--osio-control-h-sm)] flex-1 items-center justify-center gap-1.5 rounded-[var(--osio-radius-control)] px-2 text-xs font-medium transition-[color,background-color,box-shadow] duration-(--osio-dur-fast) ease-[var(--osio-ease-standard)]";

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
          ? "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] shadow-[var(--osio-e1)]"
          : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      }`}
    >
      <Icon size={12} aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div className="mx-2 mt-2 flex items-center gap-1 rounded-[var(--osio-radius-panel)] bg-[var(--osio-bg-subtle)] p-1">
      {tab("tree", List, "Tree")}
      {tab("gallery", LayoutGrid, "Gallery")}
    </div>
  );
};

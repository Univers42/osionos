/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { Pin } from "lucide-react";
import { WorkspaceSwitcher } from "@/features/auth";
import { IconButton } from "@/shared/ui";
import { useUIStore, type ActivePanel } from "@/shared/config/uiStore";
import { FilesPanel } from "./panels/FilesPanel";
import { PANEL_LOADERS, prefetchPanel } from "./panelLoaders";

// Only the Explorer loads eagerly; every other panel is a lazy chunk the rail
// prefetches on hover (panelLoaders.ts).
const LAZY_PANELS = Object.fromEntries(
  Object.entries(PANEL_LOADERS).map(([panel, load]) => [panel, React.lazy(load)]),
) as Record<keyof typeof PANEL_LOADERS, React.LazyExoticComponent<React.ComponentType>>;

const PANEL_TITLES: Record<ActivePanel, string> = {
  files: "Explorer",
  search: "Search",
  agents: "Agents",
  conversations: "Conversations",
  notifications: "Notifications",
  tasks: "My Tasks",
  public: "Shared", // label-only rename (AOC §12); id stays "public" (R-R3)
  marketplace: "Marketplace",
  database: "Databases",
};

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
  /** Shown as the hidden-mode peek: a pin docks the sidebar again. */
  peek?: boolean;
}

/** Escape in a panel hands the keyboard back to the page being edited. */
function returnFocusToContent(event: React.KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const editor = document.querySelector<HTMLElement>("main [contenteditable='true'], main textarea, main");
  editor?.focus();
}

/**
 * The panel next to the rail. A panel, once opened, stays mounted and is only
 * hidden when another is shown, so switching back is a style change, not a
 * remount (no Suspense flash, scroll and state kept).
 * Memoized: the parent re-renders on drag and mode flips.
 */
export const SidebarPanel = React.memo(function SidebarPanel({ onOpenSettings, onOpenTrash, onOpenConsole, peek = false }: Props) {
  const activePanel = useUIStore((s) => s.activePanel);
  const toggleDocked = useUIStore((s) => s.toggleDocked);
  const [visited, setVisited] = useState<ReadonlySet<ActivePanel>>(() => new Set([activePanel]));
  // The panels a keyboard shortcut opens load while the app is idle, so the
  // shortcut never waits on a download.
  useEffect(() => {
    const warm = () => { prefetchPanel("conversations"); prefetchPanel("search"); };
    if (typeof requestIdleCallback !== "function") {
      const timer = setTimeout(warm, 1500);
      return () => clearTimeout(timer);
    }
    const id = requestIdleCallback(warm);
    return () => cancelIdleCallback(id);
  }, []);
  if (!visited.has(activePanel)) setVisited(new Set(visited).add(activePanel));

  const render = (panel: ActivePanel) => {
    if (panel === "files") return <FilesPanel onOpenSettings={onOpenSettings} onOpenTrash={onOpenTrash} onOpenConsole={onOpenConsole} />;
    const Lazy = LAZY_PANELS[panel as keyof typeof LAZY_PANELS];
    return Lazy ? <Lazy /> : null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-subtle)]" onKeyDown={returnFocusToContent}>
      <WorkspaceSwitcher />
      <div className="flex h-8 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--osio-fg-subtle)]">
          {PANEL_TITLES[activePanel]}
        </span>
        {peek ? (
          <IconButton aria-label="Keep the sidebar open" title="Keep the sidebar open" onClick={toggleDocked}>
            <Pin size={14} />
          </IconButton>
        ) : null}
      </div>
      {[...visited].map((panel) => (
        <div key={panel} data-sidebar-panel={panel} hidden={panel !== activePanel} className="flex min-h-0 flex-1 flex-col">
          <React.Suspense fallback={null}>{render(panel)}</React.Suspense>
        </div>
      ))}
    </div>
  );
});

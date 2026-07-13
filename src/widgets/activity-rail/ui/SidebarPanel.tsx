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

import React from "react";
import { PanelLeftClose } from "lucide-react";
import { WorkspaceSwitcher } from "@/features/auth";
import { IconButton } from "@/shared/ui";
import { useUIStore, type ActivePanel } from "@/shared/config/uiStore";
import { FilesPanel } from "./panels/FilesPanel";

// Only the default Explorer panel loads eagerly — every other panel mounts on
// demand when its rail icon is clicked. Static imports here were a warm-chunk
// leak: this file mounts in App, and PublicSwitcher/Marketplace statically drag
// PageBlocksRenderer → ReadOnlyBlock → MediaBlockPreview → MermaidDiagram
// (~100KB of editor renderer) onto the entry bundle. Deep imports, never barrels.
const AgentsPanel = React.lazy(() =>
  import("./panels/AgentsPanel").then((m) => ({ default: m.AgentsPanel })));
const MessengerPanel = React.lazy(() =>
  import("./panels/MessengerPanel").then((m) => ({ default: m.MessengerPanel })));
const PublicSwitcherPanel = React.lazy(() =>
  import("./panels/PublicSwitcherPanel").then((m) => ({ default: m.PublicSwitcherPanel })));
const MarketplacePanel = React.lazy(() =>
  import("./panels/MarketplacePanel").then((m) => ({ default: m.MarketplacePanel })));
const SearchPanelSlot = React.lazy(() =>
  import("./panels/SearchPanelSlot").then((m) => ({ default: m.SearchPanelSlot })));
const DatabasesPanel = React.lazy(() =>
  import("@/widgets/database-view/ui/DatabasesPanel").then((m) => ({ default: m.DatabasesPanel })));
const NotificationsPanel = React.lazy(() =>
  import("@/widgets/notifications/ui/NotificationsPanel").then((m) => ({ default: m.NotificationsPanel })));
const MyTasksPanel = React.lazy(() =>
  import("@/widgets/tasks/ui/MyTasksPanel").then((m) => ({ default: m.MyTasksPanel })));

const PANEL_TITLES: Record<ActivePanel, string> = {
  files: "Explorer",
  search: "Search",
  agents: "Agents",
  messenger: "Messenger",
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
}

/** The expanded side panel: shared workspace/account header + the active view.
 *  Memoized — it stays mounted as a hidden layer, and the parent re-renders on
 *  every rail-preview flip; memo keeps those flips from re-rendering the tree. */
export const SidebarPanel = React.memo(function SidebarPanel({ onOpenSettings, onOpenTrash, onOpenConsole }: Props) {
  const activePanel = useUIStore((s) => s.activePanel);
  const collapseToRail = useUIStore((s) => s.collapseToRail);

  const body = () => {
    switch (activePanel) {
      case "files":
        return <FilesPanel onOpenSettings={onOpenSettings} onOpenTrash={onOpenTrash} onOpenConsole={onOpenConsole} />;
      case "search":
        return <SearchPanelSlot />;
      case "agents":
        return <AgentsPanel />;
      case "messenger":
        return <MessengerPanel />;
      case "notifications":
        return <NotificationsPanel />;
      case "tasks":
        return <MyTasksPanel />;
      case "public":
        return <PublicSwitcherPanel />;
      case "marketplace":
        return <MarketplacePanel />;
      case "database":
        return <DatabasesPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-subtle)]">
      <WorkspaceSwitcher />
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--osio-fg-subtle)]">
          {PANEL_TITLES[activePanel]}
        </span>
        <IconButton aria-label="Collapse to rail" title="Collapse to rail" onClick={collapseToRail}>
          <PanelLeftClose size={14} />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <React.Suspense fallback={null}>{body()}</React.Suspense>
      </div>
    </div>
  );
});

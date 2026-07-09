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
import { AgentsPanel } from "./panels/AgentsPanel";
import { MessengerPanel } from "./panels/MessengerPanel";
import { PublicSwitcherPanel } from "./panels/PublicSwitcherPanel";
import { MarketplacePanel } from "./panels/MarketplacePanel";
import { SearchPanelSlot } from "./panels/SearchPanelSlot";
import { DatabasesPanel } from "@/widgets/database-view/ui/DatabasesPanel";
import { NotificationsPanel } from "@/widgets/notifications/ui/NotificationsPanel";

const PANEL_TITLES: Record<ActivePanel, string> = {
  files: "Explorer",
  search: "Search",
  agents: "Agents",
  messenger: "Messenger",
  notifications: "Notifications",
  public: "Shared", // label-only rename (AOC §12); id stays "public" (R-R3)
  marketplace: "Marketplace",
  database: "Databases",
};

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
}

/** The expanded side panel: shared workspace/account header + the active view. */
export const SidebarPanel: React.FC<Props> = ({ onOpenSettings, onOpenTrash, onOpenConsole }) => {
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
      <div className="flex min-h-0 flex-1 flex-col">{body()}</div>
    </div>
  );
};

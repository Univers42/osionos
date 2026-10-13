/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   panelLoaders.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:25:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:25:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One loader per lazy panel, shared by React.lazy and the rail's prefetch: a
// pointer resting on a rail icon starts the download, so the first click on it
// finds the chunk already there. Deep imports, never barrels (a barrel would
// pull the editor renderer onto the warm chunk).

import type { ActivePanel } from "@/shared/config/uiStore";

export const PANEL_LOADERS = {
  search: () => import("./panels/SearchPanelSlot").then((m) => ({ default: m.SearchPanelSlot })),
  agents: () => import("./panels/AgentsPanel").then((m) => ({ default: m.AgentsPanel })),
  conversations: () => import("./panels/ConversationsPanel").then((m) => ({ default: m.ConversationsPanel })),
  public: () => import("./panels/PublicSwitcherPanel").then((m) => ({ default: m.PublicSwitcherPanel })),
  marketplace: () => import("./panels/MarketplacePanel").then((m) => ({ default: m.MarketplacePanel })),
  database: () => import("@/widgets/database-view/ui/DatabasesPanel").then((m) => ({ default: m.DatabasesPanel })),
  notifications: () => import("@/widgets/notifications/ui/NotificationsPanel").then((m) => ({ default: m.NotificationsPanel })),
  tasks: () => import("@/widgets/tasks/ui/MyTasksPanel").then((m) => ({ default: m.MyTasksPanel })),
} satisfies Partial<Record<ActivePanel, () => Promise<{ default: React.ComponentType }>>>;

const started = new Set<ActivePanel>();

/** Starts downloading a panel's chunk once; the bundler caches the module. */
export function prefetchPanel(panel: ActivePanel): void {
  if (started.has(panel) || !(panel in PANEL_LOADERS)) return;
  started.add(panel);
  void PANEL_LOADERS[panel as keyof typeof PANEL_LOADERS]().catch(() => started.delete(panel));
}

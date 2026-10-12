/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   railItems.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  Bell,
  Bot,
  CalendarRange,
  CircleAlert,
  Database,
  Files,
  GitBranch,
  Globe,
  ListTodo,
  Mail,
  MessagesSquare,
  Play,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { ActivePanel } from "@/shared/config/uiStore";

/** Fixed rail width (px) — matches the .rail CSS width. */
export const RAIL_WIDTH = 48;
/** While dragging the expanded panel: below this width it previews + snaps to the
 *  icon rail on release. Above it, the drag just resizes the panel. */
export const PANEL_TRANSITION_WIDTH = 140;
/** Dragging the rail's edge left past this (toward 0) hides the sidebar. */
export const RAIL_HIDE_WIDTH = 24;

/** A rail item selects a side panel, opens an embedded app tab, or opens the chat shell. */
export type RailAction =
  | { kind: "panel"; panel: ActivePanel }
  | { kind: "tab"; app: "mail" | "calendar" }
  | { kind: "chat" };

export interface RailItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  action: RailAction;
}

/** Top group of the activity rail (VSCode-style). Order mirrors the brief. */
export const RAIL_TOP_ITEMS: RailItem[] = [
  { id: "files", label: "Files", Icon: Files, action: { kind: "panel", panel: "files" } },
  { id: "search", label: "Search", Icon: Search, action: { kind: "panel", panel: "search" } },
  { id: "agents", label: "Assistant", Icon: Bot, action: { kind: "chat" } },
  { id: "messenger", label: "Messenger", Icon: MessagesSquare, action: { kind: "panel", panel: "messenger" } },
  { id: "notifications", label: "Notifications", Icon: Bell, action: { kind: "panel", panel: "notifications" } },
  { id: "tasks", label: "My Tasks", Icon: ListTodo, action: { kind: "panel", panel: "tasks" } },
  // ponytail: nav LABEL renamed Public→Shared (AOC §12); panel id stays "public"
  // (R-R3) so the persisted uiStore activePanel keeps resolving — label-only, no
  // migration. Upgrade: to change the id, bump uiStore persist version + migrate-hook 'public'→'shared'.
  { id: "public", label: "Shared", Icon: Globe, action: { kind: "panel", panel: "public" } },
  { id: "marketplace", label: "Marketplace", Icon: Store, action: { kind: "panel", panel: "marketplace" } },
  { id: "database", label: "Databases", Icon: Database, action: { kind: "panel", panel: "database" } },
];

/** Workbench group, appended under the top group only when the workbench flag is on. */
export const RAIL_WORKBENCH_ITEMS: RailItem[] = [
  { id: "scm", label: "Source Control", Icon: GitBranch, action: { kind: "panel", panel: "scm" } },
  { id: "run", label: "Run", Icon: Play, action: { kind: "panel", panel: "run" } },
  { id: "problems", label: "Problems", Icon: CircleAlert, action: { kind: "panel", panel: "problems" } },
];

/** The top group for the given flag state. Returns RAIL_TOP_ITEMS itself when off
 *  (same identity, no per-render copy). */
export function railTopItems(workbench: boolean): RailItem[] {
  return workbench ? [...RAIL_TOP_ITEMS, ...RAIL_WORKBENCH_ITEMS] : RAIL_TOP_ITEMS;
}

/** The panel actually shown for a stored activePanel. A workbench panel persisted
 *  while the flag is off would otherwise render an empty switch case, so it falls
 *  back to the Explorer. */
export function visiblePanel(panel: ActivePanel, workbench: boolean): ActivePanel {
  if (workbench) return panel;
  return panel === "scm" || panel === "run" || panel === "problems" ? "files" : panel;
}

/** App launchers — open an in-app iframe tab rather than a panel. */
export const RAIL_APP_ITEMS: RailItem[] = [
  { id: "mail", label: "Mail", Icon: Mail, action: { kind: "tab", app: "mail" } },
  { id: "calendar", label: "Calendar", Icon: CalendarRange, action: { kind: "tab", app: "calendar" } },
];

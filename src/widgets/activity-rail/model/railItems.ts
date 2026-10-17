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
  CalendarRange,
  CircleAlert,
  Database,
  Files,
  GitBranch,
  Globe,
  ListTodo,
  Mail,
  MessagesSquare,
  PenTool,
  Play,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { ActivePanel } from "@/shared/config/uiStore";
import type { CommandId } from "@/features/automations/model/types";
import { isWhiteboardReady } from "@/features/whiteboard/model/whiteboardAvailability";

/** Fixed rail width (px) — matches the .rail CSS width. */
export const RAIL_WIDTH = 48;
/** While dragging the expanded panel: below this width it previews + snaps to the
 *  icon rail on release. Above it, the drag just resizes the panel. */
export const PANEL_TRANSITION_WIDTH = 140;
/** Dragging the rail's edge left past this (toward 0) hides the sidebar. */
export const RAIL_HIDE_WIDTH = 24;

/** The apps whose rail item opens a tab of its own. */
export type RailApp = "mail" | "calendar" | "whiteboard";

/** A rail item selects a side panel or opens an embedded app tab. */
export type RailAction =
  | { kind: "panel"; panel: ActivePanel }
  | { kind: "tab"; app: RailApp };

export interface RailItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  action: RailAction;
  /** The command whose shortcut the tooltip shows. */
  commandId?: CommandId;
  /** Hides the item while it answers false; absent means always shown. */
  isAvailable?: () => boolean;
}

export interface RailGroup {
  id: "workspace" | "workbench" | "conversations" | "apps";
  label: string;
  items: readonly RailItem[];
}

/** The rail, grouped by what the user does there. Installed marketplace apps
 *  are appended to "apps" at render time, except those that already have a static
 *  item here (`STATIC_APP_IDENTIFIERS`). */
export const RAIL_GROUPS: readonly RailGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "files", label: "Explorer", Icon: Files, action: { kind: "panel", panel: "files" }, commandId: "focusExplorer" },
      { id: "search", label: "Search", Icon: Search, action: { kind: "panel", panel: "search" }, commandId: "openSearchPanel" },
      { id: "database", label: "Databases", Icon: Database, action: { kind: "panel", panel: "database" } },
      { id: "tasks", label: "My Tasks", Icon: ListTodo, action: { kind: "panel", panel: "tasks" } },
      // ponytail: nav LABEL renamed Public→Shared (AOC §12); panel id stays "public"
      // (R-R3) so the persisted uiStore activePanel keeps resolving.
      { id: "public", label: "Shared", Icon: Globe, action: { kind: "panel", panel: "public" } },
    ],
  },
  {
    id: "workbench",
    label: "Workbench",
    items: [
      { id: "scm", label: "Source Control", Icon: GitBranch, action: { kind: "panel", panel: "scm" } },
      { id: "run", label: "Run", Icon: Play, action: { kind: "panel", panel: "run" } },
      { id: "problems", label: "Problems", Icon: CircleAlert, action: { kind: "panel", panel: "problems" } },
    ],
  },
  {
    id: "conversations",
    label: "Conversations",
    items: [
      { id: "conversations", label: "Conversations", Icon: MessagesSquare, action: { kind: "panel", panel: "conversations" }, commandId: "focusConversations" },
      { id: "notifications", label: "Notifications", Icon: Bell, action: { kind: "panel", panel: "notifications" } },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    items: [
      { id: "marketplace", label: "Marketplace", Icon: Store, action: { kind: "panel", panel: "marketplace" } },
      { id: "mail", label: "Mail", Icon: Mail, action: { kind: "tab", app: "mail" } },
      { id: "calendar", label: "Calendar", Icon: CalendarRange, action: { kind: "tab", app: "calendar" } },
      { id: "whiteboard", label: "Whiteboard", Icon: PenTool, action: { kind: "tab", app: "whiteboard" }, isAvailable: isWhiteboardReady },
    ],
  },
];

/** The items of a group the user can reach right now. */
export function visibleRailItems(group: RailGroup): readonly RailItem[] {
  return group.items.filter((item) => item.isAvailable?.() ?? true);
}

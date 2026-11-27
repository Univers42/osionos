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
  Archive,
  Bell,
  Bug,
  CalendarRange,
  CircleAlert,
  Database,
  Files,
  GitBranch,
  Globe,
  LayoutTemplate,
  Library,
  ListTodo,
  Mail,
  MessagesSquare,
  PenTool,
  Play,
  Search,
  Server,
  Shield,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";
import { calendarAppUrl, mailAppUrl } from "@/shared/config/appUrls";
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";
import type { ActivePanel } from "@/shared/config/uiStore";
import type { CommandId } from "@/features/automations/model/types";
import { roleAtLeast, type PlatformRole } from "@/features/auth/model/platformRole";
import {
  adminTab, aiHubTab, calendarTab, consoleTab, libraryTab, mailTab, trashTab, whiteboardTab,
} from "@/widgets/workspace-grid/model/layoutPersist";
import { prefetchPageLibraryView } from "@/widgets/page-renderer/ui/lazyViews";
import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";
import { isWhiteboardReady } from "@/features/whiteboard/model/whiteboardAvailability";

/** Fixed rail width (px) — matches the .rail CSS width. */
export const RAIL_WIDTH = 48;
/** While dragging the expanded panel: below this width it previews + snaps to the
 *  icon rail on release. Above it, the drag just resizes the panel. */
export const PANEL_TRANSITION_WIDTH = 140;
/** Dragging the rail's edge left past this (toward 0) hides the sidebar. */
export const RAIL_HIDE_WIDTH = 24;

/** A rail item selects a side panel or opens a tab (stable pageId: a second click focuses it). */
export type RailAction =
  | { kind: "panel"; panel: ActivePanel }
  | { kind: "workspaceTab"; makeTab: () => WorkspaceTab };

export interface RailItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  action: RailAction;
  /** The command whose shortcut the tooltip shows. */
  commandId?: CommandId;
  /** Hides the item while it answers false; absent means always shown. */
  isAvailable?: () => boolean;
  /** Hides the item below this platform role. Cosmetic: the bridge is the authority. */
  requiredRole?: PlatformRole;
  /** Warms the item's lazy chunk while the pointer rests on it (tab items; panels use panelLoaders). */
  prefetch?: () => void;
}

export interface RailGroup {
  id: "workspace" | "workbench" | "conversations" | "apps";
  label: string;
  items: readonly RailItem[];
}

/** The rail, grouped by what the user does there. Installed marketplace apps
 *  are appended to "apps" at render time, except those that already have a static
 *  item here (`STATIC_APP_IDENTIFIERS`). */
const TEMPLATES_ITEM: RailItem = { id: "templates", label: "Templates", Icon: LayoutTemplate, action: { kind: "panel", panel: "templates" } };

export const RAIL_GROUPS: readonly RailGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "files", label: "Explorer", Icon: Files, action: { kind: "panel", panel: "files" }, commandId: "focusExplorer" },
      { id: "search", label: "Search", Icon: Search, action: { kind: "panel", panel: "search" }, commandId: "openSearchPanel" },
      { id: "database", label: "Databases", Icon: Database, action: { kind: "panel", panel: "database" } },
      // The panel lists catalogue templates, TD18 writers: absent with osio.layout.modes off
      // (groot ADR 0067 RD7). Read at load, like LayoutModesContext.
      ...(isLayoutModesEnabled() ? [TEMPLATES_ITEM] : []),
      { id: "tasks", label: "My Tasks", Icon: ListTodo, action: { kind: "panel", panel: "tasks" } },
      // ponytail: nav LABEL renamed Public→Shared (AOC §12); panel id stays "public"
      // (R-R3) so the persisted uiStore activePanel keeps resolving.
      { id: "public", label: "Shared", Icon: Globe, action: { kind: "panel", panel: "public" } },
      { id: "library", label: "Library", Icon: Library, action: { kind: "workspaceTab", makeTab: libraryTab }, prefetch: prefetchPageLibraryView },
      // The moderator's entry too: the sections inside the space are what the role gates.
      { id: "trash", label: "Archived files", Icon: Archive, action: { kind: "workspaceTab", makeTab: trashTab } },
      { id: "admin", label: "Admin", Icon: Shield, action: { kind: "workspaceTab", makeTab: adminTab }, requiredRole: "moderator" },
    ],
  },
  {
    id: "workbench",
    label: "Workbench",
    items: [
      { id: "scm", label: "Source Control", Icon: GitBranch, action: { kind: "panel", panel: "scm" } },
      { id: "run", label: "Run", Icon: Play, action: { kind: "panel", panel: "run" } },
      { id: "problems", label: "Problems", Icon: CircleAlert, action: { kind: "panel", panel: "problems" } },
      { id: "issues", label: "Issues", Icon: Bug, action: { kind: "panel", panel: "issues" } },
      // Only with a configured project: a stock build (no VITE_BAAS_URL) has no console to open.
      { id: "console", label: "BaaS Console", Icon: Server, action: { kind: "workspaceTab", makeTab: consoleTab }, isAvailable: () => Boolean((import.meta.env ?? {}).VITE_BAAS_URL) },
    ],
  },
  {
    id: "conversations",
    label: "Conversations",
    items: [
      { id: "conversations", label: "Conversations", Icon: MessagesSquare, action: { kind: "panel", panel: "conversations" }, commandId: "focusConversations" },
      { id: "ai-hub", label: "AI Hub", Icon: Sparkles, action: { kind: "workspaceTab", makeTab: aiHubTab } },
      { id: "notifications", label: "Notifications", Icon: Bell, action: { kind: "panel", panel: "notifications" } },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    items: [
      { id: "marketplace", label: "Marketplace", Icon: Store, action: { kind: "panel", panel: "marketplace" } },
      { id: "mail", label: "Mail", Icon: Mail, action: { kind: "workspaceTab", makeTab: mailTab }, isAvailable: () => mailAppUrl() !== "" },
      { id: "calendar", label: "Calendar", Icon: CalendarRange, action: { kind: "workspaceTab", makeTab: calendarTab }, isAvailable: () => calendarAppUrl() !== "" },
      { id: "whiteboard", label: "Whiteboard", Icon: PenTool, action: { kind: "workspaceTab", makeTab: whiteboardTab }, isAvailable: isWhiteboardReady },
    ],
  },
];

/** The items of a group the user can reach right now: a public build never offers a
 *  Mail/Calendar icon whose URL is blank, which would open a dead iframe. A role of
 *  `null` (signed in without one, or signed out) loses every role-gated item; an omitted
 *  role skips the role filter, for callers that only care about availability. */
export function visibleRailItems(group: RailGroup, role?: PlatformRole | null): readonly RailItem[] {
  return group.items.filter((item) => {
    if (role !== undefined && item.requiredRole && !roleAtLeast(role, item.requiredRole)) return false;
    return item.isAvailable?.() ?? true;
  });
}

/** What the rail shows as "you are here". */
export interface RailLocation {
  activePanel: ActivePanel;
  /** False while the side panel is folded to the bare rail. */
  panelShown: boolean;
  /** The focused tab's pageId. */
  activePageId: string | undefined;
}

/** A panel item is active while its panel is shown; a tab item while its tab is the focused one. */
export function isRailItemActive(item: RailItem, at: RailLocation): boolean {
  if (item.action.kind === "panel") return at.panelShown && at.activePanel === item.action.panel;
  return at.activePageId !== undefined && item.action.makeTab().pageId === at.activePageId;
}

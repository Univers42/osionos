/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   installedAppLauncher.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { whiteboardTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { genId, type WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

import type { InstalledEntry, InstalledMap } from "./useInstalledApps";

/** Apps that ship inside osionos: always on for every account, so the marketplace offers
 *  no Install, Deactivate or Uninstall for them. `osionos.draw` is the Whiteboard's retired
 *  identifier, still present in maps stored before `migrateInstalledMap` ran. */
export const BUILT_IN_APP_IDENTIFIERS: ReadonlySet<string> = new Set(["osionos.whiteboard", "osionos.draw"]);

/** Identifiers whose rail launcher is already static: an installed copy must not add a
 *  second icon. Built-in apps are static by definition. */
export const STATIC_APP_IDENTIFIERS: ReadonlySet<string> = new Set(["osionos.mail", "osionos.calendar", ...BUILT_IN_APP_IDENTIFIERS]);

/** The installed apps the rail appends after its static items: active, and not already static. */
export function railInstalledApps(installed: InstalledMap): InstalledEntry[] {
  return Object.values(installed).filter((entry) => entry.active && !STATIC_APP_IDENTIFIERS.has(entry.identifier));
}

/** Identifiers that open a NATIVE in-app pane (own `tab.kind`) rather than the
 *  default iframe embed — their launcher returns the app's own tab factory. */
const NATIVE_APP_TABS: Record<string, () => WorkspaceTab> = {
  "osionos.whiteboard": whiteboardTab,
  // Safety net for an installed map not yet migrated (see installedMigrations.ts).
  "osionos.draw": whiteboardTab,
};

/** Native apps render in-app; their catalogue launch URL is never loaded. */
export function isNativeApp(identifier: string): boolean {
  return identifier in NATIVE_APP_TABS;
}

/** Build the workspace tab that activates an installed app. Native apps (Whiteboard)
 *  open their stable-id tab; everything else opens as an embed iframe at its
 *  launch URL. */
export function installedTab(entry: InstalledEntry): WorkspaceTab {
  const native = NATIVE_APP_TABS[entry.identifier];
  if (native) return native();
  return {
    tabId: genId("tab"),
    pageId: `__app__${entry.identifier}__`,
    workspaceId: "",
    kind: "embed",
    title: entry.title,
    icon: entry.icon ?? "icon:box",
    url: entry.launchUrl,
  };
}

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

import { drawTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { genId, type WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

import type { InstalledEntry } from "./useInstalledApps";

/** Reserved identifiers whose rail launchers are already static (avoid duplicate rail icons). */
export const STATIC_APP_IDENTIFIERS = new Set(["osionos.mail", "osionos.calendar"]);

/** Identifiers that open a NATIVE in-app pane (own `tab.kind`) rather than the
 *  default iframe embed — their launcher returns the app's own tab factory. */
const NATIVE_APP_TABS: Record<string, () => WorkspaceTab> = {
  "osionos.draw": drawTab,
};

/** Build the workspace tab that activates an installed app. Native apps (Draw)
 *  open their own pane kind; everything else opens as an embed iframe at its
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

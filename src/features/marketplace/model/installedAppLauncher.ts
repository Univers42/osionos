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

import { genId, type WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

import type { InstalledEntry } from "./useInstalledApps";

/** Reserved identifiers whose rail launchers are already static (avoid duplicate rail icons). */
export const STATIC_APP_IDENTIFIERS = new Set(["osionos.mail", "osionos.calendar"]);

/** Build an embed workspace tab that activates an installed app at its launch URL. */
export function installedTab(entry: InstalledEntry): WorkspaceTab {
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

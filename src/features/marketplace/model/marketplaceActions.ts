/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   marketplaceActions.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import { readAppMeta } from "./appMeta";
import { effectiveLaunchUrl } from "./launchPolicy";
import { installedTab } from "./installedAppLauncher";
import type { InstalledEntry } from "./useInstalledApps";

/** Open an installed app in an embed tab. */
export function launchEntry(entry: InstalledEntry): void {
  const launchUrl = effectiveLaunchUrl(entry.identifier, entry.launchUrl);
  if (launchUrl) useWorkspaceLayout.getState().openTab(installedTab({ ...entry, launchUrl }));
}

/** Open an app (from its record) in an embed tab. */
export function launchApp(app: PageEntry): void {
  const m = readAppMeta(app);
  const launchUrl = effectiveLaunchUrl(m.identifier, m.launchUrl);
  if (!launchUrl) return;
  useWorkspaceLayout.getState().openTab(
    installedTab({ identifier: m.identifier, title: app.title, icon: app.icon, launchKind: m.launchKind, launchUrl, autoUpdate: false, active: true, installedAt: "" }),
  );
}

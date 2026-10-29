/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysSlashCommands.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { SYS_SOURCES, SYS_VIEW_TYPE } from "@/widgets/database-view/model/sysDataSources";
import {
  RECENTS_DB_ID,
  RECENTS_GALLERY_VIEW,
  TEMPLATES_DB_ID,
  TEMPLATES_GALLERY_VIEW,
} from "@/widgets/database-view/model/workspaceDatabaseConstants";
import type { SlashDatabaseViewCommand } from "./types";

/** The "My data" slash group: one entry per `sys:` source, the only way to insert one. */
export function buildSysSlashCommands(): SlashDatabaseViewCommand[] {
  const sys = SYS_SOURCES.map((entry) => ({
    kind: "database-view" as const,
    id: `my-data:${entry.source}`,
    label: entry.label,
    icon: entry.icon,
    description: entry.description,
    section: "my-data",
    databaseId: entry.id,
    viewId: entry.defaultViewId,
    viewType: SYS_VIEW_TYPE,
    aliases: ["my data", entry.source],
  }));
  return [
    ...sys,
    {
      kind: "database-view",
      id: "my-data:recently-visited",
      label: "Recently visited",
      icon: "🕒",
      description: "Pages you opened recently, as a gallery.",
      section: "my-data",
      databaseId: RECENTS_DB_ID,
      viewId: RECENTS_GALLERY_VIEW,
      viewType: "gallery",
      aliases: ["recently visited", "recents"],
    },
    {
      kind: "database-view",
      id: "my-data:templates",
      label: "Templates",
      icon: "📑",
      description: "Ready-made pages you can use as a starting point.",
      section: "my-data",
      databaseId: TEMPLATES_DB_ID,
      viewId: TEMPLATES_GALLERY_VIEW,
      viewType: "gallery",
      aliases: ["templates", "template"],
    },
  ];
}

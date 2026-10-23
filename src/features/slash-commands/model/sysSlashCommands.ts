/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysSlashCommands.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { SYS_SOURCES, SYS_VIEW_TYPE } from "@/widgets/database-view/model/sysDataSources";
import type { SlashDatabaseViewCommand } from "./types";

/** The "My data" slash group: one entry per `sys:` source, the only way to insert one. */
export function buildSysSlashCommands(): SlashDatabaseViewCommand[] {
  return SYS_SOURCES.map((entry) => ({
    kind: "database-view",
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
}

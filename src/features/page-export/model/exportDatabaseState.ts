/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportDatabaseState.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The account's object databases as an export reads them. The store holds the seed until this
// browser's stored copy is read, so an export started right after load waits for it.

import type { NotionState } from "@notion-db/contract-types";

/** The known-database state once it is loaded; null without a database plane (offline harness). */
export async function loadExportDatabaseState(): Promise<NotionState | null> {
  try {
    const { loadKnownDatabaseState, whenKnownDatabaseReady } = await import("@/widgets/database-view/model/knownDatabaseState");
    await whenKnownDatabaseReady();
    return loadKnownDatabaseState();
  } catch {
    return null; // blocks then degrade to text
  }
}

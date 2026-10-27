/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateDatabaseInstantiate.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Glue between the pure clone (templateDatabaseClone) and the account state.
// Kept in its own module so the seed state and the known-database store stay out
// of pageStore.actions' warm chunk: it is reached only through a dynamic import.

import type { Block } from "@/entities/block";
import { useKnownDatabaseStateStore } from "./knownDatabaseState";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { rememberDatabaseWorkspace } from "./objectDatabaseWorkspaces";
import { cloneTemplateDatabases } from "./templateDatabaseClone";

export function instantiateTemplateDatabases(content: Block[], workspaceId: string): Block[] {
  const state = useKnownDatabaseStateStore.getState().state;
  const result = cloneTemplateDatabases(content, state, (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`);
  if (result.created.length > 0) {
    useKnownDatabaseStateStore.getState().replaceState(result.state);
    useDatabaseStore.getState().ensureRegistered(
      result.created.map((entry) => ({ id: entry.id, name: entry.name, viewId: entry.viewId })),
    );
    for (const entry of result.created) {
      rememberDatabaseWorkspace(entry.id, workspaceId);
    }
  }
  return result.content;
}
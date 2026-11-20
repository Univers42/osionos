/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   catalogueInstantiate.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { NotionState } from "@notion-db/object-database";
import { freshTemplateContent } from "@/features/page-shells/model/applyShell";
import { isCatalogueId } from "@/data/templates/catalogue/tplId";
import type { CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";
import { useKnownDatabaseStateStore, whenKnownDatabaseReady } from "@/widgets/database-view/model/knownDatabaseState";
import { commitClonedDatabases } from "@/widgets/database-view/model/templateDatabaseInstantiate";
import { hasDanglingDatabase } from "./applyTemplate";
import { cloneFromSlice, type TemplateSource } from "./templateSlice";

export interface CatalogueInstantiateDeps {
  load: (id: string) => Promise<TemplateSource | null>;
  icon: (id: string) => Promise<string | undefined>;
  whenReady: () => Promise<void>;
  live: () => NotionState;
  mintId: (prefix: string) => string;
  commit: (state: NotionState, created: CreatedEntry[], workspaceId: string) => void;
}

export async function prepareCatalogueTemplateWith(
  deps: CatalogueInstantiateDeps,
  templateId: string,
  workspaceId: string,
): Promise<{ title: string; icon?: string; content: Block[] } | null> {
  if (!isCatalogueId(templateId)) return null;
  const source = await deps.load(templateId);
  if (!source) return null;
  await deps.whenReady();
  const [icon, live] = [await deps.icon(templateId), deps.live()];
  const cloned = cloneFromSlice(freshTemplateContent(source.content), source.databases, live, deps.mintId);
  if (hasDanglingDatabase(cloned.content, cloned.created, live)) {
    throw new Error("catalogue template has a dangling database");
  }
  deps.commit(cloned.state, cloned.created, workspaceId);
  return { title: source.title || "Untitled", icon, content: cloned.content };
}

function liveCatalogueDeps(): CatalogueInstantiateDeps {
  return {
    load: async (id) => (await import("@/data/templates/catalogue")).loadTemplate(id),
    icon: async (id) => (await (await import("@/data/templates/catalogue")).listCatalogue()).find((card) => card.id === id)?.icon,
    whenReady: whenKnownDatabaseReady,
    live: () => useKnownDatabaseStateStore.getState().state,
    mintId: (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
    commit: commitClonedDatabases,
  };
}

export function prepareCatalogueTemplate(templateId: string, workspaceId: string) {
  return prepareCatalogueTemplateWith(liveCatalogueDeps(), templateId, workspaceId);
}

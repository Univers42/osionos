/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyToPageLive.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { saveAutosaveVersion } from "@/entities/page/model/versionAutosave";
import type { PageEntry } from "@/entities/page/model/types";
import { pageHandleFor } from "@/features/block-editor/model/editorCommandBus";
import { getActivePageJwt } from "@/shared/api/client";
import { usePageConfigStore } from "@/shared/config/pageConfigStore";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { canEditBody, nextDuplicateTitle } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { isKnownDatabaseWritable, useKnownDatabaseStateStore, whenKnownDatabaseReady } from "@/widgets/database-view/model/knownDatabaseState";
import { commitClonedDatabases } from "@/widgets/database-view/model/templateDatabaseInstantiate";
import { applyToPageWith, type ApplyMode, type ApplyOutcome, type ApplyToPageDeps } from "./applyToPage";
import type { TemplateSource } from "./templateSlice";

function copyPage(p: PageEntry, content: Block[]): Promise<PageEntry | null> {
  return usePageStore.getState().addPage(
    p.workspaceId,
    nextDuplicateTitle(p.title || "Untitled"),
    getActivePageJwt() ?? "",
    p.parentPageId ?? undefined,
    { icon: p.icon, content },
  );
}

function liveDeps(pageId: string, userId: string): ApplyToPageDeps {
  return {
    handleFor: pageHandleFor,
    page: (id) => usePageStore.getState().pageById(id),
    canEditBody: (p) => canEditBody(p, getCurrentPageAccessContext()),
    whenDatabasesReady: whenKnownDatabaseReady,
    liveDatabases: () => useKnownDatabaseStateStore.getState().state,
    dbWritable: isKnownDatabaseWritable,
    mintId: (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
    copyPage,
    commitDatabases: (state, created) => {
      const target = usePageStore.getState().pageById(pageId);
      if (!target) throw new Error("page gone");
      commitClonedDatabases(state, created, target.workspaceId);
    },
    saveVersion: (id, label) => saveAutosaveVersion(id, userId, label, usePageConfigStore.getState().addVersion),
  };
}

export function applyToPage(pageId: string, template: TemplateSource, mode: ApplyMode, userId: string): Promise<ApplyOutcome> {
  return applyToPageWith(liveDeps(pageId, userId), pageId, template, mode);
}

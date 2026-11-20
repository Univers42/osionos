/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyToPage.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import type { EditorHandle } from "@/features/block-editor/model/editorCommandBus";
import type { PageEntry } from "@/entities/page/model/types";
import { deepEqual } from "@/store/sync/mergePageContent.tree";
import type { NotionState } from "@notion-db/object-database";
import type { CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";
import { planApply, type ApplyRefusal } from "./applyTemplate";
import type { TemplateSource } from "./templateSlice";

export type ApplyMode = "keep-copy" | "replace";
export type ApplyFailure = ApplyRefusal | "not-open" | "copy-failed" | "changed-during-copy" | "commit-failed";
export type ApplyOutcome =
  | { ok: true; copyId: string | null; versionSaved: boolean }
  | { ok: false; reason: ApplyFailure; copyId?: string };
export interface ApplyToPageDeps {
  handleFor: (pageId: string) => EditorHandle | null;
  page: (pageId: string) => PageEntry | undefined;
  canEditBody: (page: PageEntry) => boolean;
  whenDatabasesReady: () => Promise<void>;
  liveDatabases: () => NotionState;
  dbWritable: () => boolean;
  mintId: (prefix: string) => string;
  copyPage: (page: PageEntry, content: Block[]) => Promise<PageEntry | null>;
  commitDatabases: (state: NotionState, created: CreatedEntry[]) => void;
  saveVersion: (pageId: string, label: string) => boolean;
}

function planFor(deps: ApplyToPageDeps, target: PageEntry, template: TemplateSource): ReturnType<typeof planApply> {
  return planApply({
    target,
    template,
    live: deps.liveDatabases(),
    canEdit: deps.canEditBody(target),
    dbWritable: deps.dbWritable(),
    mintId: deps.mintId,
  });
}

/** A copy made before a later step failed is reported, so the caller can show it instead of orphaning it. */
function failure(reason: ApplyFailure, copyId: string | null): ApplyOutcome & { ok: false } {
  return copyId === null ? { ok: false, reason } : { ok: false, reason, copyId };
}

async function copyPageOrNull(deps: ApplyToPageDeps, target: PageEntry, before: Block[]): Promise<PageEntry | null> {
  try {
    return await deps.copyPage(target, before);
  } catch {
    return null;
  }
}

async function prepareCopy(
  deps: ApplyToPageDeps, pageId: string, target: PageEntry, handle: EditorHandle, mode: ApplyMode,
): Promise<{ ok: true; copyId: string | null } | (ApplyOutcome & { ok: false })> {
  const before = handle.getContent();
  let copyId: string | null = null;
  if (mode === "keep-copy") {
    const copy = await copyPageOrNull(deps, target, before);
    if (copy === null) return failure("copy-failed", null);
    copyId = copy._id;
    if (!deepEqual(copy.content, before)) return failure("copy-failed", copyId);
  }
  if (deps.handleFor(pageId) !== handle) return failure("not-open", copyId);
  if (!deepEqual(handle.getContent(), before)) return failure("changed-during-copy", copyId);
  return { ok: true, copyId };
}

function finishApply(
  deps: ApplyToPageDeps, pageId: string, template: TemplateSource, handle: EditorHandle, copyId: string | null,
): ApplyOutcome {
  const fresh = deps.page(pageId);
  if (!fresh) return failure("not-loaded", copyId);
  const plan = planFor(deps, fresh, template);
  if (!plan.ok) return failure(plan.reason, copyId);
  try {
    deps.commitDatabases(plan.state, plan.created);
  } catch {
    return failure("commit-failed", copyId);
  }
  const versionSaved = deps.saveVersion(pageId, `Before template: ${template.title}`);
  handle.updateContent(plan.content);
  return { ok: true, copyId, versionSaved };
}

export async function applyToPageWith(
  deps: ApplyToPageDeps, pageId: string, template: TemplateSource, mode: ApplyMode,
): Promise<ApplyOutcome> {
  const handle = deps.handleFor(pageId);
  if (!handle) return { ok: false, reason: "not-open" };
  const target = deps.page(pageId);
  if (!target) return { ok: false, reason: "not-loaded" };
  await deps.whenDatabasesReady();
  const gate = planFor(deps, target, template);
  if (!gate.ok) return gate;
  const copied = await prepareCopy(deps, pageId, target, handle, mode);
  if (!copied.ok) return copied;
  return finishApply(deps, pageId, template, handle, copied.copyId);
}

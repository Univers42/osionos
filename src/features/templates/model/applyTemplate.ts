/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   applyTemplate.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pure half of "apply a template to this page" (Task 6 commits the plan
// through the page's own editor handle). Given the target page, the template
// and the live database state, planApply returns the new page content and the
// new database state — or a refusal reason, before any write. No store, no
// React, no network: the gates (TD2, TD12) and the dangling check (TD10) are
// all decided here, so a caller cannot apply half of anything.

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page/model/types";
import { freshTemplateContent } from "@/features/page-shells/model/applyShell";
import { isContentUnloaded } from "@/store/pageStore.helpers";
import type { NotionState } from "@notion-db/object-database";
import type { CreatedEntry } from "@/widgets/database-view/model/templateDatabaseClone";
import { cloneFromSlice, type TemplateSource } from "./templateSlice";

/** Why apply refuses, decided before any clone or write (TD2, TD10, TD12). */
export type ApplyRefusal = "read-only" | "not-loaded" | "db-read-only" | "dangling-database";

const isDatabaseBlock = (block: Block): boolean =>
  block.type === "database_inline" || block.type === "database_full_page";

/** TD10: after the clone, every database block must point at a fresh clone or at a
 *  database the user already owned. A block left pointing at anything else would
 *  make two pages share a database, so apply aborts with no write. */
function hasDanglingDatabase(content: Block[], created: CreatedEntry[], live: NotionState): boolean {
  const known = new Set(Object.keys(live.databases));
  for (const entry of created) known.add(entry.id);
  let dangling = false;
  const walk = (blocks: Block[] | undefined): void => {
    if (!blocks || dangling) return;
    for (const block of blocks) {
      if (isDatabaseBlock(block) && (typeof block.databaseId !== "string" || !known.has(block.databaseId))) {
        dangling = true;
        return;
      }
      walk(block.children);
      for (const cell of block.layoutCells ?? []) walk(cell.blocks);
    }
  };
  walk(content);
  return dangling;
}

/** The apply plan: content with fresh block ids (TD7) whose template databases are
 *  cloned from the input slice (TD9), plus the state to store — or a refusal. */
export function planApply(input: {
  target: PageEntry;
  template: TemplateSource;
  live: NotionState;
  canEdit: boolean;
  dbWritable: boolean;
  mintId: (prefix: string) => string;
}): { ok: true; content: Block[]; state: NotionState; created: CreatedEntry[] } | { ok: false; reason: ApplyRefusal } {
  if (!input.canEdit) return { ok: false, reason: "read-only" };
  const templateContent = input.template.content;
  if (isContentUnloaded(input.target) || !Array.isArray(templateContent)) {
    return { ok: false, reason: "not-loaded" };
  }
  if (!input.dbWritable) return { ok: false, reason: "db-read-only" };
  const cloned = cloneFromSlice(
    freshTemplateContent(templateContent),
    input.template.databases,
    input.live,
    input.mintId,
  );
  if (hasDanglingDatabase(cloned.content, cloned.created, input.live)) {
    return { ok: false, reason: "dangling-database" };
  }
  return { ok: true, content: cloned.content, state: cloned.state, created: cloned.created };
}

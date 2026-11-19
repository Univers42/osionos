// What a page made from a template takes from it besides title, icon and blocks
// (ADR 0064 PS20). ADR 0065 CV15: only the keys the template has, and never a
// cover-layout field (coverHeight / coverWidth) before the Phase 5 writer.

import type { AddPageOptions, PageEntry } from "@/entities/page/model/types";

export type TemplateCopy = Pick<AddPageOptions, "cover" | "coverPosition" | "properties">;

/**
 * The cover fields the template has, and its properties only when the template and
 * the new page sit in the same database: a cross-database copy, or one outside any
 * database, is unruled (PS20) and stays out.
 */
export function templateCopyOptions(template: PageEntry, targetDatabaseId: string | null): TemplateCopy {
  const copy: TemplateCopy = {};
  if (template.cover !== undefined) copy.cover = template.cover;
  if (template.coverPosition !== undefined) copy.coverPosition = template.coverPosition;
  const sameDatabase = template.databaseId != null && template.databaseId === targetDatabaseId;
  if (sameDatabase && template.properties) copy.properties = structuredClone(template.properties);
  return copy;
}

/** The create-request fields beyond the base ones, only those that are set. */
export function createExtrasOf(options: AddPageOptions): TemplateCopy {
  const extras: TemplateCopy = {};
  if (options.cover !== undefined) extras.cover = options.cover;
  if (options.coverPosition !== undefined) extras.coverPosition = options.coverPosition;
  if (options.properties !== undefined) extras.properties = options.properties;
  return extras;
}

// What a page made from a template takes from it besides title, icon and blocks
// (ADR 0064 PS20). ADR 0065 CV15: only the keys the template has, and never a
// cover-layout field (coverHeight / coverWidth) before the Phase 5 writer.

import type { Block } from "@/entities/block/model/types";
import type { AddPageOptions, PageEntry, PagePropertyEntry } from "@/entities/page/model/types";

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

export interface UserTemplateCopy extends TemplateCopy {
  title: string;
  icon?: string;
  content: Block[];
}

/** "Save as shell": the page's blocks, title, icon and cover; null while its body is not loaded. */
export function shellCopyOf(page: PageEntry): UserTemplateCopy | null {
  if (!Array.isArray(page.content)) return null;
  const copy: UserTemplateCopy = { title: `${page.title || "Untitled"} shell`, content: structuredClone(page.content) };
  if (page.icon !== undefined) copy.icon = page.icon;
  return { ...copy, ...templateCopyOptions(page, null) };
}

/** The property that marks a template page as a saved section, not a whole page. */
export const SECTION_TEMPLATE_KIND: PagePropertyEntry = { key: "osio-template-kind", label: "Template kind", type: "text", value: "section" };

export function isSectionTemplate(page: PageEntry): boolean {
  return page.properties?.some((entry) => entry.key === SECTION_TEMPLATE_KIND.key && entry.value === SECTION_TEMPLATE_KIND.value) ?? false;
}

function firstHeading(blocks: Block[]): string | null {
  for (const block of blocks) {
    if (block.type.startsWith("heading") && block.content.trim()) return block.content.trim();
    const inside = block.children ? firstHeading(block.children) : null;
    if (inside) return inside;
  }
  return null;
}

/** "Save section": one container, named by its first heading, marked as a section. */
export function sectionTemplateOf(container: Block): UserTemplateCopy & { properties: PagePropertyEntry[] } {
  return {
    title: firstHeading([container]) ?? "Untitled section",
    icon: "🧩",
    content: [structuredClone(container)],
    properties: [{ ...SECTION_TEMPLATE_KIND }],
  };
}

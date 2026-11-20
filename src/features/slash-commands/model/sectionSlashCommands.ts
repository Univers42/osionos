// The slash menu's "Sections" group: one entry per section of the library
// (src/data/templates/sections), read from its sync index; the blocks load on select.

import { PAGE_SHELLS, SECTIONS } from "@/data/templates/sections/sectionIndex";
import type { PageEntry } from "@/entities/page/model/types";
import { isSectionTemplate } from "@/store/templateCopy";

import type { SlashSectionCommand } from "./types";

export const SECTIONS_GROUP_ID = "sections";

export const SECTION_SLASH_COMMANDS: SlashSectionCommand[] = SECTIONS.map((section) => ({
  kind: "section",
  id: `section:${section.id}`,
  sectionId: section.id,
  label: section.label,
  aliases: ["section", ...section.aliases],
  icon: section.icon,
  description: section.description,
  section: SECTIONS_GROUP_ID,
}));

export const PAGE_SHELLS_GROUP_ID = "page-shells";

// The shells ride the same section select path (useSlashSectionSelect), so they
// are SlashSectionCommands too — only their group and catalogue differ.
export const PAGE_SHELL_SLASH_COMMANDS: SlashSectionCommand[] = PAGE_SHELLS.map((shell) => ({
  kind: "section",
  id: `section:${shell.id}`,
  sectionId: shell.id,
  label: shell.label,
  aliases: ["section", ...shell.aliases],
  icon: shell.icon,
  description: shell.description,
  section: PAGE_SHELLS_GROUP_ID,
}));

/** Groups offered only where layout containers render (ADR 0064 PS10). */
export const LAYOUT_MODE_GROUP_IDS: ReadonlySet<string> = new Set([SECTIONS_GROUP_ID, PAGE_SHELLS_GROUP_ID]);

export const MY_SECTIONS_GROUP_ID = "my-sections";

/** The user's saved sections: live template pages marked as sections. */
export function mySectionCommands(pages: readonly PageEntry[]): SlashSectionCommand[] {
  return pages
    .filter((page) => page.isTemplate && !page.archivedAt && isSectionTemplate(page))
    .map((page) => ({
      kind: "section",
      id: `my-section:${page._id}`,
      sectionId: page._id,
      templatePageId: page._id,
      label: page.title || "Untitled section",
      aliases: ["section", "my section", "saved"],
      icon: page.icon || "🧩",
      description: "Your saved section",
      section: MY_SECTIONS_GROUP_ID,
    }));
}

// The slash menu's "Sections" group: one entry per section of the library
// (src/data/templates/sections), read from its sync index; the blocks load on select.

import { SECTIONS } from "@/data/templates/sections/sectionIndex";
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

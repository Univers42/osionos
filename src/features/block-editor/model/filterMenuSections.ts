import type { BlockContextMenuSection } from "./blockContextMenu.helpers";

/** The sections that still have a row whose label contains `query` (case-insensitive); a blank query keeps all. */
export function filterMenuSections(sections: BlockContextMenuSection[], query: string): BlockContextMenuSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.label.toLowerCase().includes(needle)) }))
    .filter((section) => section.items.length > 0);
}

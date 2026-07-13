/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportPaths.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Pure path building for export archives — Notion layout: the root page file
// sits at the archive root; with "create folders" each page's subpages live in
// a folder named after the page; flat mode keeps every file at the root with
// de-duplicated names.

/** Make a title safe as a file/folder name (keeps spaces, strips separators). */
export function sanitizeFileName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- strip filesystem-hostile control chars
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "Untitled";
}

/** Stateful name de-duplicator: "A", "A (1)", "A (2)" … per directory. */
export function createNameAllocator() {
  const used = new Set<string>();
  return (dir: string, base: string, ext: string): string => {
    for (let n = 0; ; n++) {
      const name = n === 0 ? `${base}${ext}` : `${base} (${n})${ext}`;
      const path = dir ? `${dir}/${name}` : name;
      if (!used.has(path.toLowerCase())) {
        used.add(path.toLowerCase());
        return path;
      }
    }
  };
}

/** Directory (inside the archive) for a page, from its ancestor title chain. */
export function pageDirectory(chain: string[], createFolders: boolean): string {
  if (!createFolders || chain.length === 0) return "";
  return chain.map(sanitizeFileName).join("/");
}

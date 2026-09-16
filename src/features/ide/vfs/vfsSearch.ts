/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vfsSearch.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { collectBytes, bytesToText } from "./bytes";
import { joinV, type VPath } from "./vpath";
import type { FsProvider } from "./types";

export type VfsSearchMatch = {
  relPath: string;
  lineNumber: number;
  line: string;
};

const MAX_PER_FILE = 50;
const MAX_TOTAL = 500;
const MAX_FILE_BYTES = 512 * 1024;

/** Case-insensitive substring search over ANY mount — the search panel stops
 *  being page-store-shaped and works on whatever the mount table serves
 *  (osionos:// today, sandbox:///host file:// tomorrow). Bounded like the old
 *  in-memory grep: 50/file, 500 total, files over 512 KiB skipped. */
export async function searchVfs(provider: FsProvider, root: VPath, query: string): Promise<VfsSearchMatch[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: VfsSearchMatch[] = [];

  const walk = async (dir: VPath, relPrefix: string): Promise<void> => {
    for (const entry of await provider.list(dir)) {
      if (matches.length >= MAX_TOTAL) return;
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.kind === "dir") {
        await walk(joinV(dir, entry.name), relPath);
        continue;
      }
      if (entry.kind !== "file") continue;
      const stat = await provider.stat(joinV(dir, entry.name));
      if (stat.sizeBytes > MAX_FILE_BYTES) continue;
      const text = bytesToText(await collectBytes(await provider.read(joinV(dir, entry.name))));
      let inFile = 0;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && inFile < MAX_PER_FILE && matches.length < MAX_TOTAL; i++) {
        if (!lines[i].toLowerCase().includes(needle)) continue;
        matches.push({ relPath, lineNumber: i + 1, line: lines[i].slice(0, 200) });
        inFile += 1;
      }
    }
  };

  await walk(root, "");
  return matches;
}

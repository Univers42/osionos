/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeSearchPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { buildVPath } from "../vfs/vpath";
import { createPageProvider, resolveFacadePath } from "../vfs/pageProvider";
import { searchVfs, type VfsSearchMatch } from "../vfs/vfsSearch";
import { pageStoreFacade } from "../model/pageStoreFacade";
import { useIdeRevealBus } from "../model/ideRevealBus";

const EMPTY: never[] = [];

type FileGroup = { relPath: string; pageId: string; title: string; matches: VfsSearchMatch[] };

/** Group flat VFS matches by file and resolve each back to its page id through
 *  the SAME facade walk the provider uses. */
function groupMatches(workspaceId: string, matches: VfsSearchMatch[]): FileGroup[] {
  const facade = pageStoreFacade(workspaceId);
  const groups = new Map<string, FileGroup>();
  for (const match of matches) {
    let group = groups.get(match.relPath);
    if (!group) {
      const entry = resolveFacadePath(facade, match.relPath.split("/"));
      if (!entry) continue;
      group = { relPath: match.relPath, pageId: entry.id, title: entry.title, matches: [] };
      groups.set(match.relPath, group);
    }
    group.matches.push(match);
  }
  return [...groups.values()];
}

/** Global search — now a VFS walk over the workspace mount (osionos://), so the
 *  SAME panel works over any future mount (sandbox://, host file://). Clicking
 *  a result opens the file; line jump lands with the dock work. */
export const IdeSearchPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId]) ?? EMPTY;
  const openPage = usePageStore((s) => s.openPage);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<FileGroup[]>([]);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const provider = createPageProvider("osionos", pageStoreFacade(workspaceId));
      const matches = await searchVfs(provider, buildVPath("osionos", workspaceId, []), query);
      if (!stale) setResults(groupMatches(workspaceId, matches));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [workspaceId, query, pages]);

  const totalMatches = results.reduce((sum, file) => sum + file.matches.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search code files"
          className="w-full rounded border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] px-2 py-1 text-[13px] text-[var(--osio-code-fg)] outline-none focus:border-[var(--osio-accent)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2 text-[12px] text-[var(--osio-code-fg)]">
        {query.trim().length >= 2 && (
          <p className="px-2 py-1 text-[11px] text-[var(--osio-code-fg-muted)]">
            {totalMatches} {totalMatches === 1 ? "result" : "results"} in {results.length} {results.length === 1 ? "file" : "files"}
          </p>
        )}
        {results.map((file) => (
          <div key={file.relPath} className="mb-1">
            <div className="truncate px-2 py-0.5 font-semibold text-[var(--osio-code-fg-muted)]" title={file.relPath}>{file.title}</div>
            {file.matches.map((match, index) => (
              <button
                key={`${file.relPath}-${index}`}
                type="button"
                onClick={() => {
                  useIdeRevealBus.getState().request({ pageId: file.pageId, line: match.lineNumber, col: 1 });
                  openPage({ id: file.pageId, workspaceId, kind: "page", title: file.title });
                }}
                className="flex w-full items-baseline gap-2 rounded px-2 py-0.5 text-left hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.10))]"
              >
                <span className="w-8 shrink-0 text-right font-mono text-[var(--osio-code-fg-muted)]">{match.lineNumber}</span>
                <span className="truncate font-mono">{match.line || " "}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

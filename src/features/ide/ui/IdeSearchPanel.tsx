/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeSearchPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { searchCodeFiles } from "../model/browserSearch";

const EMPTY: never[] = [];

/** Global search across the workspace's loaded code files (client-side grep over
 *  the page store). Clicking a result opens the file; P7 adds a container-backed
 *  ripgrep + line jump for the on-disk tree. */
export const IdeSearchPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId]) ?? EMPTY;
  const openPage = usePageStore((s) => s.openPage);
  const [query, setQuery] = React.useState("");

  const results = React.useMemo(() => searchCodeFiles(pages, query), [pages, query]);
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
          <div key={file.pageId} className="mb-1">
            <div className="truncate px-2 py-0.5 font-semibold text-[var(--osio-code-fg-muted)]">{file.title}</div>
            {file.matches.map((match, index) => (
              <button
                key={`${file.pageId}-${index}`}
                type="button"
                onClick={() => openPage({ id: file.pageId, workspaceId, kind: "page", title: file.title })}
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

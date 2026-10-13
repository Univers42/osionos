/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WikiPages.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 04:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 04:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A wiki works like Notion's: the page itself is the wiki's home (icon, cover,
// blocks, all editable as on any page) and below it sits the list of the
// wiki's pages, newest edit first, with a button to add one. The pages are the
// wiki's children in the page tree, so the sidebar and this list always agree.

import React, { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FileText, Plus } from "lucide-react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";

import { formatEditedAgo, type PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { selectChildPageIds } from "@/widgets/sidebar/ui/pageTreeItem.helpers";

interface WikiPagesProps {
  pageId: string;
  workspaceId: string;
  locked: boolean;
}

const NO_PAGES: readonly PageEntry[] = [];

function openEntry(page: Pick<PageEntry, "_id" | "workspaceId" | "title" | "databaseId">): void {
  usePageStore.getState().openPage({
    id: page._id,
    workspaceId: page.workspaceId,
    kind: page.databaseId ? "database" : "page",
    title: page.title,
  });
}

const WikiPageRow: React.FC<{ pageId: string; now: number }> = ({ pageId, now }) => {
  const page = usePageStore(useShallow((s) => {
    const entry = s.pageById(pageId);
    return entry
      ? { _id: entry._id, workspaceId: entry.workspaceId, title: entry.title, icon: entry.icon, databaseId: entry.databaseId, updatedAt: entry.updatedAt }
      : null;
  }));
  if (!page) return null;
  return (
    <li className="border-b border-[var(--osio-border-default)] last:border-b-0">
      <button
        type="button"
        onClick={() => openEntry(page)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {page.icon ? <IconValueView value={page.icon} size={16} /> : <FileText size={15} className="text-[var(--osio-fg-muted)]" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{page.title || "Untitled"}</span>
        <span className="shrink-0 text-xs text-[var(--osio-fg-muted)]">{formatEditedAgo(page.updatedAt, now)}</span>
      </button>
    </li>
  );
};

export const WikiPages: React.FC<WikiPagesProps> = ({ pageId, workspaceId, locked }) => {
  const childIds = usePageStore((s) => selectChildPageIds(s.pages[workspaceId] ?? NO_PAGES, pageId));
  // Newest edit first, as Notion's wiki lists its pages.
  const orderedIds = usePageStore(useShallow((s) => [...childIds].sort((a, b) =>
    (s.pageById(b)?.updatedAt ?? "").localeCompare(s.pageById(a)?.updatedAt ?? ""))));
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  // One clock for the list, ticking each minute like the page header's "Edited …".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), 60_000);
    return () => globalThis.clearInterval(id);
  }, []);

  const addWikiPage = async () => {
    const page = await usePageStore.getState().addPage(workspaceId, "Untitled", jwt, pageId);
    if (page) openEntry(page);
  };

  return (
    <section aria-label="Wiki pages" data-testid="wiki-pages" className="osionos-wiki-pages">
      <div className="mb-1 flex items-center gap-2 border-b border-[var(--osio-border-default)] pb-1.5">
        <h2 className="text-sm font-semibold text-[var(--osio-fg-default)]">Pages</h2>
        <span className="text-xs text-[var(--osio-fg-muted)]">{orderedIds.length}</span>
        {locked ? null : (
          <button
            type="button"
            onClick={() => void addWikiPage()}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-[var(--osio-radius-control)] px-2 text-xs font-medium text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
          >
            <Plus size={14} aria-hidden />
            New page
          </button>
        )}
      </div>
      {orderedIds.length === 0 ? (
        <p className="px-2 py-3 text-sm text-[var(--osio-fg-muted)]">
          No pages in this wiki yet.{locked ? "" : " Add one with New page; it also appears under the wiki in the sidebar."}
        </p>
      ) : (
        <ul>
          {orderedIds.map((id) => <WikiPageRow key={id} pageId={id} now={now} />)}
        </ul>
      )}
    </section>
  );
};

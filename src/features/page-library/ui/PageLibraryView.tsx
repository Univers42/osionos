/* ************************************************************************** */
/*                                                                            */
/*   PageLibraryView.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Notion-style Library: the workspace's pages as a tree table, with tabs for
// Recents, Favorites, Shared, Private and Skills. Header stays quiet; rows are
// 32px with thin separators; an expanded level ends with an "Add new" row.

import React, { useCallback, useMemo, useState } from "react";
import { ArrowUpDown, Plus, Search } from "lucide-react";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceMembersStore } from "@/store/settings/useWorkspaceMembersStore";
import {
  buildTree, filterByTitle, LIBRARY_SORTS, pagesForTab, parseLibraryTab,
  visitedAtByPage, type LibrarySort, type LibraryTab,
} from "../model/pageLibraryModel";
import { LIBRARY_GRID, LibraryTree } from "./LibraryTree";
import { LibrarySkills } from "./LibrarySkills";

const TAB_KEY = "osionos:library:tab";
const EMPTY_PAGES: PageEntry[] = [];

const TAB_LABELS: Array<{ id: LibraryTab; label: string }> = [
  { id: "recents", label: "Recents" },
  { id: "favorites", label: "Favorites" },
  { id: "shared", label: "Shared" },
  { id: "private", label: "Private" },
  { id: "skills", label: "Skills" },
];

const SORT_LABELS: Record<LibrarySort, string> = {
  edited: "Last edited",
  visited: "Last visited",
  title: "Title",
};

function storedTab(): LibraryTab {
  try {
    return parseLibraryTab(globalThis.localStorage?.getItem(TAB_KEY));
  } catch {
    return "recents";
  }
}

export const PageLibraryView: React.FC = () => {
  const workspace = useUserStore((state) => state.activeWorkspace());
  const activeUserId = useUserStore((state) => state.activeUserId);
  const personas = useUserStore((state) => state.personas);
  const pagesByWorkspace = usePageStore((state) => state.pages);
  const recents = usePageStore((state) => state.recents);
  const favoriteIds = useFavoritesStore((state) => state.pageIds);
  const membersByWorkspace = useWorkspaceMembersStore((state) => (workspace ? state.data[workspace._id] : undefined));
  const [tab, setTab] = useState<LibraryTab>(storedTab);
  const [sort, setSort] = useState<LibrarySort>("visited");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const workspaceId = workspace?._id ?? "";
  const pages = pagesByWorkspace[workspaceId] ?? EMPTY_PAGES;

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of membersByWorkspace ?? []) {
      if (member.name) map.set(member.userId, member.name);
    }
    for (const persona of personas) {
      if (persona.id && persona.name) map.set(persona.id, persona.name);
    }
    return map;
  }, [membersByWorkspace, personas]);

  const visited = useMemo(() => visitedAtByPage(recents), [recents]);
  const tabPages = useMemo(
    () => pagesForTab(tab, pages, recents, favoriteIds, activeUserId),
    [tab, pages, recents, favoriteIds, activeUserId],
  );
  const filtered = useMemo(() => filterByTitle(tabPages, query), [tabPages, query]);
  const nodes = useMemo(() => buildTree(filtered, sort, visited), [filtered, sort, visited]);

  const chooseTab = useCallback((next: LibraryTab) => {
    setTab(next);
    try {
      globalThis.localStorage?.setItem(TAB_KEY, next);
    } catch {
      /* private mode: the tab just does not persist */
    }
  }, []);

  const toggle = useCallback((pageId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  const openPage = useCallback((page: PageEntry) => {
    usePageStore.getState().openPage({ id: page._id, workspaceId: page.workspaceId, kind: "page", title: page.title, icon: page.icon });
  }, []);

  const addPage = useCallback(async (parentId: string | null) => {
    const users = useUserStore.getState();
    const activeWorkspace = users.activeWorkspace();
    if (!activeWorkspace) return;
    const page = await usePageStore.getState().addPage(
      activeWorkspace._id,
      "Untitled",
      users.activePageJwt() ?? "",
      parentId ?? undefined,
      { visibility: "private" },
    );
    if (!page) return;
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    usePageStore.getState().openPage({ id: page._id, workspaceId: activeWorkspace._id, kind: "page", title: page.title });
  }, []);

  return (
    <div role="region" aria-label="Library" className="flex h-full min-h-0 flex-col bg-[var(--osio-bg-page)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--osio-border-soft)] px-[clamp(18px,4cqw,48px)] py-5">
        <h1 className="mr-auto text-2xl font-semibold leading-8 text-[var(--osio-fg-default)]">Library</h1>
        <label className="flex h-8 min-w-[180px] items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 text-sm text-[var(--osio-fg-muted)] focus-within:border-[var(--osio-accent)]">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search pages</span>
          <input
            type="search"
            aria-label="Search pages"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
        </label>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 text-sm text-[var(--osio-fg-muted)]">
          <ArrowUpDown size={14} aria-hidden="true" />
          <span className="sr-only">Sort pages</span>
          <select
            aria-label="Sort pages"
            value={sort}
            onChange={(event) => setSort(event.target.value as LibrarySort)}
            className="h-full bg-transparent text-sm text-[var(--osio-fg-default)] outline-none"
          >
            {LIBRARY_SORTS.map((option) => <option key={option} value={option}>{SORT_LABELS[option]}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void addPage(null)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          <Plus size={14} aria-hidden="true" />
          New page
        </button>
      </header>

      <div role="tablist" aria-label="Library tabs" className="flex flex-wrap items-center gap-1 px-[clamp(18px,4cqw,48px)] py-2">
        {TAB_LABELS.map((entry) => {
          const selected = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => chooseTab(entry.id)}
              className={`rounded-full px-3 py-1 text-sm transition-colors duration-(--osio-dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${
                selected
                  ? "bg-[var(--osio-bg-subtle)] font-medium text-[var(--osio-fg-default)]"
                  : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-[clamp(18px,4cqw,48px)] pb-10">
        {tab === "skills" ? (
          <LibrarySkills workspaceId={workspaceId} />
        ) : (
          <>
            <div className={`${LIBRARY_GRID} h-8 border-b border-[var(--osio-border-default)] text-xs font-medium text-[var(--osio-fg-muted)]`}>
              <div className="px-2" style={{ paddingLeft: 10 }}>Page name</div>
              <div className="px-2">Created by</div>
              <div className="px-2">Source</div>
              <div className="px-2">Last visited</div>
              <div className="px-2">Last edited</div>
            </div>
            {nodes.length === 0 ? (
              <p className="px-2 py-8 text-sm text-[var(--osio-fg-muted)]">No pages here yet.</p>
            ) : (
              <LibraryTree
                nodes={nodes}
                names={names}
                workspaceName={workspace?.name ?? ""}
                visited={visited}
                expanded={expanded}
                onToggle={toggle}
                onOpen={openPage}
                onAddChild={(parentId) => void addPage(parentId)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

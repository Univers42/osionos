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
// Recents, Favorites, Shared, Private and Skills. The header is only the title
// and "New page"; filter, search and sort are icons at the end of the tab row.

import React, { useCallback, useMemo, useState } from "react";
import { AtSign, Clock, FileText, History, Lock, Plus, Sparkles, Star, Users, type LucideIcon } from "lucide-react";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceMembersStore } from "@/store/settings/useWorkspaceMembersStore";
import {
  buildTree, filterByCreator, filterByTitle, pagesForTab, parseLibraryTab,
  visitedAtByPage, type LibraryCreator, type LibrarySort, type LibraryTab,
} from "../model/pageLibraryModel";
import { LIBRARY_GRID, LibraryTree } from "./LibraryTree";
import { LibrarySkills } from "./LibrarySkills";
import { LibraryToolbar } from "./LibraryToolbar";

const TAB_KEY = "osionos:library:tab";
const EMPTY_PAGES: PageEntry[] = [];

const TAB_LABELS: Array<{ id: LibraryTab; label: string; Icon: LucideIcon }> = [
  { id: "recents", label: "Recents", Icon: Clock },
  { id: "favorites", label: "Favorites", Icon: Star },
  { id: "shared", label: "Shared", Icon: Users },
  { id: "private", label: "Private", Icon: Lock },
  { id: "skills", label: "Skills", Icon: Sparkles },
];

const COLUMNS: Array<{ label: string; Icon: LucideIcon }> = [
  { label: "Page name", Icon: FileText },
  { label: "Created by", Icon: AtSign },
  { label: "Source", Icon: Lock },
  { label: "Last visited time", Icon: Clock },
  { label: "Last edited time", Icon: History },
];

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
  const [creator, setCreator] = useState<LibraryCreator>("anyone");
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
  const pagesById = useMemo(() => new Map(pages.map((page) => [page._id, page])), [pages]);
  const filtered = useMemo(
    () => filterByTitle(filterByCreator(tabPages, creator, activeUserId), query),
    [tabPages, creator, activeUserId, query],
  );
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
      <header className="flex flex-wrap items-center gap-3 px-[clamp(18px,4cqw,48px)] pb-3 pt-8">
        <h1 className="mr-auto text-3xl font-bold leading-10 text-[var(--osio-fg-default)]">Library</h1>
        <button
          type="button"
          onClick={() => void addPage(null)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--osio-accent)] px-3 text-sm font-medium text-[var(--osio-accent-fg)] transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          <Plus size={14} aria-hidden="true" />
          New page
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1 px-[clamp(18px,4cqw,48px)] py-2">
        <div role="tablist" aria-label="Library tabs" className="flex flex-wrap items-center gap-1">
          {TAB_LABELS.map((entry) => {
            const selected = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseTab(entry.id)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm transition-colors duration-(--osio-dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${
                  selected
                    ? "bg-[var(--osio-bg-subtle)] font-medium text-[var(--osio-fg-default)]"
                    : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
                }`}
              >
                <entry.Icon size={14} aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </div>
        {tab === "skills" ? null : (
          <LibraryToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            creator={creator}
            onCreatorChange={setCreator}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-[clamp(18px,4cqw,48px)] pb-10">
        {tab === "skills" ? (
          <LibrarySkills workspaceId={workspaceId} />
        ) : (
          <>
            <div className={`${LIBRARY_GRID} h-9 min-w-[800px] border-b border-[var(--osio-border-default)] text-sm text-[var(--osio-fg-muted)]`}>
              {COLUMNS.map(({ label, Icon }, index) => (
                <div key={label} className={`flex min-w-0 items-center gap-1.5 ${index === 0 ? "pl-2.5 pr-2" : "px-2"}`}>
                  <Icon size={14} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
            {nodes.length === 0 ? (
              <p className="px-2 py-8 text-sm text-[var(--osio-fg-muted)]">No pages here yet.</p>
            ) : (
              <LibraryTree
                nodes={nodes}
                names={names}
                workspaceName={workspace?.name ?? ""}
                pagesById={pagesById}
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

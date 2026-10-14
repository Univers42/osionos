/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerRecents.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { isFavoritesEnabled } from "@/shared/config/featureFlags";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { favoritesForWorkspace } from "@/store/favorites/favoritesScope";
import { usePageStore } from "@/store/usePageStore";
import { FavoriteSidebarItem } from "../FavoriteSidebarItem";
import { RecentPageRow } from "../RecentPageRow";

/** Compact strip: the tree below is the main surface, so recents stay short. */
export const EXPLORER_RECENTS_CAP = 5;

interface StripSectionProps {
  label: string;
  children: React.ReactNode;
}

// The kit SidebarSection's header (label, then a chevron that shows on hover), made a
// real disclosure: it carries aria-expanded, and the body stays in the DOM when closed.
const StripSection: React.FC<StripSectionProps> = ({ label, children }) => {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <div>
      <div className="group relative mb-px flex h-[30px] items-center px-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="-mx-1.5 flex h-full min-w-0 flex-1 items-center gap-1 rounded-[6px] px-1.5 hover:bg-[var(--osio-bg-hover)]"
        >
          <span className="truncate text-[length:var(--osio-font-size-xs)] font-medium normal-case leading-none tracking-normal text-[var(--osio-fg-muted)]">
            {label}
          </span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={`shrink-0 text-[var(--osio-fg-subtle)] opacity-0 transition-transform duration-(--osio-dur-fast) group-hover:opacity-100 group-focus-within:opacity-100 ${open ? "" : "-rotate-90"}`}
          />
        </button>
      </div>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-px">
        {children}
      </div>
    </div>
  );
};

interface Props {
  activeWorkspaceId: string;
}

/** Favorites + Recents above the VFS tree. Renders nothing while both are empty. */
export const ExplorerRecents: React.FC<Props> = ({ activeWorkspaceId }) => {
  const activePageId = usePageStore((s) => s.activePage?.id ?? null);
  const openPage = usePageStore((s) => s.openPage);
  const recents = usePageStore(
    useShallow((s) => s.recents.filter((r) => r.workspaceId === activeWorkspaceId).slice(0, EXPLORER_RECENTS_CAP)),
  );
  const favoriteIds = useFavoritesStore((s) => s.pageIds);
  const pagesIndex = usePageStore((s) => s.pagesIndex);
  // A star belongs to one workspace; unscoped, stars bleed across workspaces.
  const workspaceFavoriteIds = useMemo(
    () => favoritesForWorkspace(favoriteIds, activeWorkspaceId, (id) => pagesIndex[id]?.workspaceId),
    [favoriteIds, pagesIndex, activeWorkspaceId],
  );
  const showFavorites = isFavoritesEnabled() && workspaceFavoriteIds.length > 0;

  if (!showFavorites && recents.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col pb-2">
      {showFavorites && (
        <StripSection label="Favorites">
          {workspaceFavoriteIds.map((id) => (
            <FavoriteSidebarItem key={id} pageId={id} activePageId={activePageId} onOpenPage={openPage} />
          ))}
        </StripSection>
      )}
      {recents.length > 0 && (
        <StripSection label="Recents">
          {recents.map((recent) => (
            <RecentPageRow key={recent.id} recent={recent} activePageId={activePageId} onOpenPage={openPage} />
          ))}
        </StripSection>
      )}
    </div>
  );
};

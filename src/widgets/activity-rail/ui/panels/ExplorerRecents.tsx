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

const StripSection: React.FC<StripSectionProps> = ({ label, children }) => {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-[26px] w-full items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]"
      >
        <ChevronDown size={12} className={open ? "" : "-rotate-90"} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
      <div id={bodyId} hidden={!open}>
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
    <div className="flex flex-col gap-1 px-2 pb-1.5">
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

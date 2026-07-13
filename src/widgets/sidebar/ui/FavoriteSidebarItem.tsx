/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   FavoriteSidebarItem.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Star } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { SidebarNavItem } from "./SidebarNavItem";
import { selectPageAccessEntry } from "./SidebarPageTree";

interface FavoriteSidebarItemProps {
  pageId: string;
  activePageId: string | null | undefined;
  onOpenPage: (page: ActivePage) => void;
}

/** One starred page in the sidebar Favorites section. Resolves title/icon from
 *  the loaded tree (reusing selectPageAccessEntry); hidden if the page is not
 *  loaded or not readable. The filled star unstars it. */
export const FavoriteSidebarItem: React.FC<FavoriteSidebarItemProps> = ({ pageId, activePageId, onOpenPage }) => {
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, pageId)));
  const accessContext = usePageAccessContext();
  const toggle = useFavoritesStore((s) => s.toggle);

  if (!page || !canReadPage(page, accessContext)) return null;

  return (
    <SidebarNavItem
      icon={<IconValueView value={page.icon ?? "icon:page"} size={14} />}
      label={page.title || "Untitled"}
      active={activePageId === pageId}
      onClick={() => onOpenPage({ id: pageId, workspaceId: page.workspaceId, kind: "page", title: page.title, icon: page.icon })}
      rightElement={
        <button
          type="button"
          title="Remove from favorites"
          aria-label="Remove from favorites"
          onClick={(event) => { event.stopPropagation(); void toggle(pageId); }}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--osio-accent)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
        >
          <Star size={13} fill="currentColor" />
        </button>
      }
    />
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageFavoriteButton.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Star } from "lucide-react";
import { isFavoritesEnabled } from "@/shared/config/featureFlags";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";

/** Star / unstar the current page. Persists via the favorites store (bridge). */
export const PageFavoriteButton: React.FC<{ pageId: string }> = ({ pageId }) => {
  const isFav = useFavoritesStore((s) => s.pageIds.includes(pageId));
  const toggle = useFavoritesStore((s) => s.toggle);
  if (!isFavoritesEnabled()) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle(pageId)}
      title={isFav ? "Remove from favorites" : "Add to favorites"}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFav}
      className="flex h-7 w-7 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
    >
      <Star size={16} fill={isFav ? "currentColor" : "none"} className={isFav ? "text-[var(--osio-accent)]" : undefined} />
    </button>
  );
};

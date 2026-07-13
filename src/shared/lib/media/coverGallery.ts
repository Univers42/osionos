/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverGallery.ts                                     :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Typed lazy loader for the built-in cover gallery (coverGallery.json — 253
// presets across 10 categories, every remote URL HTTP-verified at generation
// time by the scratchpad generator; regenerate by re-running it). The JSON is
// imported dynamically so it ships as its own chunk and never lands in the
// warm path.

import type { CoverPickerAsset } from "@/shared/lib/markengine/uiCollectionAssets";

export interface CoverGalleryCategory {
  id: string;
  label: string;
  /** "video" categories hold muted ambient video covers. */
  kind?: string;
  items: CoverPickerAsset[];
}

let cache: Promise<CoverGalleryCategory[]> | null = null;

/** Load the gallery once per session (own chunk, ~60KB). */
export function loadCoverGallery(): Promise<CoverGalleryCategory[]> {
  cache ??= import("./coverGallery.json").then(
    (mod) => (mod.default as { categories: CoverGalleryCategory[] }).categories,
  );
  return cache;
}

/**
 * Offline search across the built-in gallery: case-insensitive match on item
 * label, credit, and category label. Powers the picker's search field and the
 * Unsplash tab's no-network fallback (instead of a 3-tile stub).
 */
export function searchCoverGallery(
  categories: CoverGalleryCategory[],
  query: string,
  limit = 40,
): CoverPickerAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: CoverPickerAsset[] = [];
  for (const category of categories) {
    const catHit = category.label.toLowerCase().includes(q);
    for (const item of category.items) {
      if (hits.length >= limit) return hits;
      if (catHit ||
        item.label.toLowerCase().includes(q) ||
        item.credit?.toLowerCase().includes(q)) {
        hits.push(item);
      }
    }
  }
  return hits;
}

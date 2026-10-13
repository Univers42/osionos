/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collectionMedia.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What rendering a cover or a media block needs: no picker catalog. Resolving through
// ui-collection's picker tabs loaded its emoji and icon catalogs at boot, yet every picker
// item's value is itself a direct source (or a gradient, which callers paint themselves),
// so the tabs never contributed a URL that the value did not already carry.

export interface CoverPickerAsset {
  id: string;
  label: string;
  ref: string;
  previewUrl?: string;
  /** Smallest clip of a video asset: what a tile plays on hover instead of `ref`. */
  previewVideoUrl?: string;
  credit?: string;
  downloadLocation?: string;
  author?: string;
}

export interface ResolvedCollectionMediaAsset {
  label?: string;
  url?: string;
  thumbnailUrl?: string;
}

const URL_REF_PREFIX = 'url:';
const DIRECT_SOURCE = /^(https?:|data:|blob:)/i;

export function normalizeMediaSource(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith(URL_REF_PREFIX)) return value.slice(URL_REF_PREFIX.length);
  return value;
}

/** `url:<anything>` (a relative path included) or a bare http(s)/data/blob source. */
function directSourceOf(value: string): string | undefined {
  if (value.startsWith(URL_REF_PREFIX)) {
    return value.length > URL_REF_PREFIX.length ? value.slice(URL_REF_PREFIX.length) : undefined;
  }
  return DIRECT_SOURCE.test(value) ? value : undefined;
}

export function resolveCollectionMediaAsset(
  value: string | undefined,
  fallbackLabel?: string,
): ResolvedCollectionMediaAsset | null {
  const source = value ? directSourceOf(value) : undefined;
  if (source === undefined) return null;
  return { label: fallbackLabel, url: source, thumbnailUrl: source };
}

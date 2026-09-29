/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaAssetPickerUtils.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <djsurgeon83@gmail.com>           +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/29 18:03:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/29 18:03:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Strips outer whitespace and collapses multiple consecutive whitespace
 * characters into a single space.
 */
export function normalizeSearchQuery(rawQuery: string): string {
  return rawQuery.trim().replace(/\s+/g, " ");
}

/**
 * Validates whether an Unsplash search request should be initiated.
 */
export function shouldFetchUnsplash(
  kind: string,
  query: string,
  minLength = 2,
): boolean {
  if (kind !== "image") {
    return false;
  }
  const normalized = normalizeSearchQuery(query);
  return normalized.length >= minLength;
}

/**
 * Determines whether to display the Unsplash bridge fallback notice.
 */
export function resolveFallbackNotice(
  hasLoaded: boolean,
  itemsCount: number,
): string | null {
  if (hasLoaded && itemsCount === 0) {
    return "Showing local fallbacks until the bridge has an Unsplash key.";
  }
  return null;
}

/**
 * Generates descriptive screen-reader announcements for search status.
 */
export function formatSearchStatusAria(
  isLoading: boolean,
  itemsCount: number,
  hasLoaded: boolean,
): string {
  if (isLoading) {
    return "Searching images...";
  }
  if (!hasLoaded) {
    return "";
  }
  if (itemsCount === 0) {
    return "No Unsplash images found. Displaying fallback suggestions.";
  }
  return `Found ${itemsCount} ${itemsCount === 1 ? "image" : "images"}`;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageCascadeResult.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/**
 * Extracts cascade IDs from the server response body.
 * O(n) where n is the length of the cascadedIds/deletedIds array.
 *
 * @param body - The parsed JSON response body from the server
 * @param pageId - The root page ID that was acted upon
 * @param localDescendantIds - Local descendant IDs (root excluded) for fallback
 * @param field - Which field to read: "cascadedIds" (archive/restore) or "deletedIds" (delete)
 * @returns Array of IDs to apply the change to
 */
export function cascadeIdsFrom(
  body: unknown,
  pageId: string,
  localDescendantIds: readonly string[],
  field: "deletedIds" | "cascadedIds",
): string[] {
  // Non-object body → fallback
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    if (field === "cascadedIds") {
      return [pageId, ...localDescendantIds];
    }
    return [pageId, ...localDescendantIds];
  }

  const obj = body as Record<string, unknown>;
  const rawIds = obj[field];

  // Field missing or not an array → fallback
  if (!Array.isArray(rawIds)) {
    if (field === "cascadedIds") {
      return [pageId, ...localDescendantIds];
    }
    return [pageId, ...localDescendantIds];
  }

  // Keep only string items
  const stringIds = rawIds.filter((id): id is string => typeof id === "string");

  if (field === "cascadedIds") {
    // Server returns cascadedIds as descendants ONLY (root excluded)
    return [pageId, ...stringIds];
  }

  // deletedIds includes the root and all deleted descendants
  return stringIds;
}

/**
 * Applies archivedAt to pages whose IDs are in the given set.
 * Returns a new array with modified pages (only touched pages are new objects).
 * O(n) where n is pages.length.
 *
 * @param pages - The pages array to process
 * @param ids - Set of page IDs that should receive the archivedAt value
 * @param archivedAt - The ISO timestamp to set, or null to clear (restore)
 * @returns New array with updated pages
 */
export function applyArchived(
  pages: readonly PageEntry[],
  ids: ReadonlySet<string>,
  archivedAt: string | null,
): PageEntry[] {
  return pages.map((page) =>
    ids.has(page._id) ? { ...page, archivedAt } : page,
  );
}

/**
 * Removes pages whose IDs are in the given set.
 * Returns a new array containing only pages NOT in the ids set.
 * O(n) where n is pages.length.
 *
 * @param pages - The pages array to filter
 * @param ids - Set of page IDs to remove
 * @returns New array without the deleted pages
 */
export function applyDeleted(
  pages: readonly PageEntry[],
  ids: ReadonlySet<string>,
): PageEntry[] {
  return pages.filter((page) => !ids.has(page._id));
}
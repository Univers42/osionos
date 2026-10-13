/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorerPageIcon.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/**
 * Returns the icon value for a page row in the explorer.
 * - `undefined` when no page is associated (sandbox-only file).
 * - The page's own `icon` when non-empty.
 * - `"icon:table"` for a database page (has `databaseId`).
 * - `"icon:page"` for a regular page (legacy fallback).
 * O(1).
 */
export function explorerIconValue(
  page: Pick<PageEntry, "icon" | "databaseId"> | undefined,
): string | undefined {
  if (!page) return undefined;
  if (page.icon && page.icon.length > 0) return page.icon;
  if (page.databaseId) return "icon:table";
  return "icon:page";
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageIndex.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useMemo } from "react";

import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page";

import type { PageIndex } from "./pageIndex";
import { pageIndexFor } from "./pageIndexCache";

const NO_PAGES: readonly PageEntry[] = [];

/**
 * The page index of one workspace, rebuilt only when a page's index fields change.
 * Ponytail: the cache keys on workspace id and keeps the last pages array it saw, so a
 * workspace left behind (switched away from, logged out of) stays reachable through it,
 * blocks included, until the tab reloads; nothing drops it.
 */
export function usePageIndex(workspaceId: string): PageIndex {
  const pages = usePageStore((state) => state.pages[workspaceId]) ?? NO_PAGES;
  return useMemo(() => pageIndexFor(workspaceId, pages), [workspaceId, pages]);
}

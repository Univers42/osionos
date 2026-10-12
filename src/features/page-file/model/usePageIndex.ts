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

import { buildPageIndex, type PageIndex } from "./pageIndex";

const NO_PAGES: readonly PageEntry[] = [];

/**
 * The page index of one workspace, rebuilt only when its pages array changes identity.
 * Ponytail: any page edit replaces the array and rebuilds the whole index (O(n log n) per
 * edit) — fine for thousands of pages, unmeasured above that.
 */
export function usePageIndex(workspaceId: string): PageIndex {
  const pages = usePageStore((state) => state.pages[workspaceId]) ?? NO_PAGES;
  return useMemo(() => buildPageIndex(pages), [pages]);
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileText.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

import { pageToFile } from "./pageFileCodec";

const textByPage = new WeakMap<PageEntry, string>();

/**
 * `pageToFile`, computed once per page object. The page store replaces a page object on every
 * change, so a cached text is always the current one: listing, stat and the outbound diff pay the
 * serializer only for pages that changed (pageToFile: ~45 µs p95 for 40 blocks, 2.6 ms for 2 000,
 * tests/bench/page-file-codec.bench.ts, 2026-10-13). O(1) on a hit.
 * Ponytail: code that mutates a page object in place instead of replacing it gets stale text
 * here; none does today (store helpers copy on write).
 */
export function pageFileText(page: PageEntry): string {
  const cached = textByPage.get(page);
  if (cached !== undefined) return cached;
  const text = pageToFile(page);
  textByPage.set(page, text);
  return text;
}

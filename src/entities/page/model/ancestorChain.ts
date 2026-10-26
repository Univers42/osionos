/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ancestorChain.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "./types";

/**
 * Walk parentPageId from `page` up to the workspace root. Returns root→page. An
 * ancestor missing from `all` ends the walk, and so does a parentPageId cycle.
 */
export function ancestorChain(page: PageEntry, all: readonly PageEntry[]): PageEntry[] {
  const byId = new Map(all.map((p) => [p._id, p]));
  const chain: PageEntry[] = [];
  const seen = new Set<string>();
  let cur: PageEntry | undefined = page;
  while (cur && !seen.has(cur._id)) {
    seen.add(cur._id);
    chain.unshift(cur);
    cur = cur.parentPageId ? byId.get(cur.parentPageId) : undefined;
  }
  return chain;
}

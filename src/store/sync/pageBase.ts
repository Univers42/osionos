/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageBase.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The BASE of a page: the server copy the client last saw — its content version and its
 * content. It is what makes a conflict MERGEABLE: the client sends the version it read,
 * and when the server refuses that version the three sides (the base, the local copy,
 * the server's copy) are merged instead of one of them being dropped.
 *
 * Where the base comes from: a load (the content the bridge answered), a 200 (the server
 * now holds exactly what was sent), a 409's details (the server's copy). Where it goes:
 * the next PATCH carries the version, and the pending record carries it too, so a reload
 * still knows which version its edit was made against (C29).
 *
 * The CONTENT is memory only: it is a copy of a copy of the server's row, and a reload
 * does not bring it back. A base without content is a version alone — enough to PATCH
 * against, not enough to merge — and the merge refuses to guess without it (C25).
 * The VERSION also lives on the page itself (`contentVersion`), so it survives a reload
 * in the pending record; the registry is the memory that holds the content beside it.
 */

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";

/** What the client knows of the server's copy of a page. */
export interface PageBase {
  /** The server's content version the client last saw (null when it never saw one). */
  version: number | null;
  /** The server's content the client last saw (null when it has none — after a reload). */
  content: Block[] | null;
}

const bases = new Map<string, PageBase>();

/**
 * The base of a page: the registry's, else the version the page itself carries (the one
 * a pending record kept across a reload — with no content beside it, so a conflict on
 * that page is a merge the client cannot do).
 */
export function baseFor(page: PageEntry): PageBase {
  const known = bases.get(page._id);
  if (known) return known;
  const version = typeof page.contentVersion === "number" ? page.contentVersion : null;
  return { version, content: null };
}

/** Remember the server's copy the client just saw (a load, a 200, a 409's details). */
export function setBase(pageId: string, version: number | null, content: Block[] | null): void {
  bases.set(pageId, { version, content });
}

/** The version the outbox PATCHes against — what the pending record carries. */
export function baseVersionOf(page: PageEntry): number | null {
  return baseFor(page).version;
}

/** Drop the base of a page that left the store: its version is nobody's business now. */
export function clearBase(pageId: string): void {
  bases.delete(pageId);
}

/** Drop the bases of the pages that left the store (the flush knows which ones those are). */
export function pruneBases(liveIds: ReadonlySet<string>): void {
  for (const pageId of [...bases.keys()]) {
    if (!liveIds.has(pageId)) bases.delete(pageId);
  }
}

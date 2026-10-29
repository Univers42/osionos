/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishedPages.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pure half of the Published pages panel: what a published row is, the
 * word its status gets, the URL the public copy is reachable at, and how a
 * bridge body is read. Nothing here touches the network, the DOM or the
 * clock, so the canvas runner can prove all of it.
 */

/** The two states the bridge reports (P5-5-b). */
export type PublishedPageStatus = "live" | "outdated";

/** One published page, exactly the six fields the bridge route returns. */
export interface PublishedPage {
  pageId: string;
  token: string;
  title: string;
  icon: string;
  publishedAt: string;
  status: PublishedPageStatus;
}

/**
 * The bridge mints 32 lowercase hex characters (scripts/bridge-public.mjs).
 * The token is a bearer secret: only this shape may reach a URL.
 */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isPublishedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * "Live" is the snapshot status: the public copy is current. A copy that
 * cannot be proven current is out of date — never live.
 */
export function statusLabel(status: PublishedPageStatus): string {
  return status === "live" ? "Live" : "Out of date";
}

/**
 * The public URL of a published page. The token is a path segment of that URL
 * and nothing else: it never travels in a query string, where it would land
 * in a log. A token that is not the bridge's shape builds no URL at all, so a
 * hostile token can never reach an href.
 */
export function publicUrlFor(token: string, origin: string): string | null {
  if (!isPublishedToken(token)) return null;
  return `${origin.replace(/\/+$/, "")}/p/${token}`;
}

/** A string field of a bridge row; the snapshot's title and icon may be absent. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The body of GET /api/account/published-pages. A body that is not the shape
 * the route documents yields no row instead of an exception: the panel shows
 * what it could read and never crashes on a hostile one.
 * Caveat: a row whose status is neither word is read as out of date — the
 * status is an advisory signal (the page's updated_at is client-supplied), so
 * a copy that cannot be proven current is not shown as live.
 */
export function parsePublishedPages(body: unknown): PublishedPage[] {
  if (typeof body !== "object" || body === null) return [];
  const rows = (body as { pages?: unknown }).pages;
  if (!Array.isArray(rows)) return [];
  const pages: PublishedPage[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const entry = row as Record<string, unknown>;
    const token = entry.token;
    const pageId = entry.pageId;
    if (!isPublishedToken(token)) continue;
    if (typeof pageId !== "string" || pageId.trim() === "") continue;
    pages.push({
      pageId,
      token,
      title: text(entry.title),
      icon: text(entry.icon),
      publishedAt: text(entry.publishedAt),
      status: entry.status === "live" ? "live" : "outdated",
    });
  }
  return pages;
}

/** The message a failed bridge call carries, for the panel to show it. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The published pages could not be loaded.";
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publicPageSignal.ts                                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public-page signal.
 *
 * A published page lives at `/p/:token`, and the public view is mounted on
 * that route BEFORE the app and its auth (src/app/main.tsx) — so an
 * unauthenticated visitor never boots the editor. That makes the PATH the one
 * signal a block has: the public view and the app view share the read-only
 * renderer (PageBlocksRenderer), so nothing downstream can tell them apart
 * but the route.
 *
 * The same prefix is what the public view itself reads to find its token
 * (src/pages/public/usePublicPage.ts), so the two agree by construction.
 */

/** The route a published page is served on. */
export const PUBLIC_PAGE_PATH_PREFIX = "/p/";

/** True when this path is a published page. */
export function isPublicPagePath(pathname: string): boolean {
  return pathname.startsWith(PUBLIC_PAGE_PATH_PREFIX);
}

/** True when this document is a published page. */
export function isPublicPage(): boolean {
  return isPublicPagePath(globalThis.location?.pathname ?? "");
}

/**
 * May a diagram read another page?
 *
 * A published page may NOT (devil C110): it is a snapshot of what the author
 * saw, and the tree of a shared workspace is not part of it. Every kind of the
 * closed spec is a placeholder there — the hand-written mermaid, the page tree,
 * the two database kinds, and the GRAPH kind, the one that would read the
 * bridge to draw the links of a page.
 *
 * The rule is here, in the file that owns the signal, so the adapters ask it
 * before they read anything.
 */
export function mayReadOtherPages(isPublic: boolean): boolean {
  return !isPublic;
}

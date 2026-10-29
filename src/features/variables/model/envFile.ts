/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   envFile.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

export const ENV_FILE_TITLE = "env.json";
// One page is capped at 128 KB by the edge (bridge-api.mjs EDGE_PAGE_BODY_LIMIT_BYTES), so a
// place outgrows one file by splitting it: env.<topic>.json pages are read with its env.json.
const ENV_TITLE_RE = /^env(?:\.[\w-]+)?\.json$/;

/** env.json or an env.<topic>.json; the surface check runs first, so a plain page costs one compare. */
export function isEnvPage(page: PageEntry): boolean {
  return page.surface === "code" && ENV_TITLE_RE.test(page.title) && !page.archivedAt;
}

/** The env.json directly under `parentPageId`, or at the workspace root when it is omitted. */
export function findEnvPage(pages: readonly PageEntry[] | undefined, parentPageId?: string): PageEntry | undefined {
  return pages?.find((p) => isEnvPage(p) && p.title === ENV_FILE_TITLE && (p.parentPageId ?? undefined) === parentPageId);
}

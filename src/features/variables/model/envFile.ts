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

export function isEnvPage(page: PageEntry): boolean {
  return page.surface === "code" && page.title === ENV_FILE_TITLE && !page.archivedAt;
}

/** The env.json directly under `parentPageId`, or at the workspace root when it is omitted. */
export function findEnvPage(pages: readonly PageEntry[] | undefined, parentPageId?: string): PageEntry | undefined {
  return pages?.find((p) => isEnvPage(p) && (p.parentPageId ?? undefined) === parentPageId);
}

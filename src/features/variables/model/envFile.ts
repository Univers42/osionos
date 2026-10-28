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

/** The workspace's variables file: a root-level code page titled `env.json`. */
export function findEnvPage(pages: readonly PageEntry[] | undefined): PageEntry | undefined {
  return pages?.find((p) => p.surface === "code" && p.title === ENV_FILE_TITLE && !p.parentPageId && !p.archivedAt);
}

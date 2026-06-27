/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   searchPeople.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * People palette branch for the top-bar search. Searches the bridge directory
 * (bridge-profile contract) and maps each person to a `kind: 'person'`
 * PaletteResult whose run() opens their profile tab. Kept in this sibling file
 * so search.ts stays under its function budget.
 */

import { searchDirectory } from "@/shared/social/directoryApi";
import { profileTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { PaletteResult } from "./search";

/** Bridge directory search → person palette rows (open profile on select). */
/** True when the query targets people explicitly (`user:<name>`). */
export function isPeopleQuery(query: string): boolean {
  return /^user:/i.test(query.trim());
}

export async function searchPeoplePalette(query: string, limit = 6): Promise<PaletteResult[]> {
  let trimmed = query.trim();
  // `user:<name>` prefix → people search; the name need NOT be exact (the bridge
  // does trigram/substring fuzzy matching). Strip the prefix, widen the limit.
  const explicit = isPeopleQuery(trimmed);
  if (explicit) trimmed = trimmed.slice(trimmed.indexOf(":") + 1).trim();
  if (!trimmed) return [];
  const people = await searchDirectory({ q: trimmed, limit: explicit ? limit * 3 : limit });
  return people.map((person) => ({
    id: `person:${person.id}`,
    title: person.name,
    subtitle: person.headline ?? person.username ?? "Person",
    kind: "person" as const,
    run: () => useWorkspaceLayout.getState().openTab(profileTab(person.id, person.name)),
  }));
}

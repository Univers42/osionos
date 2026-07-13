/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConnections.helpers.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "../model/types";
import { asStringArray } from "./pageProperties.helpers";

export interface PageRef {
  id: string;
  title: string;
  surface?: PageEntry["surface"];
}

function toRef(page: PageEntry): PageRef {
  return { id: page._id, title: page.title, surface: page.surface };
}

/** The folder/page that contains this page (its parentPageId), if any. */
export function parentRef(page: PageEntry | undefined, all: readonly PageEntry[]): PageRef | null {
  if (!page?.parentPageId) return null;
  const parent = all.find((candidate) => candidate._id === page.parentPageId);
  return parent ? toRef(parent) : null;
}

/** Direct, non-archived children of this page (its folder/file contents). */
export function childRefs(pageId: string, all: readonly PageEntry[]): PageRef[] {
  return all.filter((page) => page.parentPageId === pageId && !page.archivedAt).map(toRef);
}

/** Pages whose relation-typed properties reference this page (incoming links / backlinks). */
export function backlinkRefs(pageId: string, all: readonly PageEntry[]): PageRef[] {
  return all
    .filter((page) =>
      page._id !== pageId &&
      !page.archivedAt &&
      (page.properties ?? []).some(
        (property) => property.type === "relation" && asStringArray(property.value).includes(pageId),
      ),
    )
    .map(toRef);
}

/** Union two ref lists by id (relation backlinks ∪ inline [[page]] backlinks). */
export function mergeRefs(primary: readonly PageRef[], extra: readonly PageRef[]): PageRef[] {
  const byId = new Map(primary.map((ref) => [ref.id, ref]));
  for (const ref of extra) if (!byId.has(ref.id)) byId.set(ref.id, ref);
  return [...byId.values()];
}

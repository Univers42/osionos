/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   directorySource.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Directory = the "Add members" gallery. Lists org people (or a search), each
 *  card opens a peek with Connect. The bridge already hides directory_opt_out
 *  people and never returns emails — do not re-add either. */

import type { NotionState } from "@notion-db/object-database";
import type { DatabaseSchema } from "@notion-db/contract-types";
import { fetchPeople, searchDirectory } from "@/shared/social/directoryApi";
import { DIR, PEOPLE_DB, PEOPLE_VIEW, personPage, singleDatabaseState, view, type PeopleCtx } from "./peopleModel";

const SCHEMA: DatabaseSchema = {
  id: PEOPLE_DB.directory,
  name: "People directory",
  icon: "🧭",
  description: "People you can connect with.",
  titlePropertyId: DIR.name,
  properties: {
    [DIR.name]: { id: DIR.name, name: "Name", type: "title" },
    [DIR.username]: { id: DIR.username, name: "Username", type: "text" },
    [DIR.headline]: { id: DIR.headline, name: "Headline", type: "text" },
    [DIR.online]: { id: DIR.online, name: "Online", type: "checkbox" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.directoryGallery, databaseId: PEOPLE_DB.directory, name: "Gallery", type: "gallery",
    visibleProperties: [DIR.headline, DIR.username],
    settings: { cardPreview: "page_cover", cardSize: "medium", fitMedia: true, showTitle: true, openPagesIn: "side_peek" },
  }),
  view({
    id: PEOPLE_VIEW.directoryTable, databaseId: PEOPLE_DB.directory, name: "Table", type: "table",
    visibleProperties: [DIR.username, DIR.headline, DIR.online],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
];

/** Build the directory gallery (empty query → list the org). */
export async function buildDirectoryState(ctx: PeopleCtx): Promise<NotionState> {
  const q = ctx.query.trim();
  const people = q ? await searchDirectory({ q, limit: 60 }) : await fetchPeople("org");
  const pages = people.map((person) =>
    personPage(PEOPLE_DB.directory, person.id, {
      [DIR.name]: person.name,
      [DIR.username]: person.username ?? null,
      [DIR.headline]: person.headline ?? null,
      [DIR.online]: Boolean(person.online),
    }, { cover: person.avatar }));
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

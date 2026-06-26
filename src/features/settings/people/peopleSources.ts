/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleSources.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The five People sources as a descriptor map: which database/views to mount,
 *  how to build the state, and what create/search affordances the panel shows. */

import type { NotionState } from "@notion-db/object-database";
import { PEOPLE_DB, PEOPLE_VIEW, type PeopleCtx, type PeopleSourceKey } from "./peopleModel";
import { buildContactsState } from "./contactsSource";
import { buildDirectoryState } from "./directorySource";
import { buildGroupsState } from "./groupsSource";
import { buildGuestsState } from "./guestsSource";
import { buildMembersState } from "./membersSource";

export interface SourceView {
  id: string;
  label: string;
  type: "table" | "gallery";
}

export interface SourceDescriptor {
  databaseId: string;
  /** First view is the default; >1 shows a table/gallery toggle. */
  views: SourceView[];
  build: (ctx: PeopleCtx) => Promise<NotionState>;
  /** Show a search box (directory). */
  search?: boolean;
  /** Show a "Connect" action in the row peek (directory). */
  connect?: boolean;
  /** Header create button + which create flow to open. */
  create?: { label: string; kind: "group" | "guest" };
}

export const PEOPLE_SOURCES: Record<PeopleSourceKey, SourceDescriptor> = {
  contacts: {
    databaseId: PEOPLE_DB.contacts,
    views: [
      { id: PEOPLE_VIEW.contactsTable, label: "Table", type: "table" },
      { id: PEOPLE_VIEW.contactsGallery, label: "Gallery", type: "gallery" },
    ],
    build: buildContactsState,
  },
  directory: {
    databaseId: PEOPLE_DB.directory,
    views: [
      { id: PEOPLE_VIEW.directoryGallery, label: "Gallery", type: "gallery" },
      { id: PEOPLE_VIEW.directoryTable, label: "Table", type: "table" },
    ],
    build: buildDirectoryState,
    search: true,
    connect: true,
  },
  groups: {
    databaseId: PEOPLE_DB.groups,
    views: [{ id: PEOPLE_VIEW.groupsTable, label: "Table", type: "table" }],
    build: buildGroupsState,
    create: { label: "New group", kind: "group" },
  },
  guests: {
    databaseId: PEOPLE_DB.guests,
    views: [{ id: PEOPLE_VIEW.guestsTable, label: "Table", type: "table" }],
    build: buildGuestsState,
    create: { label: "Invite guest", kind: "guest" },
  },
  members: {
    databaseId: PEOPLE_DB.members,
    views: [{ id: PEOPLE_VIEW.membersTable, label: "Table", type: "table" }],
    build: buildMembersState,
  },
};

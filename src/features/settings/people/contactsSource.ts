/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   contactsSource.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Contacts = accepted connections (`/api/connections`). Read projection; the
 *  peek removes via removeConnection. Email is never exposed (the bridge omits
 *  it from the connections payload — keep it that way). */

import type { NotionState } from "@notion-db/object-database";
import type { DatabaseSchema } from "@notion-db/contract-types";
import { listConnections } from "@/shared/social/connectionApi";
import { CONTACT, PEOPLE_DB, PEOPLE_VIEW, personPage, singleDatabaseState, view } from "./peopleModel";

const SCHEMA: DatabaseSchema = {
  id: PEOPLE_DB.contacts,
  name: "Contacts",
  icon: "👥",
  description: "People you have connected with.",
  titlePropertyId: CONTACT.name,
  properties: {
    [CONTACT.name]: { id: CONTACT.name, name: "Name", type: "title" },
    [CONTACT.headline]: { id: CONTACT.headline, name: "Headline", type: "text" },
    [CONTACT.online]: { id: CONTACT.online, name: "Online", type: "checkbox" },
    [CONTACT.since]: { id: CONTACT.since, name: "Connected", type: "date" },
    // Hidden: the peer user id (page id is the connection id) — used by the peek.
    [CONTACT.peer]: { id: CONTACT.peer, name: "User id", type: "text" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.contactsTable, databaseId: PEOPLE_DB.contacts, name: "Table", type: "table",
    sorts: [{ id: "contacts-since", propertyId: CONTACT.since, direction: "desc" }],
    visibleProperties: [CONTACT.headline, CONTACT.online, CONTACT.since],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
  view({
    id: PEOPLE_VIEW.contactsGallery, databaseId: PEOPLE_DB.contacts, name: "Gallery", type: "gallery",
    visibleProperties: [CONTACT.headline],
    settings: { cardPreview: "page_cover", cardSize: "medium", fitMedia: true, showTitle: true, openPagesIn: "side_peek" },
  }),
];

/** Build the Contacts state from accepted connections. */
export async function buildContactsState(): Promise<NotionState> {
  const edges = await listConnections({ status: "accepted" });
  const pages = edges.map((edge) =>
    personPage(PEOPLE_DB.contacts, edge.id, {
      [CONTACT.name]: edge.peer.name,
      [CONTACT.headline]: edge.peer.headline ?? null,
      [CONTACT.online]: Boolean(edge.peer.online),
      [CONTACT.since]: edge.createdAt,
      [CONTACT.peer]: edge.peer.id,
    }, { cover: edge.peer.avatar }));
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

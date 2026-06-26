/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   groupsSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Groups = the groups you belong to, grouped by kind: group chats
 *  (`osionos_channels` kind='group') ⊕ communities (`osionos_communities`).
 *  Row id encodes the source (`channel:<id>` / `community:<id>`) so the peek
 *  knows which it is. Read projection; message content is never exposed. */

import type { NotionState } from "@notion-db/object-database";
import type { DatabaseSchema } from "@notion-db/contract-types";
import { fetchChannels } from "@/shared/chat/channelApi";
import { listCommunities } from "@/shared/social/communityApi";
import { GROUP, PEOPLE_DB, PEOPLE_VIEW, personPage, selectOptions, singleDatabaseState, view, type PeopleCtx } from "./peopleModel";

const KIND_CHAT = "Group chat";
const KIND_COMMUNITY = "Community";

const SCHEMA: DatabaseSchema = {
  id: PEOPLE_DB.groups,
  name: "Groups",
  icon: "🫂",
  description: "Groups and communities you belong to.",
  titlePropertyId: GROUP.name,
  properties: {
    [GROUP.name]: { id: GROUP.name, name: "Name", type: "title" },
    [GROUP.kind]: { id: GROUP.kind, name: "Kind", type: "select", options: selectOptions([KIND_CHAT, KIND_COMMUNITY]) },
    [GROUP.role]: { id: GROUP.role, name: "Your role", type: "text" },
    [GROUP.since]: { id: GROUP.since, name: "Joined", type: "date" },
    // Hidden: "channel" | "community" — routes the peek.
    [GROUP.src]: { id: GROUP.src, name: "Source", type: "text" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.groupsTable, databaseId: PEOPLE_DB.groups, name: "Table", type: "table",
    grouping: { propertyId: GROUP.kind, sort: "alphabetical" },
    visibleProperties: [GROUP.kind, GROUP.role, GROUP.since],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
];

/** Build the Groups state from group channels ⊕ communities the user is in. */
export async function buildGroupsState(ctx: PeopleCtx): Promise<NotionState> {
  const [channels, communities] = await Promise.all([
    fetchChannels(ctx.workspaceId).catch(() => []),
    listCommunities().catch(() => []),
  ]);
  const pages = [
    ...channels.filter((channel) => channel.kind === "group").map((channel) =>
      personPage(PEOPLE_DB.groups, `channel:${channel.id}`, {
        [GROUP.name]: channel.name,
        [GROUP.kind]: KIND_CHAT,
        [GROUP.role]: channel.memberRole ?? "member",
        [GROUP.since]: channel.createdAt,
        [GROUP.src]: "channel",
      }, { cover: channel.avatar })),
    ...communities.map((community) =>
      personPage(PEOPLE_DB.groups, `community:${community.id}`, {
        [GROUP.name]: community.name,
        [GROUP.kind]: KIND_COMMUNITY,
        [GROUP.role]: community.memberRole ?? "member",
        [GROUP.since]: community.createdAt,
        [GROUP.src]: "community",
      }, { cover: community.avatar })),
  ];
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

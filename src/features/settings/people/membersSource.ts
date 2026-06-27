/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   membersSource.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Members = workspace membership (useWorkspaceMembersStore). The notion view
 *  is the display; role change / transfer / remove happen in the peek through
 *  the existing store actions (so the transfer-ownership confirm is preserved).
 *  Names/avatars resolve from the local personas (the member row has no name). */

import type { NotionState } from "@notion-db/object-database";
import type { DatabaseSchema } from "@notion-db/contract-types";
import { useWorkspaceMembersStore } from "@/store/settings";
import { MEMBER, PEOPLE_DB, PEOPLE_VIEW, personPage, selectOptions, singleDatabaseState, view, type PeopleCtx } from "./peopleModel";

const SCHEMA: DatabaseSchema = {
  id: PEOPLE_DB.members,
  name: "Members",
  icon: "🧑‍🤝‍🧑",
  description: "Members of this workspace and their roles.",
  titlePropertyId: MEMBER.name,
  properties: {
    [MEMBER.name]: { id: MEMBER.name, name: "Name", type: "title" },
    [MEMBER.role]: { id: MEMBER.role, name: "Role", type: "select", options: selectOptions(["owner", "admin", "member", "guest"]) },
    [MEMBER.since]: { id: MEMBER.since, name: "Joined", type: "date" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.membersTable, databaseId: PEOPLE_DB.members, name: "Table", type: "table",
    grouping: { propertyId: MEMBER.role, sort: "alphabetical" },
    visibleProperties: [MEMBER.role, MEMBER.since],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
];

/** Build the Members state from the workspace-members store (page id = userId). */
export async function buildMembersState(ctx: PeopleCtx): Promise<NotionState> {
  const members = useWorkspaceMembersStore.getState().data[ctx.workspaceId] ?? [];
  const personaById = new Map(ctx.personas.map((persona) => [persona.id, persona]));
  const pages = members.map((member) => {
    const persona = personaById.get(member.userId);
    return personPage(PEOPLE_DB.members, member.userId, {
      [MEMBER.name]: persona?.name ?? member.userId,
      [MEMBER.role]: member.role,
      [MEMBER.since]: member.joinedAt,
    }, { icon: persona?.emoji });
  });
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   guestsSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Guests = people invited (by email) who are not connections. v1 sources from
 *  the workspace email-invites already hydrated in useWorkspaceInvitesStore — no
 *  new backend. ponytail: the true guest is a per-page read-only collaborator
 *  (osionos_pages.collaborators); upgrade to a /api/guests aggregation later. */

import type { NotionState } from "@notion-db/object-database";
import type { DatabaseSchema } from "@notion-db/contract-types";
import { useWorkspaceInvitesStore } from "@/store/settings";
import { GUEST, PEOPLE_DB, PEOPLE_VIEW, personPage, selectOptions, singleDatabaseState, view, type PeopleCtx } from "./peopleModel";
import { optionId } from "@/widgets/database-view/model/workspaceDatabaseMappers";

const SCHEMA: DatabaseSchema = {
  id: PEOPLE_DB.guests,
  name: "Guests",
  icon: "✉️",
  description: "People invited by email (read-only).",
  titlePropertyId: GUEST.email,
  properties: {
    [GUEST.email]: { id: GUEST.email, name: "Email", type: "title" },
    [GUEST.role]: { id: GUEST.role, name: "Role", type: "select", options: selectOptions(["admin", "member", "guest"]) },
    [GUEST.status]: { id: GUEST.status, name: "Status", type: "select", options: selectOptions(["pending", "accepted", "revoked"]) },
    [GUEST.since]: { id: GUEST.since, name: "Invited", type: "date" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.guestsTable, databaseId: PEOPLE_DB.guests, name: "Table", type: "table",
    visibleProperties: [GUEST.role, GUEST.status, GUEST.since],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
];

function inviteStatus(invite: { acceptedAt?: string | null; revokedAt?: string | null }): string {
  if (invite.revokedAt) return "revoked";
  return invite.acceptedAt ? "accepted" : "pending";
}

/** Build the Guests state from every workspace invite; a revoked one stays listed as Revoked. */
export async function buildGuestsState(ctx: PeopleCtx): Promise<NotionState> {
  const invites = useWorkspaceInvitesStore.getState().data[ctx.workspaceId] ?? [];
  const pages = invites
    .map((invite) =>
      personPage(PEOPLE_DB.guests, invite._id, {
        [GUEST.email]: invite.email,
        [GUEST.role]: optionId(invite.role),
        [GUEST.status]: optionId(inviteStatus(invite)),
        [GUEST.since]: invite.createdAt,
      }));
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   guestsSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
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
    [GUEST.status]: { id: GUEST.status, name: "Status", type: "select", options: selectOptions(["pending", "accepted", "revoked", "expired"]) },
    [GUEST.expires]: { id: GUEST.expires, name: "Expires", type: "date" },
    [GUEST.since]: { id: GUEST.since, name: "Invited", type: "date" },
  },
};

const VIEWS = [
  view({
    id: PEOPLE_VIEW.guestsTable, databaseId: PEOPLE_DB.guests, name: "Table", type: "table",
    visibleProperties: [GUEST.email, GUEST.role, GUEST.status, GUEST.expires, GUEST.since],
    settings: { showRowNumbers: false, openPagesIn: "side_peek" },
  }),
];

/** Status cell of one invite. `now` (epoch ms) is passed in — never read inside — so the
 *  mapping stays pure and every row of one build is classified against the same instant.
 *  Accepted and revoked are facts; only a still-pending invite can expire. */
export function inviteStatus(
  invite: { acceptedAt?: string | null; revokedAt?: string | null; expiresAt?: string | null },
  now: number,
): "pending" | "accepted" | "revoked" | "expired" {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  return invite.expiresAt && new Date(invite.expiresAt).getTime() < now ? "expired" : "pending";
}

/** Build the Guests state from every workspace invite; a revoked one stays listed as Revoked. */
export async function buildGuestsState(ctx: PeopleCtx): Promise<NotionState> {
  const invites = useWorkspaceInvitesStore.getState().data[ctx.workspaceId] ?? [];
  const now = Date.now();
  const pages = invites
    .map((invite) =>
      personPage(PEOPLE_DB.guests, invite._id, {
        [GUEST.email]: invite.email,
        [GUEST.role]: optionId(invite.role),
        [GUEST.status]: optionId(inviteStatus(invite, now)),
        [GUEST.expires]: invite.expiresAt,
        [GUEST.since]: invite.createdAt,
      }));
  return singleDatabaseState(SCHEMA, VIEWS, pages);
}

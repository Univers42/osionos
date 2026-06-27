/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleModel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Shared building blocks for the People settings databases. Each "source"
 * (contacts / directory / groups / guests / members) maps an existing bridge
 * client or settings store into a notion-database-sys NotionState — the views
 * are READ projections; all writes go through the existing clients (no new
 * backend, no persistState diff). See peopleSourceAdapter + PeopleDatabasePanel.
 */

import type { NotionState, Page } from "@notion-db/object-database";
import type { SelectOption, ViewConfig } from "@notion-db/contract-types";
import type { StaticPersona } from "@/features/auth";

export type PeopleSourceKey = "contacts" | "directory" | "groups" | "guests" | "members";

/** Stable database ids — one notion database per People tab. */
export const PEOPLE_DB: Record<PeopleSourceKey, string> = {
  contacts: "people-contacts",
  directory: "people-directory",
  groups: "people-groups",
  guests: "people-guests",
  members: "people-members",
};

/** View ids. Sources with two entries expose a table/gallery toggle. */
export const PEOPLE_VIEW = {
  contactsTable: "people-contacts-table",
  contactsGallery: "people-contacts-gallery",
  directoryGallery: "people-directory-gallery",
  directoryTable: "people-directory-table",
  groupsTable: "people-groups-table",
  guestsTable: "people-guests-table",
  membersTable: "people-members-table",
} as const;

/** Property ids, namespaced per database so ids never collide. */
export const CONTACT = { name: "c-name", headline: "c-headline", online: "c-online", since: "c-since", peer: "c-peer" } as const;
export const DIR = { name: "d-name", username: "d-username", headline: "d-headline", online: "d-online" } as const;
export const GROUP = { name: "g-name", kind: "g-kind", role: "g-role", members: "g-members", since: "g-since", src: "g-src" } as const;
export const GUEST = { email: "gu-email", role: "gu-role", status: "gu-status", since: "gu-since" } as const;
export const MEMBER = { name: "m-name", role: "m-role", since: "m-since" } as const;

/** Read context handed to every source builder. */
export interface PeopleCtx {
  workspaceId: string;
  activeUserId: string;
  personas: StaticPersona[];
  /** Directory search box; empty → list the org. */
  query: string;
}

/** Tailwind tag classes (token-backed) the select renderer expects. */
const TAG_COLORS = [
  "bg-accent-muted text-accent-text-bold",
  "bg-success-surface-muted text-success-text-tag",
  "bg-warning-surface-muted text-warning-text-tag",
  "bg-violet-surface-muted text-violet-text-tag",
  "bg-cyan-surface-muted text-cyan-text-tag",
  "bg-surface-muted text-ink-strong",
];

/** Distinct, stable, coloured select options for a fixed value set. */
export function selectOptions(values: string[]): SelectOption[] {
  return values.map((value, index) => ({
    id: `opt-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opt"}`,
    value,
    color: TAG_COLORS[index % TAG_COLORS.length],
  }));
}

/** A view with the contract defaults filled in (mirrors workspaceDatabaseSchema). */
export function view(
  config: Partial<ViewConfig> & Pick<ViewConfig, "id" | "databaseId" | "name" | "type">,
): ViewConfig {
  return { filters: [], filterConjunction: "and", sorts: [], visibleProperties: [], settings: {}, ...config };
}

/** Build one notion Page (a person/group/guest row). Avatar → cover (gallery card). */
export function personPage(
  databaseId: string,
  id: string,
  properties: Record<string, unknown>,
  opts: { cover?: string | null; icon?: string } = {},
): Page {
  const at = new Date().toISOString();
  return {
    id,
    databaseId,
    cover: opts.cover ?? undefined,
    icon: opts.icon,
    properties,
    content: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "system",
    lastEditedBy: "system",
  };
}

/** A NotionState holding exactly one database + its views + its rows. */
export function singleDatabaseState(
  database: NotionState["databases"][string],
  views: ViewConfig[],
  pages: Page[],
): NotionState {
  return {
    databases: { [database.id]: database },
    views: Object.fromEntries(views.map((entry) => [entry.id, entry])),
    pages: Object.fromEntries(pages.map((entry) => [entry.id, entry])),
  };
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceSpaces.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 03:20:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 03:20:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every workspace has two spaces in the sidebar: Private, the signed-in user's
// own pages that nobody else in the workspace sees, and Shared, what the whole
// workspace sees. Before, Private existed only in a workspace the user owned,
// so a member of an organisation had nowhere to keep a page to themselves.

import type { PageEntry } from "@/entities/page";

interface WorkspaceRef {
  _id: string;
}

export interface WorkspaceSpaces {
  /** Workspaces that get a Private section: the active one, always. */
  privateWorkspaces: WorkspaceRef[];
  /** Workspaces owned by someone else: their Shared section lists every page the user can read there. */
  sharedWorkspaces: WorkspaceRef[];
}

const NO_WORKSPACES: WorkspaceRef[] = [];

export function workspaceSpaces(activeWorkspaceId: string, ownerId: string, userId: string): WorkspaceSpaces {
  if (!activeWorkspaceId) return { privateWorkspaces: NO_WORKSPACES, sharedWorkspaces: NO_WORKSPACES };
  const active = [{ _id: activeWorkspaceId }];
  return { privateWorkspaces: active, sharedWorkspaces: ownerId === userId ? NO_WORKSPACES : active };
}

type SpacePage = Pick<PageEntry, "ownerId" | "visibility" | "surface">;

/** A page that belongs in the user's Private section of a workspace they do not
 *  own: theirs, and private. Other members' private pages never reach the
 *  client (the bridge filters them), and legacy pages without an owner are the
 *  workspace's, so they stay in Shared. */
export function isMyPrivatePage(page: SpacePage, userId: string): boolean {
  if (page.surface === "agent" || page.surface === "home") return false;
  if (page.visibility === "shared" || page.visibility === "public") return false;
  return Boolean(userId) && page.ownerId === userId;
}

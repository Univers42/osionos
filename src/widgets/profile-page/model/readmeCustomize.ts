/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readmeCustomize.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Customize": the owner's README page is created on the first click and linked to the
 * profile through the account route; later clicks open the page that is linked.
 */

import type { PageEntry } from "@/entities/page";
import type { AccountProfileOutcome, AccountProfilePatch } from "@/shared/api/accountProfileApi";

export interface CustomizeDeps {
  loadProfile: () => Promise<AccountProfileOutcome>;
  saveProfile: (patch: AccountProfilePatch, version: number) => Promise<AccountProfileOutcome>;
  findPage: (pageId: string) => PageEntry | null;
  createPage: (workspaceId: string) => Promise<PageEntry | null>;
}

export type CustomizeResult = { ok: true; page: PageEntry } | { ok: false; message: string };

/** The workspace the README lives in: the active one when the user owns it, else the first owned. */
export function pickReadmeWorkspace(
  userId: string,
  activeWorkspaceId: string,
  workspaces: ReadonlyArray<{ _id: string; ownerId: string }>,
): string | null {
  const owned = workspaces.filter((workspace) => workspace.ownerId === userId);
  return owned.find((workspace) => workspace._id === activeWorkspaceId)?._id ?? owned[0]?._id ?? null;
}

// Caveat: one retry on a 412. A second concurrent edit loses and reports a failure; a page
// created before the link fails is left behind (an ordinary private page); and a linked page
// the page store has not loaded is read as missing, so it is replaced by a fresh README.
async function linkPage(deps: CustomizeDeps, pageId: string, version: number): Promise<boolean> {
  const first = await deps.saveProfile({ readmePageId: pageId }, version);
  if (first.ok) return true;
  if (first.reason !== "conflict" || first.version === null) return false;
  return (await deps.saveProfile({ readmePageId: pageId }, first.version)).ok;
}

export async function customizeReadme(deps: CustomizeDeps, workspaceId: string | null): Promise<CustomizeResult> {
  const loaded = await deps.loadProfile();
  if (!loaded.ok) {
    return { ok: false, message: loaded.reason === "unavailable" ? "Profiles are not available on this server." : "Could not load your profile. Try again." };
  }
  const linked = loaded.profile.readmePageId ? deps.findPage(loaded.profile.readmePageId) : null;
  if (linked && !linked.archivedAt) return { ok: true, page: linked };
  if (!workspaceId) return { ok: false, message: "You need a workspace of your own to keep a README in." };
  const page = await deps.createPage(workspaceId);
  if (!page) return { ok: false, message: "Could not create your README. Try again." };
  if (!(await linkPage(deps, page._id, loaded.version))) {
    return { ok: false, message: "Your README was created but could not be linked to your profile. Try again." };
  }
  return { ok: true, page };
}

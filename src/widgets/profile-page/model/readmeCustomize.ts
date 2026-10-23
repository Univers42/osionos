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

export type LinkedPage = { status: "found"; page: PageEntry } | { status: "gone" } | { status: "error" };

export interface CustomizeDeps {
  loadProfile: () => Promise<AccountProfileOutcome>;
  saveProfile: (patch: AccountProfilePatch, version: number) => Promise<AccountProfileOutcome>;
  openLinked: (pageId: string) => Promise<LinkedPage>;
  createPage: (workspaceId: string) => Promise<PageEntry | null>;
}

/** `linkedGone`: the profile links a page that cannot be opened; only the owner's explicit choice replaces it. */
export type CustomizeResult = { ok: true; page: PageEntry } | { ok: false; message: string; linkedGone?: true };

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
// created before the link fails is left behind (an ordinary private page).
async function linkPage(deps: CustomizeDeps, pageId: string, version: number): Promise<boolean> {
  const first = await deps.saveProfile({ readmePageId: pageId }, version);
  if (first.ok) return true;
  if (first.reason !== "conflict" || first.version === null) return false;
  return (await deps.saveProfile({ readmePageId: pageId }, first.version)).ok;
}

export async function customizeReadme(
  deps: CustomizeDeps,
  workspaceId: string | null,
  replaceLinked = false,
): Promise<CustomizeResult> {
  const loaded = await deps.loadProfile();
  if (!loaded.ok) {
    return { ok: false, message: loaded.reason === "unavailable" ? "Profiles are not available on this server." : "Could not load your profile. Try again." };
  }
  const linkedId = loaded.profile.readmePageId;
  if (linkedId && !replaceLinked) {
    const linked = await deps.openLinked(linkedId);
    if (linked.status === "found") return { ok: true, page: linked.page };
    if (linked.status === "gone") {
      return { ok: false, linkedGone: true, message: "Your README page was deleted or archived, so it cannot be opened." };
    }
    return { ok: false, message: "Could not open your README. Try again." };
  }
  if (!workspaceId) return { ok: false, message: "You need a workspace of your own to keep a README in." };
  const page = await deps.createPage(workspaceId);
  if (!page) return { ok: false, message: "Could not create your README. Try again." };
  if (!(await linkPage(deps, page._id, loaded.version))) {
    return { ok: false, message: "Your README was created but could not be linked to your profile. Try again." };
  }
  return { ok: true, page };
}

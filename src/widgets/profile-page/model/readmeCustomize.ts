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
  /** True once the session that started the action is no longer the active one. */
  accountChanged?: () => boolean;
}

export interface LinkedPageIo {
  readStore: (pageId: string) => PageEntry | undefined;
  fetchPage: (pageId: string) => Promise<PageEntry | null>;
  pullWorkspace: (workspaceId: string) => Promise<void>;
  isNotFound: (error: unknown) => boolean;
}

/**
 * Opens the linked page by id. A tab only renders pages that are in the page store, and the
 * page's workspace may never have been pulled, so a fetched page is pulled in and re-read:
 * absent after the pull is "error" (never "gone"), so nothing is ever replaced on a guess.
 */
export async function openLinkedById(pageId: string, io: LinkedPageIo): Promise<LinkedPage> {
  const stored = io.readStore(pageId);
  if (stored) return stored.archivedAt ? { status: "gone" } : { status: "found", page: stored };
  try {
    const fetched = await io.fetchPage(pageId);
    if (!fetched) return { status: "error" };
    if (fetched.archivedAt) return { status: "gone" };
    await io.pullWorkspace(fetched.workspaceId);
    const loaded = io.readStore(pageId);
    if (!loaded) return { status: "error" };
    return loaded.archivedAt ? { status: "gone" } : { status: "found", page: loaded };
  } catch (error) {
    return io.isNotFound(error) ? { status: "gone" } : { status: "error" };
  }
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

type LinkOutcome = "linked" | "failed" | "account-changed";
const ACCOUNT_CHANGED = "The account changed; nothing was linked.";

// Caveat: one retry on a 412. A second concurrent edit loses and reports a failure; a page
// created before the link fails is left behind (an ordinary private page).
// The save signs with the session active when it is sent, so each PATCH is preceded by a check
// that the account which clicked is still the active one: a switch would link onto the other row.
// The account client reads its token before its first await, so check and send share one tick.
async function linkPage(deps: CustomizeDeps, pageId: string, version: number): Promise<LinkOutcome> {
  if (deps.accountChanged?.()) return "account-changed";
  const first = await deps.saveProfile({ readmePageId: pageId }, version);
  if (first.ok) return "linked";
  if (first.reason !== "conflict" || first.version === null) return "failed";
  if (deps.accountChanged?.()) return "account-changed";
  return (await deps.saveProfile({ readmePageId: pageId }, first.version)).ok ? "linked" : "failed";
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
  if (deps.accountChanged?.()) return { ok: false, message: ACCOUNT_CHANGED };
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
  const linked = await linkPage(deps, page._id, loaded.version);
  if (linked === "account-changed") {
    // The page stays where it was made, an ordinary private page of the account that clicked.
    return { ok: false, message: `${ACCOUNT_CHANGED} The README page already created stays in the other account as a private page.` };
  }
  if (linked === "failed") {
    return { ok: false, message: "Your README was created but could not be linked to your profile. Try again." };
  }
  return { ok: true, page };
}

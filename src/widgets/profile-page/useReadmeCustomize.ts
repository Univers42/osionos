/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useReadmeCustomize.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The README entry point shared by the owner's "Customize" button and the empty-README row:
 * opens the linked README page, creating it on the first call.
 */

import { useState } from "react";

import { useUserStore } from "@/features/auth";
import { ApiError, api } from "@/shared/api/client";
import { fetchAccountProfile, saveAccountProfile, type AccountProfilePatch } from "@/shared/api/accountProfileApi";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";
import { usePageStore } from "@/store/usePageStore";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { PageEntry } from "@/entities/page";
import { customizeReadme, openLinkedById, pickReadmeWorkspace, type CustomizeDeps, type LinkedPage } from "./model/readmeCustomize";

function openLinked(pageId: string, jwt: string): Promise<LinkedPage> {
  const store = usePageStore.getState();
  return openLinkedById(pageId, {
    readStore: (id) => usePageStore.getState().pageById(id),
    fetchPage: (id) => api.get<PageEntry>(`/api/pages/${encodeURIComponent(id)}`, jwt),
    // force: the freshness TTL would skip a workspace pulled moments ago that did not list the page.
    pullWorkspace: (workspaceId) => store.fetchPages(workspaceId, jwt, true),
    isNotFound: (error) => error instanceof ApiError && error.status === 404,
  });
}

// The row the save returns goes into the account store, so the Profile field slash item
// (gated on the store's readmePageId) shows on the README at once, not after the next hydrate.
async function saveAndSync(patch: AccountProfilePatch, version: number) {
  const outcome = await saveAccountProfile(patch, version);
  if (outcome.ok) useAccountProfileStore.setState({ status: "ready", profile: outcome.profile, version: outcome.version, error: null });
  return outcome;
}

function readmeDeps(jwt: string): CustomizeDeps {
  const store = usePageStore.getState();
  return {
    loadProfile: fetchAccountProfile,
    saveProfile: saveAndSync,
    openLinked: (pageId) => openLinked(pageId, jwt),
    createPage: (id) => store.addPage(id, "README", jwt, undefined, { surface: "page" }),
  };
}

export function useReadmeCustomize() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [gone, setGone] = useState(false);

  const customize = async (replaceLinked = false) => {
    const user = useUserStore.getState();
    const session = user.sessions[user.activeUserId];
    const workspaceId = pickReadmeWorkspace(
      user.activeUserId,
      user.activeWorkspaceByUser[user.activeUserId] ?? "",
      session?.privateWorkspaces ?? [],
    );
    setBusy(true);
    setMessage("");
    setGone(false);
    const result = await customizeReadme(readmeDeps(user.activePageJwt() ?? ""), workspaceId, replaceLinked);
    setBusy(false);
    if (result.ok) useWorkspaceLayout.getState().openTab(pageEntryToTab(result.page));
    else {
      setMessage(result.message);
      setGone(result.linkedGone === true);
    }
  };

  return { busy, message, gone, customize };
}

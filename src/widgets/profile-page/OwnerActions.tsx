/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   OwnerActions.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The owner's two entry points on their own profile: Edit profile (Settings) and Customize
 * (the README page, created on the first click). Only ProfileActions renders this, and only
 * for the signed-in user's own page.
 */

import React, { useState } from "react";

import { useUserStore } from "@/features/auth";
import { openSettings } from "@/features/settings/model/settingsNav";
import { ApiError, api } from "@/shared/api/client";
import { fetchAccountProfile, saveAccountProfile } from "@/shared/api/accountProfileApi";
import { usePageStore } from "@/store/usePageStore";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { PageEntry } from "@/entities/page";
import { customizeReadme, openLinkedById, pickReadmeWorkspace, type CustomizeDeps, type LinkedPage } from "./model/readmeCustomize";

const BUTTON = "inline-flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--osio-bg-hover)] disabled:opacity-60";

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

function readmeDeps(jwt: string): CustomizeDeps {
  const store = usePageStore.getState();
  return {
    loadProfile: fetchAccountProfile,
    saveProfile: saveAccountProfile,
    openLinked: (pageId) => openLinked(pageId, jwt),
    createPage: (id) => store.addPage(id, "README", jwt, undefined, { surface: "page" }),
  };
}

export const OwnerActions: React.FC = () => {
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

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => openSettings("profile", "public-profile")} className={BUTTON}>
          Edit profile
        </button>
        <button type="button" disabled={busy} onClick={() => void customize(false)} className={BUTTON}>
          Customize
        </button>
      </div>
      {message && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{message}</p>}
      {gone && (
        <button type="button" disabled={busy} onClick={() => void customize(true)} className={`mt-2 ${BUTTON}`}>
          Create a new README
        </button>
      )}
    </div>
  );
};

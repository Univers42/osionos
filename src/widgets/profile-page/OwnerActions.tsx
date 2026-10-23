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
import { customizeReadme, pickReadmeWorkspace, type CustomizeDeps, type LinkedPage } from "./model/readmeCustomize";

const BUTTON = "inline-flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--osio-bg-hover)] disabled:opacity-60";

// Opens by id: the store first, else the bridge. Archived or 404 is "gone"; any other failure
// is "error", which never leads to a replacement.
async function openLinked(pageId: string, jwt: string): Promise<LinkedPage> {
  const stored = usePageStore.getState().pageById(pageId);
  if (stored) return stored.archivedAt ? { status: "gone" } : { status: "found", page: stored };
  try {
    const page = await api.get<PageEntry>(`/api/pages/${encodeURIComponent(pageId)}`, jwt);
    if (!page) return { status: "error" };
    return page.archivedAt ? { status: "gone" } : { status: "found", page };
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? { status: "gone" } : { status: "error" };
  }
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

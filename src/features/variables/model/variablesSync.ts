/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variablesSync.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import { codeBlockOf } from "@/features/ide/model/codeFile";
import { getActivePageJwt } from "@/shared/api/client";
import { useUserPreferencesStore } from "@/store/settings/useUserPreferencesStore";
import { usePageStore } from "@/store/usePageStore";

import { isEnvPage } from "./envFile";
import { useVariablesStore, type EnvFileSource } from "./useVariablesStore";

const PREFERENCE_KEYS = ["language", "dateFormat", "timezone", "autoTimezone", "numberFormat"] as const;

/** `{{PAGE}}`, `{{page.X}}` and which env.json applies read these; nothing else of a page. */
function scopeFieldsChanged(next: readonly PageEntry[] | undefined, previous: readonly PageEntry[] | undefined): boolean {
  if (next === previous) return false;
  if (!next || !previous || next.length !== previous.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    const a = next[i];
    const b = previous[i];
    if (a === b) continue;
    if (a._id !== b._id || a.title !== b.title || a.properties !== b.properties || a.parentPageId !== b.parentPageId || a.archivedAt !== b.archivedAt) return true;
  }
  return false;
}

/**
 * Keeps `useVariablesStore` in step with each workspace's `env.json`, the user's
 * formatting preferences and the clock. Mounted once (useVariablesSync in App).
 */
export function startVariablesSync(): () => void {
  const requested = new Set<string>();

  const requestContent = (env: PageEntry) => {
    // Content is lazy; fetch it once per page. No session yet → try on a later change.
    const jwt = getActivePageJwt();
    if (!jwt || requested.has(env._id)) return;
    requested.add(env._id);
    void usePageStore.getState().fetchPageContent(env._id, jwt);
  };

  const syncWorkspace = (workspaceId: string, pages: readonly PageEntry[] | undefined) => {
    const files: EnvFileSource[] = [];
    for (const page of pages ?? []) {
      if (!isEnvPage(page)) continue;
      if (page.content === undefined) requestContent(page);
      else files.push({ pageId: page._id, title: page.title, parentPageId: page.parentPageId ?? null, source: codeBlockOf(page)?.content ?? "" });
    }
    useVariablesStore.getState().setFiles(workspaceId, files);
  };

  for (const [workspaceId, pages] of Object.entries(usePageStore.getState().pages)) syncWorkspace(workspaceId, pages);

  // A keystroke anywhere replaces its workspace's page array, so this runs per edit:
  // two linear scans of that workspace (tests/bench/variables.bench.ts measures them).
  const stopPages = usePageStore.subscribe((state, previous) => {
    if (state.pages === previous.pages) return;
    let scopeChanged = false;
    for (const workspaceId of new Set([...Object.keys(state.pages), ...Object.keys(previous.pages)])) {
      const next = state.pages[workspaceId];
      if (next === previous.pages[workspaceId]) continue;
      syncWorkspace(workspaceId, next);
      scopeChanged ||= scopeFieldsChanged(next, previous.pages[workspaceId]);
    }
    if (scopeChanged) useVariablesStore.getState().bump();
  });

  const stopPreferences = useUserPreferencesStore.subscribe((state, previous) => {
    if (PREFERENCE_KEYS.some((key) => state.data?.[key] !== previous.data?.[key])) useVariablesStore.getState().bump();
  });

  // NOW/TIME show minutes, so values move on the minute boundary, and again on wake.
  const bump = () => useVariablesStore.getState().bump();
  let interval: ReturnType<typeof setInterval> | undefined;
  const alignTimer = setTimeout(() => {
    bump();
    interval = setInterval(bump, 60_000);
  }, 60_000 - (Date.now() % 60_000));
  const onVisible = () => {
    if (document.visibilityState === "visible") bump();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopPages();
    stopPreferences();
    clearTimeout(alignTimer);
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

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

import { findEnvPage } from "./envFile";
import { useVariablesStore } from "./useVariablesStore";

const PREFERENCE_KEYS = ["language", "dateFormat", "timezone", "autoTimezone", "numberFormat"] as const;

/**
 * Keeps `useVariablesStore` in step with each workspace's `env.json`, the user's
 * formatting preferences and the clock. Mounted once (useVariablesSync in App).
 */
export function startVariablesSync(): () => void {
  const requested = new Set<string>();

  const syncWorkspace = (workspaceId: string, pages: readonly PageEntry[] | undefined) => {
    const env = findEnvPage(pages);
    const variables = useVariablesStore.getState();
    if (!env) return variables.forget(workspaceId);
    if (env.content === undefined) {
      // Content is lazy; fetch it once per page. No session yet → try on a later change.
      const jwt = getActivePageJwt();
      if (jwt && !requested.has(env._id)) {
        requested.add(env._id);
        void usePageStore.getState().fetchPageContent(env._id, jwt);
      }
      return;
    }
    variables.setSource(workspaceId, env._id, codeBlockOf(env)?.content ?? "");
  };

  for (const [workspaceId, pages] of Object.entries(usePageStore.getState().pages)) syncWorkspace(workspaceId, pages);

  // A keystroke anywhere replaces its workspace's page array, so this runs per edit:
  // one linear scan of that workspace (tests/bench/variables.bench.ts measures it).
  const stopPages = usePageStore.subscribe((state, previous) => {
    if (state.pages === previous.pages) return;
    for (const workspaceId of Object.keys(state.pages)) {
      if (state.pages[workspaceId] !== previous.pages[workspaceId]) syncWorkspace(workspaceId, state.pages[workspaceId]);
    }
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

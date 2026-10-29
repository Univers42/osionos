/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   preferences.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { UserPreferences } from "@/store/settings";
import {
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  OPEN_ON_START_OPTIONS,
  WEEK_START_OPTIONS,
  setAutoTimezone,
  setTimezone,
} from "@/features/settings/preferences/options";
import { createStoreRecordSource } from "@/entities/block/model/bindingSources";
import type { FieldSpec, RecordSource } from "@/entities/block/model/bindingSources";

export interface UserPreferencesStoreState {
  data: UserPreferences | null;
  loading: boolean;
  hydrate(userId: string): void | Promise<void>;
  update(patch: Partial<UserPreferences>): void;
}

export interface UserStoreState {
  activeUserId: string;
}

type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };

function getUpdate(store: StoreLike<UserPreferencesStoreState>): UserPreferencesStoreState["update"] | null {
  const state = store.getState();
  if (typeof state.update === "function") return state.update.bind(state);
  const candidate = (store as unknown as { update?: UserPreferencesStoreState["update"] }).update;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

function getHydrate(store: StoreLike<UserPreferencesStoreState>): UserPreferencesStoreState["hydrate"] | null {
  const state = store.getState();
  if (typeof state.hydrate === "function") return state.hydrate.bind(state);
  const candidate = (store as unknown as { hydrate?: UserPreferencesStoreState["hydrate"] }).hydrate;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

const fields: readonly FieldSpec[] = [
  { key: "enterAddsNewline", display: "switch", label: "Use Enter to add a new line" },
  { key: "numberFormat", display: "dropdown", label: "Number format", options: NUMBER_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
  { key: "privacy.textDirectionControls", display: "switch", label: "Always show text direction controls" },
  { key: "weekStart", display: "dropdown", label: "Start week", options: WEEK_START_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
  { key: "dateFormat", display: "dropdown", label: "Date format", options: DATE_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
  { key: "autoTimezone", display: "switch", label: "Set time zone automatically using your location" },
  { key: "timezone", display: "dropdown", label: "Time zone" },
  { key: "desktop.openOnStart", display: "dropdown", label: "Open on start", options: OPEN_ON_START_OPTIONS.map((option) => ({ value: option.value, label: option.label })) },
  { key: "privacy.viewHistory", display: "switch", label: "Show my view history" },
  { key: "privacy.profileDiscoverability", display: "switch", label: "Profile discoverability" },
];

export function createPreferencesSource(deps: {
  prefs: StoreLike<UserPreferencesStoreState>;
  user: StoreLike<UserStoreState>;
}): RecordSource {
  return createStoreRecordSource<UserPreferencesStoreState>({
    id: "settings:preferences",
    label: "Preferences",
    fields,
    store: deps.prefs,
    read: (state) => {
      const userState = deps.user.getState();
      if (!userState.activeUserId) return null;
      if (state.loading) return null;
      const data = (state.data ?? {}) as Record<string, unknown>;
      const privacy = (data.privacy ?? {}) as Record<string, unknown>;
      const desktop = (data.desktop ?? {}) as Record<string, unknown>;
      return {
        enterAddsNewline: data.enterAddsNewline ?? false,
        numberFormat: data.numberFormat ?? "default",
        "privacy.textDirectionControls": privacy.textDirectionControls ?? false,
        weekStart: data.weekStart ?? "monday",
        dateFormat: data.dateFormat ?? "relative",
        autoTimezone: data.autoTimezone ?? false,
        timezone: data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        "desktop.openOnStart": desktop.openOnStart ?? "last-visited-page",
        "privacy.viewHistory": privacy.viewHistory ?? true,
        "privacy.profileDiscoverability": privacy.profileDiscoverability ?? true,
      };
    },
    isLoading: (state) => !!deps.user.getState().activeUserId && state.loading,
    write: (patch) => {
      const field = Object.keys(patch)[0];
      const value = patch[field];
      const storeState = deps.prefs.getState();
      const data = storeState.data;
      const update = getUpdate(deps.prefs);
      if (!update) return;
      if (field === "enterAddsNewline") update({ enterAddsNewline: value as boolean });
      else if (field === "numberFormat") update({ numberFormat: String(value) });
      else if (field === "privacy.textDirectionControls") update({ privacy: { ...data?.privacy, textDirectionControls: value } });
      else if (field === "weekStart") update({ weekStart: value as UserPreferences["weekStart"] });
      else if (field === "dateFormat") update({ dateFormat: String(value) });
      else if (field === "autoTimezone") setAutoTimezone(Boolean(value), data, update);
      else if (field === "timezone") setTimezone(String(value), update);
      else if (field === "desktop.openOnStart") update({ desktop: { ...data?.desktop, openOnStart: value } });
      else if (field === "privacy.viewHistory") update({ privacy: { ...data?.privacy, viewHistory: value } });
      else if (field === "privacy.profileDiscoverability") update({ privacy: { ...data?.privacy, profileDiscoverability: value } });
    },
    load: () => {
      const userId = deps.user.getState().activeUserId;
      if (!userId) return;
      const hydrate = getHydrate(deps.prefs);
      if (hydrate) void hydrate(userId);
    },
  });
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notifications.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotificationSettings } from "@/store/settings";
import { NOTIFICATION_MODE_OPTIONS } from "@/features/settings/notifications/options";
import { createStoreRecordSource } from "@/entities/block/model/bindingSources";
import type { FieldSpec, RecordSource } from "@/entities/block/model/bindingSources";

export interface NotificationSettingsStoreState {
  data: NotificationSettings | null;
  loading: boolean;
  hydrate(userId: string): void | Promise<void>;
  update(patch: Partial<NotificationSettings>): void;
}

export interface UserStoreState {
  activeUserId: string;
}

type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };

function getUpdate(store: StoreLike<NotificationSettingsStoreState>): NotificationSettingsStoreState["update"] | null {
  const state = store.getState();
  if (typeof state.update === "function") return state.update.bind(state);
  const candidate = (store as unknown as { update?: NotificationSettingsStoreState["update"] }).update;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

function getHydrate(store: StoreLike<NotificationSettingsStoreState>): NotificationSettingsStoreState["hydrate"] | null {
  const state = store.getState();
  if (typeof state.hydrate === "function") return state.hydrate.bind(state);
  const candidate = (store as unknown as { hydrate?: NotificationSettingsStoreState["hydrate"] }).hydrate;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

const modeOptions = NOTIFICATION_MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

const fields: readonly FieldSpec[] = [
  { key: "inApp.liveMeetingActivity", display: "switch", label: "Live meeting activity" },
  { key: "slack.mode", display: "dropdown", label: "Slack notifications", options: modeOptions },
  { key: "discord.mode", display: "dropdown", label: "Discord notifications", options: modeOptions },
  { key: "email.workspaceActivity", display: "switch", label: "Activity in my workspace" },
  { key: "email.alwaysSend", display: "switch", label: "Always send email notifications" },
  { key: "email.pageUpdates", display: "switch", label: "Page updates" },
  { key: "email.workspaceDigest", display: "switch", label: "Workspace digest" },
  { key: "email.announcements", display: "switch", label: "Announcements and update emails" },
];

export function createNotificationsSource(deps: {
  notifications: StoreLike<NotificationSettingsStoreState>;
  user: StoreLike<UserStoreState>;
}): RecordSource {
  return createStoreRecordSource<NotificationSettingsStoreState>({
    id: "settings:notifications",
    label: "Notifications",
    fields,
    store: deps.notifications,
    read: (state) => {
      const userState = deps.user.getState();
      if (!userState.activeUserId) return null;
      if (state.loading) return null;
      const data = (state.data ?? {}) as Record<string, unknown>;
      const inApp = (data.inApp ?? {}) as Record<string, unknown>;
      const slack = (data.slack ?? {}) as Record<string, unknown>;
      const discord = (data.discord ?? {}) as Record<string, unknown>;
      const email = (data.email ?? {}) as Record<string, unknown>;
      return {
        "inApp.liveMeetingActivity": inApp.liveMeetingActivity ?? true,
        "slack.mode": slack.mode ?? "off",
        "discord.mode": discord.mode ?? "off",
        "email.workspaceActivity": email.workspaceActivity ?? true,
        "email.alwaysSend": email.alwaysSend ?? false,
        "email.pageUpdates": email.pageUpdates ?? true,
        "email.workspaceDigest": email.workspaceDigest ?? true,
        "email.announcements": email.announcements ?? true,
      };
    },
    isLoading: (state) => !!deps.user.getState().activeUserId && state.loading,
    write: (patch) => {
      const field = Object.keys(patch)[0];
      const value = patch[field];
      const storeState = deps.notifications.getState();
      const data = storeState.data;
      const update = getUpdate(deps.notifications);
      if (!update) return;
      if (field === "inApp.liveMeetingActivity") update({ inApp: { ...data?.inApp, liveMeetingActivity: value } });
      else if (field === "slack.mode") update({ slack: { ...data?.slack, mode: value } });
      else if (field === "discord.mode") update({ discord: { ...data?.discord, mode: value } });
      else if (field.startsWith("email.")) {
        const key = field.slice("email.".length);
        update({ email: { ...data?.email, [key]: value } });
      }
    },
    load: () => {
      const userId = deps.user.getState().activeUserId;
      if (!userId) return;
      const hydrate = getHydrate(deps.notifications);
      if (hydrate) void hydrate(userId);
    },
  });
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "@/features/auth";
import { useUserPreferencesStore } from "@/store/settings";
import { useNotificationSettingsStore } from "@/store/settings";
import { useVoiceSettingsStore } from "@/store/settings";
import { useAiSettingsStore } from "@/store/settings";
import { registerRecordSource } from "../model/sourceRegistry";
import { createPreferencesSource } from "./preferences";
import { createAccessibilitySource } from "./accessibility";
import { createNotificationsSource } from "./notifications";
import { createVoiceSource } from "./voice";
import { createAiSource } from "./ai";

const user = { getState: () => useUserStore.getState(), subscribe: (cb: Parameters<typeof useUserStore.subscribe>[0]) => useUserStore.subscribe(cb) };

registerRecordSource(createPreferencesSource({
  prefs: { getState: () => useUserPreferencesStore.getState(), subscribe: (cb) => useUserPreferencesStore.subscribe(cb) },
  user,
}));
registerRecordSource(createAccessibilitySource({ user }));
registerRecordSource(createNotificationsSource({
  notifications: { getState: () => useNotificationSettingsStore.getState(), subscribe: (cb) => useNotificationSettingsStore.subscribe(cb) },
  user,
}));
registerRecordSource(createVoiceSource({
  voice: { getState: () => useVoiceSettingsStore.getState(), subscribe: (cb) => useVoiceSettingsStore.subscribe(cb) },
  user,
}));
registerRecordSource(createAiSource({
  ai: { getState: () => useAiSettingsStore.getState(), subscribe: (cb) => useAiSettingsStore.subscribe(cb) },
  user,
}));

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voice.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { VoiceSettings } from "@/store/settings";
import { DICTATION_LANGUAGES } from "@/features/voice/api/voiceClient";
import { createStoreRecordSource } from "@/entities/block/model/bindingSources";
import type { FieldSpec, RecordSource } from "@/entities/block/model/bindingSources";

export interface VoiceSettingsStoreState {
  data: VoiceSettings;
  update(patch: Partial<VoiceSettings>): void;
}

export interface UserStoreState {
  activeUserId: string;
}

type StoreLike<S> = { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };

const LANGUAGE_LABELS: Record<string, string> = {
  auto: "Automatic (the model decides)",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
};

function getUpdate(store: StoreLike<VoiceSettingsStoreState>): VoiceSettingsStoreState["update"] | null {
  const state = store.getState();
  if (typeof state.update === "function") return state.update.bind(state);
  const candidate = (store as unknown as { update?: VoiceSettingsStoreState["update"] }).update;
  if (typeof candidate === "function") return candidate.bind(store);
  return null;
}

const fields: readonly FieldSpec[] = [
  {
    key: "dictationLanguage",
    display: "dropdown",
    label: "Dictation language",
    options: DICTATION_LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_LABELS[language] ?? language })),
  },
  { key: "readAloudVoiceURI", display: "dropdown", label: "Read-aloud voice" },
  { key: "readAloudRate", display: "number", label: "Read-aloud rate" },
  { key: "allowOnlineVoices", display: "checkbox", label: "Allow online voices" },
];

export function createVoiceSource(deps: {
  voice: StoreLike<VoiceSettingsStoreState>;
  user: StoreLike<UserStoreState>;
}): RecordSource {
  return createStoreRecordSource<VoiceSettingsStoreState>({
    id: "settings:voice",
    label: "Voice",
    fields,
    store: deps.voice,
    read: (state) => {
      const userState = deps.user.getState();
      if (!userState.activeUserId) return null;
      const data = state.data ?? state;
      return {
        dictationLanguage: data.dictationLanguage ?? "auto",
        readAloudVoiceURI: data.readAloudVoiceURI ?? "",
        readAloudRate: data.readAloudRate ?? 1,
        allowOnlineVoices: data.allowOnlineVoices ?? false,
      };
    },
    isLoading: () => false,
    write: (patch) => {
      const field = Object.keys(patch)[0];
      const value = patch[field];
      const update = getUpdate(deps.voice);
      if (!update) return;
      update({ [field]: value } as Partial<VoiceSettings>);
    },
  });
}

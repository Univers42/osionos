/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVoiceSettingsStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The voice settings: the language of the dictation, the voice of the
 * read-aloud, its rate, and the opt-in of the voices that are not local.
 *
 * The store is local (the settings of the browser, on this device): the
 * voices of a browser are the voices of that browser, so a voice URI means
 * nothing on another machine.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultVoiceSettings } from './defaults';
import { nowIso } from './settingsStoreUtils';
import type { VoiceSettings } from './types';

const STORE_NAME = 'osionos:settings:voice';

interface VoiceSettingsStore {
  data: VoiceSettings;
  update: (patch: Partial<VoiceSettings>) => void;
  reset: () => void;
}

export const useVoiceSettingsStore = create<VoiceSettingsStore>()(
  persist(
    (set, get) => ({
      data: defaultVoiceSettings(),
      update: (patch) => {
        set({ data: { ...get().data, ...patch, updatedAt: nowIso() } });
      },
      reset: () => {
        set({ data: defaultVoiceSettings() });
      },
    }),
    { name: STORE_NAME },
  ),
);

/** The voice settings, outside React. */
export function voiceSettings(): VoiceSettings {
  return useVoiceSettingsStore.getState().data;
}

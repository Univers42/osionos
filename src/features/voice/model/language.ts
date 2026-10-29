/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   language.ts                                        :+:      :+:    :+:   */
/*                                                    着           着    着     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  着       着        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The language of the dictation.
 *
 * The setting is a string the user picks; the service only knows the ones it
 * can transcribe. An unknown one is `auto`: the model decides.
 */

import { DICTATION_LANGUAGES, type DictationLanguage } from "../api/voiceClient";
import type { VoiceSettings } from "@/store/settings/types";

/** The language of the settings, or `auto`. */
export function dictationLanguage(settings: Pick<VoiceSettings, "dictationLanguage">): DictationLanguage {
  const asked = settings.dictationLanguage.trim().toLowerCase();
  return (DICTATION_LANGUAGES as readonly string[]).includes(asked)
    ? (asked as DictationLanguage)
    : "auto";
}

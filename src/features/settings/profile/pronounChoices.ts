/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pronounChoices.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pronoun choices: the profile stores one string (max 40), the form offers presets first and
 * a free input only behind "Custom". Which control a stored value maps to is decided here.
 */

export const PRONOUN_PRESETS = ["she/her", "he/him", "they/them", "prefer not to say"] as const;
export const PRONOUN_CUSTOM = "custom";
export const PRONOUN_MAX = 40;

export interface PronounSelection {
  /** "" (not shown), a preset, or PRONOUN_CUSTOM. */
  choice: string;
  custom: string;
}

export function pronounSelection(value: string): PronounSelection {
  if (!value) return { choice: "", custom: "" };
  if ((PRONOUN_PRESETS as readonly string[]).includes(value)) return { choice: value, custom: "" };
  return { choice: PRONOUN_CUSTOM, custom: value };
}

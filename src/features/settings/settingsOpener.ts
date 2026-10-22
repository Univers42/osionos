/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsOpener.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The door to the Settings center, for the widgets that live far from it.
 *
 * The Settings center keeps its own state in the app shell. A widget — the
 * chat's connector strip, for one — cannot reach it through props without
 * threading them through half the tree, so the shell registers its opener here
 * once and the widgets ask for a tab.
 *
 * Same shape as the inline AI's dependency registration: register once, ask
 * later, unregister on unmount.
 */

import { AI_CONNECTIONS_TAB, type AppSettingsTab } from "./appSettingsTab";

/** What the shell registers: open the Settings center on a tab. */
export type SettingsOpener = (tab: AppSettingsTab) => void;

let opener: SettingsOpener | null = null;

/** Registers the opener. The returned function unregisters it. */
export function registerSettingsOpener(fn: SettingsOpener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** Opens the Settings center on a tab. Does nothing when nothing registered one. */
export function openSettingsTab(tab: AppSettingsTab): void {
  opener?.(tab);
}

/** Opens the panel that connects the user's own model. */
export function openAiConnections(): void {
  openSettingsTab(AI_CONNECTIONS_TAB);
}

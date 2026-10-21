/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appSettingsTab.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The tabs of the Settings center, from the app's point of view.
 *
 * The shared kit owns the list of tabs every app has (`SettingsTab`). The app
 * adds its own on top — the AI connections panel — without touching the kit:
 * the kit is a submodule and stays untouched.
 */

import type { SettingsTab } from "@/shared/ui";

/** The tab of the AI connections panel. */
export const AI_CONNECTIONS_TAB = "ai_connections";

/** Every tab the Settings center can show. */
export type AppSettingsTab = SettingsTab | typeof AI_CONNECTIONS_TAB;

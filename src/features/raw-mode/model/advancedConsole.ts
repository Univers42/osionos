/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   advancedConsole.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Whether raw mode opens on the Advanced console (ADR 0064 PS22). A preference, not a feature
// flag: off by default, and a storage that is missing or throws (privacy modes, a full quota)
// leaves it off rather than breaking raw mode.
const ADVANCED_CONSOLE_KEY = "osio.raw.advanced";

export function readAdvancedConsole(): boolean {
  try {
    return globalThis.localStorage?.getItem(ADVANCED_CONSOLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdvancedConsole(isOn: boolean): void {
  try {
    globalThis.localStorage?.setItem(ADVANCED_CONSOLE_KEY, isOn ? "1" : "0");
  } catch {
    // Unwritable storage: the choice holds for this raw-mode session only.
  }
}

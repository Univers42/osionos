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
// leaves it off rather than breaking raw mode. A refused write holds for this session and is
// told once, like every preference (ADR 0056 A5).
import { noticingWriter } from "@/shared/lib/storage-full/noticingWrite";

const ADVANCED_CONSOLE_KEY = "osio.raw.advanced";
const writeChoice = noticingWriter("Advanced console choice");

export function readAdvancedConsole(): boolean {
  try {
    return globalThis.localStorage?.getItem(ADVANCED_CONSOLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdvancedConsole(isOn: boolean): void {
  writeChoice(ADVANCED_CONSOLE_KEY, isOn ? "1" : "0");
}

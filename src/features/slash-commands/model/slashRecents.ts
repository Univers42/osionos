/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashRecents.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The last distinct slash commands the user picked, most recent first. The menu
// shows them as its "Suggested" section; every storage access is guarded so a
// private window or blocked storage simply yields an empty list.

const STORAGE_KEY = "osionos.slash.recents.v1";
const MAX_RECENTS = 4;

/** Immutable: put `id` in front, drop its older occurrence, cap the list. */
export function pushRecent(
  list: readonly string[],
  id: string,
  max = MAX_RECENTS,
): string[] {
  const deduped = [id, ...list.filter((entry) => entry !== id)];
  return deduped.slice(0, Math.max(0, max));
}

export function readSlashRecents(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function recordSlashUse(id: string): void {
  try {
    const next = pushRecent(readSlashRecents(), id);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private window / blocked storage: recents are an enhancement, never an error.
  }
}

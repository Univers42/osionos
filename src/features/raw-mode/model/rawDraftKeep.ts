/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rawDraftKeep.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Raw mode's unsaved text, kept for this tab across a reload. Raw text lives only in the
// editor until Save, so the page store's leave guard never sees it, and a stale-chunk reload
// (ADR 0061) fires with no prompt. sessionStorage: this tab only, gone when the tab closes.
// The storage is passed as a getter and read inside the try: `globalThis.sessionStorage`
// itself throws a SecurityError where cookies are blocked.
//
// Caveat: a draft bigger than the tab's storage quota (about 5 MB) is not kept, silently, as
// before. A kept draft replaces the page on Save like any raw edit, including an edit made to
// that page elsewhere between the reload and the Save.

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DraftStorageSource = () => DraftStorage | null | undefined;

const tabStorage: DraftStorageSource = () => globalThis.sessionStorage;

/** One draft per user and page: `configKey` is pageConfigKey(userId, pageId). */
export function rawDraftKey(configKey: string): string {
  return `osio.raw.draft:${configKey}`;
}

export function readRawDraft(key: string, source: DraftStorageSource = tabStorage): string | null {
  try {
    return source()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function keepRawDraft(key: string, text: string, source: DraftStorageSource = tabStorage): void {
  try {
    source()?.setItem(key, text);
  } catch {
    // Refused (quota, privacy mode): the reload loses the draft, as it did before it was kept.
  }
}

export function dropRawDraft(key: string, source: DraftStorageSource = tabStorage): void {
  try {
    source()?.removeItem(key);
  } catch {
    // Unreadable storage holds no draft to drop.
  }
}

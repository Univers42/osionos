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
// (ADR 0061) fires with no prompt. sessionStorage is per tab, but it outlives the tab: a
// reopened tab (Ctrl+Shift+T) and a restored browser session bring it back. So a draft
// carries the time it was kept and is restored only within RAW_DRAFT_MAX_AGE_MS. The storage
// is passed as a getter and read inside the try: `globalThis.sessionStorage` itself throws a
// SecurityError where cookies are blocked.
//
// Caveat: a draft bigger than the tab's storage quota (about 5 MB) is not kept, silently, as
// before. A kept draft replaces the page on Save like any raw edit, including an edit made to
// that page elsewhere between the reload and the Save. The window trusts the wall clock: a
// reload more than 10 minutes after the last pagehide loses the draft, and a clock changed
// between the keep and the reload can drop a recent draft or restore an older one.

/** The target is a reload seconds later; a reopened tab or restored session is older than this. */
export const RAW_DRAFT_MAX_AGE_MS = 10 * 60_000;

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

function parseDraft(stored: string | null, now: number): string | null {
  if (stored === null) return null;
  try {
    const draft: unknown = JSON.parse(stored);
    if (typeof draft !== "object" || draft === null) return null;
    const { text, savedAt } = draft as { text?: unknown; savedAt?: unknown };
    if (typeof text !== "string" || typeof savedAt !== "number") return null;
    const age = now - savedAt;
    return age >= 0 && age <= RAW_DRAFT_MAX_AGE_MS ? text : null;
  } catch {
    return null;
  }
}

export function readRawDraft(key: string, source: DraftStorageSource = tabStorage, now = Date.now()): string | null {
  try {
    return parseDraft(source()?.getItem(key) ?? null, now);
  } catch {
    return null;
  }
}

export function keepRawDraft(key: string, text: string, source: DraftStorageSource = tabStorage, now = Date.now()): void {
  try {
    source()?.setItem(key, JSON.stringify({ text, savedAt: now }));
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

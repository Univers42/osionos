/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryServerViews.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 19:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 19:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Library views a workspace's owner and admins curate for every member, read from
 * and saved to the bridge (GET|PUT /api/workspaces/:id/library-views,
 * scripts/bridge-library-views.mjs). Whether this viewer curates is the bridge's answer
 * (`canCurate`), so the lock here and the bridge's 403 agree. A curator's edit shows at
 * once and is saved 800 ms after the last one, against the stamp last read: a 409 means
 * another admin saved first, and their views replace this tab's. A 403 relocks.
 *
 * Caveat: read once per user and workspace per tab — another admin's save shows after a
 * reload (or this tab's next conflict), not live.
 */

import { ApiError } from "@/shared/api/client";
import { useToastStore } from "@/shared/ui";
import { errorMessage, trySettingsGet, trySettingsPut } from "@/store/settings/settingsStoreUtils";

export interface LibraryServerViews {
  /** The curated views only (shipped views left as they ship); merged by mergeLibraryViews. */
  views: unknown;
  updatedAt: string | null;
  canCurate: boolean;
}

const SAVE_DEBOUNCE_MS = 800;
const known = new Map<string, LibraryServerViews>();
const requested = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const pathOf = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/library-views`;

function normalized(answer: Partial<LibraryServerViews>): LibraryServerViews {
  return {
    views: answer.views ?? {},
    updatedAt: typeof answer.updatedAt === "string" ? answer.updatedAt : null,
    canCurate: answer.canCurate === true,
  };
}

function toast(title: string, description?: string): void {
  useToastStore.getState().push({ kind: "error", title, description });
}

function fetchViews(key: string, workspaceId: string, onChange: () => void): void {
  trySettingsGet<LibraryServerViews>(pathOf(workspaceId)).then((answer) => {
    if (answer) known.set(key, normalized(answer));
    onChange();
  }, (error: unknown) => console.warn("[library] views unavailable", error));
}

/** What is known for this viewer, or null until the first read lands (locked meanwhile). */
export function libraryServerViews(userId: string, workspaceId: string, onChange: () => void): LibraryServerViews | null {
  const key = `${userId}:${workspaceId}`;
  if (!requested.has(key)) {
    requested.add(key);
    fetchViews(key, workspaceId, onChange);
  }
  return known.get(key) ?? null;
}

function refused(key: string, workspaceId: string, error: unknown, onChange: () => void): void {
  const current = known.get(key);
  if (error instanceof ApiError && error.status === 403 && current) {
    known.set(key, { ...current, canCurate: false });
    toast("You can no longer change the Library views", "Only a workspace owner or admin can.");
  } else if (error instanceof ApiError && error.status === 409) {
    toast("Another admin changed the Library views", "Showing their views now.");
  } else {
    toast("Library views not saved", errorMessage(error));
  }
  onChange();
  fetchViews(key, workspaceId, onChange);
}

async function save(key: string, workspaceId: string, onChange: () => void): Promise<void> {
  const current = known.get(key);
  if (!current?.canCurate) return;
  try {
    const answer = await trySettingsPut<LibraryServerViews>(pathOf(workspaceId), { views: current.views, baseUpdatedAt: current.updatedAt });
    if (!answer) return;
    const saved = normalized(answer);
    // An edit made while this one was in flight is still to be saved: keep it, take the stamp.
    known.set(key, timers.has(key) ? { ...(known.get(key) ?? saved), updatedAt: saved.updatedAt } : saved);
  } catch (error) {
    refused(key, workspaceId, error, onChange);
  }
}

/** A curator's edit: shown now, saved after the debounce. Anyone else never writes. */
export function saveLibraryViews(userId: string, workspaceId: string, views: unknown, onChange: () => void): void {
  const key = `${userId}:${workspaceId}`;
  const current = known.get(key);
  if (!current?.canCurate) return;
  known.set(key, { ...current, views });
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    void save(key, workspaceId, onChange);
  }, SAVE_DEBOUNCE_MS));
}

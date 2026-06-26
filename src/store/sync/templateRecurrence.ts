/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateRecurrence.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Client-side catch-up scheduler for template recurrence ("Duplicate every…").
 * On mount + on an interval it walks every template with a recurrence and, when
 * one is due, instantiates ONE page from it and advances the marker to the next
 * future slot (no backfill of missed periods). Idempotent across reloads: the
 * `nextDueAt` marker is persisted on the template via the page outbox, so a
 * closed app resumes correctly. Server-side scheduling is the long-term-correct
 * design; this is the pragmatic in-app path that works under `make all`.
 */

import { useEffect } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PageEntry, PageRecurrenceEvery } from "@/entities/page";

const TICK_MS = 60_000;

/** Advance an ISO timestamp by one recurrence period. */
function addInterval(from: Date, every: PageRecurrenceEvery): Date {
  const next = new Date(from);
  if (every === "day") next.setDate(next.getDate() + 1);
  else if (every === "week") next.setDate(next.getDate() + 7);
  else if (every === "month") next.setMonth(next.getMonth() + 1);
  return next;
}

/** Next future due time: walk forward from `from` until past `now` (cap iterations). */
function nextFutureDue(from: Date, every: PageRecurrenceEvery, now: number): string {
  let due = addInterval(from, every);
  for (let i = 0; i < 400 && due.getTime() <= now; i += 1) due = addInterval(due, every);
  return due.toISOString();
}

/** One scheduler pass over all workspaces' recurring templates. */
async function runTemplateRecurrenceOnce(): Promise<void> {
  const jwt = useUserStore.getState().activePageJwt() ?? "";
  if (!jwt) return; // online-only: never spawn unpersisted local pages
  const store = usePageStore.getState();
  const now = Date.now();

  const recurring: PageEntry[] = Object.values(store.pages)
    .flat()
    .filter((p) => p.isTemplate && !p.archivedAt && p.recurrence && p.recurrence.every !== "none");

  for (const template of recurring) {
    const every = template.recurrence?.every ?? "none";
    if (every === "none") continue;
    const nextDueAt = template.recurrence?.nextDueAt;
    if (!nextDueAt) {
      // First sight: schedule the first run for the next slot (no immediate create).
      store.patchTemplateRecurrence(template._id, { every, nextDueAt: nextFutureDue(new Date(now), every, now) });
      continue;
    }
    if (Date.parse(nextDueAt) > now) continue;
    const nowIso = new Date(now).toISOString();
    await usePageStore.getState().createPageFromTemplate(template._id, template.workspaceId, jwt, undefined, { open: false });
    store.patchTemplateRecurrence(template._id, {
      every,
      lastRunAt: nowIso,
      nextDueAt: nextFutureDue(new Date(now), every, now),
    });
  }
}

/** Mount once (e.g. in App): runs the scheduler now and every minute. */
export function useTemplateRecurrence(): void {
  useEffect(() => {
    void runTemplateRecurrenceOnce();
    const id = globalThis.setInterval(() => void runTemplateRecurrenceOnce(), TICK_MS);
    return () => globalThis.clearInterval(id);
  }, []);
}

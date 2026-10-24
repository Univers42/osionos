/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useModerationQueueStore.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The moderation panel's state: the reports of one status, the keyset cursor, and a message per
 * report. A decision never patches a row: the queue is read again from the first page and the
 * answer replaces the rows, so the panel shows what the bridge holds. A refused decision keeps
 * its row and says why in `rowErrors`.
 *
 * Caveat: the re-read after a decision restarts at page one, so pages added by "Load more"
 * collapse; `epoch` drops a late page after a reload, but a "Load more" fired while a reload is
 * in flight is ignored, not queued.
 */

import { create } from "zustand";

import { decideReport, listAdminReports, type AdminReport, type ReportDecision, type ReportStatus } from "./api";
import { isSavedDecision, moderationErrorCopy, SUSPEND_NEEDS_END } from "./moderationCopy";

const PAGE_SIZE = 25;
const MAX_SUSPEND_MS = 30 * 86_400_000;

/** True when `until` is a date after now and at most 30 days out; the bridge checks again. */
export function isSuspendEndValid(until: string | undefined, now = Date.now()): boolean {
  const end = until ? Date.parse(until) : NaN;
  return Number.isFinite(end) && end > now && end <= now + MAX_SUSPEND_MS;
}

interface QueueState {
  reports: AdminReport[];
  nextCursor: string | null;
  status: ReportStatus;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  rowErrors: Record<string, string>;
  busyId: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  setStatus: (status: ReportStatus) => Promise<void>;
  decide: (id: string, decision: ReportDecision, until?: string) => Promise<void>;
}

let epoch = 0;

export const useModerationQueueStore = create<QueueState>((set, get) => {
  async function fetchPage(cursor: string | null, replace: boolean): Promise<void> {
    const mine = ++epoch;
    set({ loading: true, error: null });
    try {
      const page = await listAdminReports({ status: get().status, cursor, limit: PAGE_SIZE });
      if (mine !== epoch) return;
      set((state) => ({ reports: replace ? page.reports : [...state.reports, ...page.reports], nextCursor: page.nextCursor, loading: false, loaded: true }));
    } catch (error) {
      if (mine !== epoch) return;
      set({ loading: false, loaded: true, error: moderationErrorCopy(error) });
    }
  }

  const setRowError = (id: string, message: string) => set((state) => ({ rowErrors: { ...state.rowErrors, [id]: message } }));

  return {
    reports: [], nextCursor: null, status: "open", loading: false, loaded: false, error: null, rowErrors: {}, busyId: null,
    reload: () => fetchPage(null, true),
    loadMore: async () => {
      const { nextCursor, loading } = get();
      if (!nextCursor || loading) return;
      await fetchPage(nextCursor, false);
    },
    setStatus: async (status) => {
      set({ status });
      await fetchPage(null, true);
    },
    decide: async (id, decision, until) => {
      if (decision === "suspend" && !isSuspendEndValid(until)) {
        setRowError(id, SUSPEND_NEEDS_END);
        return;
      }
      set({ busyId: id });
      setRowError(id, "");
      try {
        await decideReport(id, { decision, until });
      } catch (error) {
        setRowError(id, moderationErrorCopy(error));
        set({ busyId: null });
        if (isSavedDecision(error)) await fetchPage(null, true);
        return;
      }
      set({ busyId: null });
      await fetchPage(null, true);
    },
  };
});

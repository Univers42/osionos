/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAuditStore.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The audit panel's state: the events loaded so far and the keyset cursor. "Load more" appends
 * from `nextCursor`; a failed page keeps the rows already shown.
 *
 * Caveat: `epoch` drops a late page after a reload, but a "Load more" fired while a reload is
 * in flight is ignored, not queued.
 */

import { create } from "zustand";

import { listAuditEvents, type AuditEvent } from "./api";

const PAGE_SIZE = 25;

const BY_CODE: Record<string, string> = {
  admin_required: "Only administrators can read the audit log. Your access may have changed: reload the page.",
  invalid_cursor: "The log moved while you were reading it. Reload to continue.",
  rate_limited: "You are going too fast. Wait a minute, then try again.",
};
const GENERIC = "The audit log could not be loaded. Try again, and reload the page if it keeps happening.";

export function auditErrorCopy(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  if (typeof code === "string" && Object.hasOwn(BY_CODE, code)) return BY_CODE[code];
  if (status === 429) return BY_CODE.rate_limited;
  if (status === 403) return BY_CODE.admin_required;
  return GENERIC;
}

interface AuditState {
  events: AuditEvent[];
  nextCursor: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
}

let epoch = 0;

export const useAuditStore = create<AuditState>((set, get) => {
  async function fetchPage(cursor: string | null, replace: boolean): Promise<void> {
    const mine = ++epoch;
    set({ loading: true, error: null });
    try {
      const page = await listAuditEvents({ limit: PAGE_SIZE, cursor });
      if (mine !== epoch) return;
      set((state) => ({ events: replace ? page.events : [...state.events, ...page.events], nextCursor: page.nextCursor, loading: false, loaded: true }));
    } catch (error) {
      if (mine !== epoch) return;
      set({ loading: false, loaded: true, error: auditErrorCopy(error) });
    }
  }

  return {
    events: [], nextCursor: null, loading: false, loaded: false, error: null,
    reload: () => fetchPage(null, true),
    loadMore: async () => {
      const { nextCursor, loading } = get();
      if (!nextCursor || loading) return;
      await fetchPage(nextCursor, false);
    },
  };
});

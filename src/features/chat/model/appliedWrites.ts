/**
 * The writes an auto mode applied on its own, and their Undo (AM19, AM8).
 *
 * A row arrives with the `write.applied` frame of the run and is bound to the message and
 * the run it came from; `loadApplied` brings back the rows of a reloaded conversation.
 * Caveat: the 7-day window shown for a live row is counted from this client's clock
 * (the server counts from `created_at`, APPROVAL_RETENTION_DAYS = 7), so it can be off
 * by the clock skew; the server decides, and its refusal `expired` is what the user reads.
 */

import { create } from "zustand";

import { requestJson } from "@/features/ai/api/aiClient";
import { AiError } from "@/features/ai/api/aiContract";

export interface AppliedWriteView {
  approvalId: string;
  tool: string;
  target: string;
  summary: string;
  decidedBy: string;
  undoneAt: string | null;
  undoUntil: string;
}

/** A row and where it is shown: `runId` may be "" for a run that never said its id. */
export interface AppliedRow extends AppliedWriteView {
  messageId: string;
  runId: string;
  /** False when the service says the write cannot be undone (a create that others built on). */
  undoable: boolean;
  busy: boolean;
  error: string;
}

export const UNDO_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

const ERRORS: Record<string, string> = {
  changed_since: "Not undone: the page changed since.",
  already_undone: "Already undone.",
  not_undoable: "This change cannot be undone.",
  expired: "Not undone: the undo window has ended.",
  failed: "Not undone: the page could not be reached. Try again.",
  not_found: "Not undone: this change was not found.",
  unauthorized: "Sign in again to undo.",
  rate_limited: "Too many requests: try again in a moment.",
};

/** What the user reads for a refused undo; a code nobody knows reads as a plain failure. */
export function undoErrorText(code: string): string {
  return ERRORS[code] ?? "Not undone: something went wrong.";
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The row of a `write.applied` frame; null when it names no approval. */
export function appliedFromEvent(data: Record<string, unknown>): AppliedWriteView | null {
  const approvalId = str(data.approvalId);
  if (!approvalId) return null;
  return {
    approvalId,
    tool: str(data.tool),
    target: str(data.target),
    summary: str(data.summary),
    decidedBy: str(data.decidedBy),
    undoneAt: null,
    undoUntil: new Date(Date.now() + UNDO_WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

interface AppliedState {
  rows: AppliedRow[];
  add(data: Record<string, unknown>, where: { messageId: string; runId: string }): void;
  undo(approvalId: string): Promise<void>;
  undoTurn(runId: string): Promise<void>;
  load(serverConversationId: string): Promise<void>;
}

const codeOf = (cause: unknown): string => (cause instanceof AiError ? cause.code : "failed");

export const useAppliedWrites = create<AppliedState>((set, get) => {
  const patch = (match: (row: AppliedRow) => boolean, change: Partial<AppliedRow>) =>
    set((s) => ({ rows: s.rows.map((row) => (match(row) ? { ...row, ...change } : row)) }));
  return {
    rows: [],
    add(data, where) {
      const view = appliedFromEvent(data);
      if (!view || get().rows.some((row) => row.approvalId === view.approvalId)) return;
      set((s) => ({ rows: [...s.rows, { ...view, ...where, undoable: data.undoable !== false, busy: false, error: "" }] }));
    },
    async undo(approvalId) {
      patch((r) => r.approvalId === approvalId, { busy: true, error: "" });
      try {
        await requestJson("POST", `/approvals/${encodeURIComponent(approvalId)}/undo`);
        patch((r) => r.approvalId === approvalId, { busy: false, undoneAt: new Date().toISOString() });
      } catch (cause) {
        patch((r) => r.approvalId === approvalId, { busy: false, error: undoErrorText(codeOf(cause)) });
      }
    },
    async undoTurn(runId) {
      const mine = (r: AppliedRow) => r.runId === runId && !r.undoneAt;
      patch(mine, { busy: true, error: "" });
      try {
        await requestJson("POST", `/runs/${encodeURIComponent(runId)}/undo-writes`);
        patch(mine, { busy: false, undoneAt: new Date().toISOString() });
      } catch (cause) {
        // Caveat: a stopped turn may have undone its newest rows first; they show as
        // not undone until the list is read again (a reload does it).
        patch(mine, { busy: false, error: undoErrorText(codeOf(cause)) });
      }
    },
    async load(serverConversationId) {
      try {
        const body = await requestJson<{ items?: Array<Record<string, unknown>> }>(
          "GET",
          `/conversations/${encodeURIComponent(serverConversationId)}/applied`,
        );
        for (const item of body.items ?? []) merge(set, item);
      } catch {
        // Off, or not the owner: no rows is the honest answer.
      }
    },
  };
});

function merge(set: (fn: (s: AppliedState) => Partial<AppliedState>) => void, item: Record<string, unknown>): void {
  const view = appliedFromEvent(item);
  if (!view) return;
  const row: AppliedRow = {
    ...view,
    undoneAt: typeof item.undoneAt === "string" ? item.undoneAt : null,
    undoUntil: str(item.undoUntil) || view.undoUntil,
    messageId: "",
    runId: str(item.runId),
    undoable: item.undoable !== false,
    busy: false,
    error: "",
  };
  set((s) => {
    const known = s.rows.find((r) => r.approvalId === row.approvalId);
    if (!known) return { rows: [...s.rows, row] };
    return { rows: s.rows.map((r) => (r === known ? { ...r, undoneAt: row.undoneAt, undoUntil: row.undoUntil, runId: r.runId || row.runId } : r)) };
  });
}

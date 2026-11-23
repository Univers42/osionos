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

import { reloadWrittenPage } from "./reloadWrittenPage";

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
  /** The turn the service groups the row in (its continuations share it); "" for a live row until the list is read. */
  turnId: string;
  /** False when the service says the write cannot be undone (a create that others built on). */
  undoable: boolean;
  busy: boolean;
  error: string;
}

const UNDO_WINDOW_DAYS = 7;
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
  undoTurn(runId: string, serverConversationId?: string): Promise<void>;
  load(serverConversationId: string): Promise<void>;
}

type SetState = (fn: (s: AppliedState) => Partial<AppliedState>) => void;
type GetState = () => AppliedState;

const codeOf = (cause: unknown): string => (cause instanceof AiError ? cause.code : "failed");

const patchRows = (set: SetState, match: (row: AppliedRow) => boolean, change: Partial<AppliedRow>) =>
  set((s) => ({ rows: s.rows.map((row) => (match(row) ? { ...row, ...change } : row)) }));

function addRow(set: SetState, get: GetState, data: Record<string, unknown>, where: { messageId: string; runId: string }): void {
  const view = appliedFromEvent(data);
  if (!view || get().rows.some((row) => row.approvalId === view.approvalId)) return;
  set((s) => ({ rows: [...s.rows, { ...view, ...where, turnId: "", undoable: data.undoable !== false, busy: false, error: "" }] }));
}

/**
 * One row's Undo. An undone add_blocks reads its page again, as an applied one does (I1).
 * Caveat (M14): an undone rename_page or create_page leaves the sidebar's title or page
 * list as it was until the tree is read again; only the open page's content is reloaded.
 */
async function undoOne(set: SetState, get: GetState, approvalId: string): Promise<void> {
  const mine = (r: AppliedRow) => r.approvalId === approvalId;
  patchRows(set, mine, { busy: true, error: "" });
  try {
    await requestJson("POST", `/approvals/${encodeURIComponent(approvalId)}/undo`);
    patchRows(set, mine, { busy: false, undoneAt: new Date().toISOString() });
    reloadUndone(get().rows, [approvalId]);
  } catch (cause) {
    patchRows(set, mine, { busy: false, error: undoErrorText(codeOf(cause)) });
  }
}

/** The service's report of a turn undo, or the words for an answer that carries none. */
async function askTurnUndo(runId: string): Promise<{ results: TurnResult[]; failure: string }> {
  try {
    return { results: resultsOf(await requestJson("POST", `/runs/${encodeURIComponent(runId)}/undo-writes`)), failure: "" };
  } catch (cause) {
    const results = cause instanceof AiError ? resultsOf(cause.body) : [];
    return { results, failure: results.length > 0 ? "" : undoErrorText(codeOf(cause)) };
  }
}

/** Undo all. A row already undone is not part of it (M4): a failure never lands on it. */
async function undoTurn(set: SetState, get: GetState, runId: string, serverConversationId?: string): Promise<void> {
  const turn = get().rows.find((r) => r.runId === runId)?.turnId ?? "";
  const inTurn = (r: AppliedRow) => !r.undoneAt && (r.runId === runId || (turn !== "" && r.turnId === turn));
  patchRows(set, inTurn, { busy: true, error: "" });
  const { results, failure } = await askTurnUndo(runId);
  settle(set, inTurn, results, failure);
  reloadUndone(get().rows, results.filter((r) => r.ok).map((r) => r.approvalId));
  // Continuations of the turn and the true undone times come from the list.
  if (serverConversationId) await get().load(serverConversationId);
}

/** Reads each page the undone rows changed once (I1); `reloadWrittenPage` skips a tool that changed no content. */
function reloadUndone(rows: AppliedRow[], undoneIds: string[]): void {
  const read = new Set<string>();
  for (const row of rows) {
    if (!undoneIds.includes(row.approvalId) || read.has(row.target)) continue;
    if (reloadWrittenPage(row.tool, row.target)) read.add(row.target);
  }
}

async function loadRows(set: SetState, serverConversationId: string): Promise<void> {
  try {
    const body = await requestJson<{ items?: Array<Record<string, unknown>> }>(
      "GET",
      `/conversations/${encodeURIComponent(serverConversationId)}/applied`,
    );
    for (const item of body.items ?? []) merge(set, item);
  } catch {
    // Off, or not the owner: no rows is the honest answer.
  }
}

export const useAppliedWrites = create<AppliedState>((set, get) => ({
  rows: [],
  add: (data, where) => addRow(set, get, data, where),
  undo: (approvalId) => undoOne(set, get, approvalId),
  undoTurn: (runId, serverConversationId) => undoTurn(set, get, runId, serverConversationId),
  load: (serverConversationId) => loadRows(set, serverConversationId),
}));

interface TurnResult {
  approvalId: string;
  ok: boolean;
  code?: string;
}

/** The per-row report of `POST /runs/:id/undo-writes`: `results`, on a 200 and on the 409 of a stopped turn. */
function resultsOf(body: unknown): TurnResult[] {
  const list = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is TurnResult => typeof r?.approvalId === "string" && typeof r.ok === "boolean");
}

/**
 * Applies what the service reported: the rows it undid are undone, the row it refused
 * shows its code, and rows it never reached keep their state (it stops at the first refusal).
 * `failure` is the words for an answer with no report at all.
 */
function settle(
  set: SetState,
  inTurn: (row: AppliedRow) => boolean,
  results: TurnResult[],
  failure: string,
): void {
  const at = new Date().toISOString();
  set((s) => ({
    rows: s.rows.map((row) => {
      if (!inTurn(row)) return row;
      const report = results.find((r) => r.approvalId === row.approvalId);
      if (report?.ok) return { ...row, busy: false, undoneAt: row.undoneAt ?? at, error: "" };
      return { ...row, busy: false, error: report ? undoErrorText(report.code ?? "failed") : failure };
    }),
  }));
}

function merge(set: SetState, item: Record<string, unknown>): void {
  const view = appliedFromEvent(item);
  if (!view) return;
  const row: AppliedRow = {
    ...view,
    undoneAt: typeof item.undoneAt === "string" ? item.undoneAt : null,
    undoUntil: str(item.undoUntil) || view.undoUntil,
    messageId: "",
    runId: str(item.runId),
    turnId: str(item.turnId),
    undoable: item.undoable !== false,
    busy: false,
    error: "",
  };
  set((s) => {
    const known = s.rows.find((r) => r.approvalId === row.approvalId);
    if (!known) return { rows: [...s.rows, row] };
    return { rows: s.rows.map((r) => (r === known ? { ...r, undoneAt: r.undoneAt ?? row.undoneAt, undoUntil: row.undoUntil, runId: r.runId || row.runId, turnId: row.turnId, undoable: row.undoable } : r)) };
  });
}

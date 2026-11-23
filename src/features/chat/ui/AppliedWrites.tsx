/**
 * The writes an auto mode applied under one answer: a turn bar, then a row each.
 *
 * Everything here renders only with `osio.ai.modes` on: with it off the chat is what it
 * was before the modes. After an undo, focus moves to what changed (M1): the undone row,
 * or the list after Undo all, so a keyboard user is not left on a button that is gone.
 * Caveat: a row belongs to an answer by its message, or by its run for rows read back
 * from the service; a run that never announced its id leaves live rows grouped by message.
 */

import React, { useEffect, useRef } from "react";

import { useAppliedWrites, type AppliedRow } from "../model/appliedWrites";
import { useChatStore } from "../model/useChatStore";
import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";
import { AppliedWriteRow } from "./AppliedWriteRow";
import { TurnUndoBar } from "./TurnUndoBar";

/** The bar speaks for the whole turn: the service undoes its continuations too. */
function turnScope(all: AppliedRow[], rows: AppliedRow[]) {
  const turns = new Set(rows.map((r) => r.turnId).filter(Boolean));
  const scope = all.filter((r) => rows.includes(r) || turns.has(r.turnId));
  const open = scope.filter((r) => !r.undoneAt && r.undoable);
  return { scope, open, turnRun: rows.find((r) => r.runId)?.runId ?? "" };
}

const rowNamed = (id: string) => useAppliedWrites.getState().rows.find((r) => r.approvalId === id);

/** Focus on the row a single Undo undid; it stays on the button when the undo was refused. */
function focusUndone(list: HTMLElement | null, approvalId: string): void {
  if (!list || !rowNamed(approvalId)?.undoneAt) return;
  const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-approval-id]"));
  rows.find((el) => el.dataset.approvalId === approvalId)?.focus();
}

/** Focus on the list after Undo all, unless a row of the turn says why it was not undone. */
function focusList(list: HTMLElement | null, scope: AppliedRow[]): void {
  if (list && !scope.some((r) => rowNamed(r.approvalId)?.error)) list.focus();
}

const serverIdOf = (conversationId?: string) => (s: ReturnType<typeof useChatStore.getState>) =>
  s.conversations.find((c) => c.id === conversationId)?.serverConversationId;

export const AppliedWrites: React.FC<{ messageId: string; runId?: string; conversationId?: string }> = ({ messageId, runId = "", conversationId }) => {
  const all = useAppliedWrites((s) => s.rows);
  const { undo, undoTurn } = useAppliedWrites.getState();
  const serverConversationId = useChatStore(serverIdOf(conversationId));
  const list = useRef<HTMLDivElement>(null);
  if (!isFeatureFlagEnabled("osio.ai.modes")) return null;
  const rows = all.filter((r) => r.messageId === messageId || (runId !== "" && r.runId === runId));
  if (rows.length === 0) return null;
  const { scope, open, turnRun } = turnScope(all, rows);
  const onUndoAll = () => void undoTurn(turnRun, serverConversationId).then(() => focusList(list.current, scope));
  const onUndo = (id: string) => void undo(id).then(() => focusUndone(list.current, id));
  const bar = turnRun
    ? React.createElement(TurnUndoBar, { count: open.length, busy: open.some((r) => r.busy), error: scope.find((r) => r.error)?.error ?? "", onUndoAll })
    : null;
  const items = rows.map((row) => React.createElement(AppliedWriteRow, { key: row.approvalId, row, onUndo }));
  return React.createElement("div", { ref: list, tabIndex: -1, "data-testid": "chat-applied-writes" }, bar, items);
};

/** Reads the applied writes of a reloaded conversation once; renders nothing. */
export const AppliedWritesLoader: React.FC<{ conversationId?: string }> = ({ conversationId }) => {
  const load = useAppliedWrites((s) => s.load);
  const serverConversationId = useChatStore(serverIdOf(conversationId));
  useEffect(() => {
    if (serverConversationId && isFeatureFlagEnabled("osio.ai.modes")) void load(serverConversationId);
  }, [serverConversationId, load]);
  return null;
};

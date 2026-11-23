/**
 * The writes an auto mode applied under one answer: a turn bar, then a row each.
 *
 * Everything here renders only with `osio.ai.modes` on: with it off the chat is what it
 * was before the modes.
 * Caveat: a row belongs to an answer by its message, or by its run for rows read back
 * from the service; a run that never announced its id leaves live rows grouped by message.
 */

import React, { useEffect } from "react";

import { useAppliedWrites, type AppliedRow } from "../model/appliedWrites";
import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";
import { AppliedWriteRow } from "./AppliedWriteRow";
import { TurnUndoBar } from "./TurnUndoBar";

export const AppliedWrites: React.FC<{ messageId: string; runId?: string }> = ({ messageId, runId = "" }) => {
  const all = useAppliedWrites((s) => s.rows);
  const undo = useAppliedWrites((s) => s.undo);
  const undoTurn = useAppliedWrites((s) => s.undoTurn);
  if (!isFeatureFlagEnabled("osio.ai.modes")) return null;
  const rows = all.filter((r) => r.messageId === messageId || (runId !== "" && r.runId === runId));
  if (rows.length === 0) return null;
  const open = rows.filter((r: AppliedRow) => !r.undoneAt && r.undoable);
  const turnRun = rows.find((r) => r.runId)?.runId ?? "";
  return React.createElement(
    React.Fragment,
    null,
    turnRun
      ? React.createElement(TurnUndoBar, {
          count: open.length,
          busy: open.some((r) => r.busy),
          error: open.find((r) => r.error)?.error ?? "",
          onUndoAll: () => void undoTurn(turnRun),
        })
      : null,
    rows.map((row) => React.createElement(AppliedWriteRow, { key: row.approvalId, row, onUndo: (id) => void undo(id) })),
  );
};

/** Reads the applied writes of a reloaded conversation once; renders nothing. */
export const AppliedWritesLoader: React.FC<{ serverConversationId?: string }> = ({ serverConversationId }) => {
  const load = useAppliedWrites((s) => s.load);
  useEffect(() => {
    if (serverConversationId && isFeatureFlagEnabled("osio.ai.modes")) void load(serverConversationId);
  }, [serverConversationId, load]);
  return null;
};

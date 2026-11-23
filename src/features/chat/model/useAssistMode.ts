/** The state behind the mode menu: loads once per conversation (the caller keys it by id, so a change remounts), saves on a pick. */

import { useCallback, useEffect, useState } from "react";

import { failureOf, getMode, modeFeedback, patchMode, type AssistMode } from "./assistMode";

export function useAssistMode(conversationId: string, openPageId: string | null) {
  const [mode, setMode] = useState<AssistMode>("manual");
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let current = true;
    getMode(conversationId).then(
      (stored) => current && (setMode(stored.mode), setHidden(false)),
      (cause) => current && setHidden(modeFeedback(failureOf(cause)).hidden),
    );
    return () => { current = false; };
  }, [conversationId]);

  const choose = useCallback(async (next: AssistMode) => {
    const anchor = next === "accept_edits" && openPageId ? { anchorPageId: openPageId } : {};
    const result = await patchMode(conversationId, { mode: next, ...anchor });
    if (result.ok) { setMode(next); setError(null); return; }
    const feedback = modeFeedback(result.code);
    setError(feedback.error);
    if (feedback.hidden) setHidden(true);
  }, [conversationId, openPageId]);

  return { mode, error, hidden, choose };
}

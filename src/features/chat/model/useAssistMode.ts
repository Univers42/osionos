/** The state behind the mode menu: loads once per conversation (the caller keys it by id, so a change remounts), saves picks in order. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadMode, patchMode, type AssistMode } from "./assistMode";
import { makeModeSaver, type ModeSaver, type ModeView } from "./modeSaver";

const START: ModeView = { mode: "manual", anchorPageId: null, error: null, hidden: false };

/** The first read of the stored mode; true once it is known. */
function useStoredMode(conversationId: string, saver: ModeSaver, show: (view: ModeView) => void): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let current = true;
    void loadMode(conversationId).then((load) => {
      if (!current) return;
      if (load.status === "failed") {
        show({ ...START, hidden: load.hidden, error: load.hidden ? null : "The current mode could not be read" });
        return;
      }
      saver.confirm(load.mode, load.anchorPageId);
      show({ ...START, mode: load.mode, anchorPageId: load.mode === "accept_edits" ? load.anchorPageId : null });
      setReady(true);
    });
    return () => { current = false; };
  }, [conversationId, saver, show]);
  return ready;
}

export function useAssistMode(conversationId: string, openPageId: string | null) {
  const [view, setView] = useState<ModeView>(START);
  const saver = useMemo(() => makeModeSaver((body) => patchMode(conversationId, body), setView), [conversationId]);
  const ready = useStoredMode(conversationId, saver, setView);
  const choose = useCallback(
    (next: AssistMode) => saver.pick(next, next === "accept_edits" ? openPageId : null),
    [saver, openPageId],
  );
  return { ...view, ready, choose };
}

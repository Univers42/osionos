/**
 * Mode picks saved one at a time, the last one winning (I2).
 *
 * Each pick shows at once, then waits for the PATCH before it to settle: two PATCHes
 * never race, so the service never ends on an older pick than the one shown. A pick
 * superseded before its turn is never sent. When the latest pick settles, the menu shows
 * it, or on a refusal the mode the service last confirmed with the refusal's words.
 * Caveat: "confirmed" is what this tab last heard; another tab, or another device, can
 * change the mode after it, and this menu shows the older one until it is opened again.
 */

import { modeFeedback, type AssistMode, type ModeFailure } from "./assistMode";

export interface ModeView {
  mode: AssistMode;
  /** The page accept_edits writes to, as the service holds it (M7); null in any other mode. */
  anchorPageId: string | null;
  error: string | null;
  hidden: boolean;
}

export type ModeSave = (body: { mode: AssistMode; anchorPageId?: string }) => Promise<{ ok: true } | { ok: false; code: ModeFailure }>;

export interface ModeSaver {
  /** The mode and anchor the service holds, as the first read said. */
  confirm(mode: AssistMode, anchorPageId: string | null): void;
  /** Shows `next` and saves it after the PATCH in flight; resolves once it settled or was skipped. */
  pick(next: AssistMode, anchorPageId: string | null): Promise<void>;
}

export function makeModeSaver(save: ModeSave, show: (view: ModeView) => void): ModeSaver {
  let confirmed: AssistMode = "manual";
  let confirmedAnchor: string | null = null;
  const anchorOf = (mode: AssistMode, anchorPageId: string | null) => (mode === "accept_edits" ? anchorPageId : null);
  let latest = 0;
  let tail: Promise<void> = Promise.resolve();
  const settle = async (seq: number, next: AssistMode, anchorPageId: string | null) => {
    if (seq !== latest) return;
    const result = await save({ mode: next, ...(anchorPageId ? { anchorPageId } : {}) });
    if (result.ok) {
      confirmed = next;
      confirmedAnchor = anchorOf(next, anchorPageId);
    }
    if (seq !== latest) return;
    show(
      result.ok
        ? { mode: next, anchorPageId: confirmedAnchor, error: null, hidden: false }
        : { mode: confirmed, anchorPageId: confirmedAnchor, ...modeFeedback(result.code) },
    );
  };
  return {
    confirm(mode, anchorPageId) {
      confirmed = mode;
      confirmedAnchor = anchorOf(mode, anchorPageId);
    },
    pick(next, anchorPageId) {
      const seq = ++latest;
      show({ mode: next, anchorPageId: anchorOf(next, anchorPageId), error: null, hidden: false });
      tail = tail.then(() => settle(seq, next, anchorPageId));
      return tail;
    },
  };
}

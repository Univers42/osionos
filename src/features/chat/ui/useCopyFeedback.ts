/**
 * "Copy" with a visible outcome: copied for 1.5 s, or failed.
 *
 * Caveat: `navigator.clipboard` needs a secure context and a user gesture; an
 * insecure origin or a refusal shows "failed" — it never falls back to
 * `execCommand`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/** How long "Copied" stays before the button returns to "Copy". */
export const COPIED_MS = 1500;

export function useCopyFeedback(): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), COPIED_MS);
  }, []);
  return { state, copy };
}

/** The visible word of the copy button. */
export function copyWord(state: CopyState): string {
  if (state === "copied") return "Copied";
  return state === "failed" ? "Copy failed" : "Copy";
}

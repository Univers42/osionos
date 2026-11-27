// "Remember this computer" as consent (ADR 0041 R6; devil verdict 2026-11-27 trusted browser, TB5).
// A remembered computer opens files and the terminal with no code, so a token carries remember only
// when the step-up just before it showed the box and the box is checked. The box's checked state is
// shared and on by default; a step-up that never drew it, as one with no prompt, is never consent.

export const REMEMBER_HINT =
  "Files and the terminal on this computer then open here without a code, for 12 hours after you last use them and 30 days at most. Don't check this on a shared computer.";

export interface RememberConsent {
  /** Every phase of the frame; a new step-up has not shown the box yet. */
  onPhase(phase: string): void;
  /** The box was drawn in this step-up's prompt. */
  shown(): void;
  /** What the next mint carries: one mint per showing. */
  remember(): boolean;
}

export function createRememberConsent(checked: () => boolean): RememberConsent {
  let shownNow = false;
  return {
    onPhase(phase) { if (phase === "step-up") shownNow = false; },
    shown() { shownNow = true; },
    remember() {
      const consented = shownNow && checked();
      shownNow = false;
      return consented;
    },
  };
}

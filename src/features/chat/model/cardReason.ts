/**
 * Why a write is a card for the user and was not applied by an auto mode (AM4).
 *
 * The reasons are the server's `CardReason` union; a test reads that union and fails when
 * this list drifts from it.
 * Caveat: a reason the service learns later has no words here and shows nothing (a card
 * without a reason is the old card); the drift test is what makes it visible.
 */

import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";

const WORDS = {
  mode_manual: "This conversation asks you before every change.",
  mode_changed: "The mode of this conversation changed while the assistant was working.",
  not_allowlisted: "Automatic edits are not enabled for your account.",
  tool_not_eligible: "This kind of change always needs your approval.",
  tainted: "Automatic edits are off for this conversation: it read content other people can write.",
  outside_anchor: "This page is outside the anchor page.",
  no_anchor: "There is no anchor page for this change.",
  outside_workspace: "This page is outside this workspace.",
  no_credential: "Your session cannot be used once this turn ends.",
  credential_expiring: "Your session is about to expire: sign in again for automatic edits.",
  credential_rejected: "Your session was refused: sign in again for automatic edits.",
  turn_cap: "The limit of automatic edits for this turn was reached.",
  day_cap: "The limit of automatic edits for today was reached.",
  step_cap: "The limit of automatic edits for this step was reached.",
  rate_limited: "Automatic edits are coming too fast.",
  budget_low: "The run is about to end.",
} as const satisfies Record<string, string>;

export const CARD_REASONS = Object.keys(WORDS);

/** The sentence under a card, or null: no reason, an unknown one, or `osio.ai.modes` off. */
export function cardReasonText(reason: string | undefined): string | null {
  if (!reason || !isFeatureFlagEnabled("osio.ai.modes")) return null;
  return Object.hasOwn(WORDS, reason) ? WORDS[reason as keyof typeof WORDS] : null;
}

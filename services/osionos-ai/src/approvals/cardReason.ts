import type { CardReason } from './types.ts';

/** What the model is told when a write became a card: the reason, in words. */
export const CARD_REASON_WORDS: Record<CardReason, string> = {
	mode_manual: 'this conversation asks the user before every change',
	mode_changed: 'the mode of the conversation changed during the run',
	not_allowlisted: 'automatic edits are not enabled for this account',
	tool_not_eligible: 'this kind of change always needs the user',
	tainted: 'the conversation read content the user did not write',
	outside_anchor: 'the page is outside the anchor page',
	no_anchor: 'there is no anchor page for this change',
	outside_workspace: 'the page is outside this workspace',
	no_credential: 'the session cannot be used once the turn ends',
	credential_expiring: 'the session is about to expire',
	credential_rejected: 'the session was refused by the bridge',
	turn_cap: 'the limit of automatic edits for this turn was reached',
	day_cap: 'the limit of automatic edits for today was reached',
	step_cap: 'the limit of automatic edits for this step was reached',
	rate_limited: 'automatic edits are coming too fast',
	budget_low: 'the run is about to end',
};

/** The sentence the model reads for a card. */
export function cardSentence(reason: CardReason): string {
	return `Sent to the user for approval (${CARD_REASON_WORDS[reason]}).`;
}

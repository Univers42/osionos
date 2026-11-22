import { BRIDGE_TIMEOUT_MS } from '../approvals/bridge.ts';

/**
 * The session token a run keeps for writes that happen after the turn ends
 * (AM1). The token lives only in this closure: it is in no row, event, log,
 * Redis key or error string, and printing the credential shows a placeholder.
 *
 * Caveat: the 30 s margin assumes a write finishes within one bridge timeout
 * plus the append retry. A token the bridge revokes early (session cut-off)
 * inside the margin gets a 401, which becomes a card (Task 15).
 */
export const CREDENTIAL_MARGIN_MS = BRIDGE_TIMEOUT_MS + 30_000;

export interface RunCredential {
	usable(nowMs: number): boolean;
	use<T>(fn: (token: string) => Promise<T>): Promise<T>;
	toJSON(): '[credential]';
	toString(): '[credential]';
}

/** Null when the token is empty or its expiry is unknown: nothing safe to hold. */
export function makeRunCredential(token: string, expiresAtMs: number | null): RunCredential | null {
	if (token === '' || expiresAtMs === null) return null;
	return {
		usable: (nowMs) => expiresAtMs - nowMs > CREDENTIAL_MARGIN_MS,
		use: (fn) => fn(token),
		toJSON: () => '[credential]',
		toString: () => '[credential]',
	};
}

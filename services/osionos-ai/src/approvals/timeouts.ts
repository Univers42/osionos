import { BRIDGE_TIMEOUT_MS } from './bridge.ts';

/**
 * The clocks of a claimed approval. They live apart from repo.ts because the
 * configuration bounds its budget with them, and repo.ts reads the configuration.
 */

/** How long a write may stay 'executing' before the sweeper reconciles it. */
export const EXECUTING_TIMEOUT_MS = 5 * 60_000;

/**
 * The largest budget of one pass, a build, a resume or an undo (groot ADR 0071,
 * Q7): the pass, plus one bridge call started at its last moment, plus a minute,
 * ends before the sweeper calls the claimed row 'unknown'.
 *
 * Caveat: the minute is the only room left for the database. Each statement may
 * wait 5 s for a connection and 5 s on the server, and 90 s on a lost network
 * (db.ts), so a stalled database can still carry a pass past the sweeper window.
 */
export const MAX_PASS_BUDGET_MS = EXECUTING_TIMEOUT_MS - BRIDGE_TIMEOUT_MS - 60_000;

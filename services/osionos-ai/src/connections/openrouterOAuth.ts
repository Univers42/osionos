import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { guardedShortFetch } from './endpointGuard.ts';
import { providerBaseUrl, OPENROUTER_ID } from './providers.ts';
import { providerEntry } from './catalog.ts';
import { connectionSecret, createConnection, testConnection } from './service.ts';
import { updateConnectionStatus } from './repo.ts';
import type { ConnectionRow } from './repo.ts';

/**
 * The sign-in of OpenRouter: PKCE, one click, the key never touches the
 * browser.
 *
 * The browser goes to `https://openrouter.ai/auth` with a challenge, OpenRouter
 * sends it back to our callback URL with a code, and the server exchanges that
 * code for a key with the verifier it kept. The field names are the ones of the
 * documentation of OpenRouter (https://openrouter.ai/docs/guides/overview/auth/oauth):
 * `callback_url`, `code_challenge`, `code_challenge_method` on the way out, and
 * `code`, `code_verifier`, `code_challenge_method` on the way back, which
 * answers with `{ key }`.
 */

/** The prefix of the keys of the states. */
const STATE_PREFIX = 'ai:oauth:';

/** The life of a state: ten minutes. */
export const STATE_TTL_SECONDS = 600;

/** The page the browser goes to. */
const AUTHORIZE_URL = 'https://openrouter.ai/auth';

/** The path of the exchange, under the base of the provider. */
const EXCHANGE_PATH = '/auth/keys';

/** The label of the connection the sign-in creates. */
const OPENROUTER_LABEL = 'OpenRouter';

/** What the state holds while the browser is away. */
interface StoredState {
	userId: string;
	verifier: string;
	returnUrl: string;
}

/**
 * The origin the callback may point at: the one of the deployment.
 *
 * It is the allowed origin of the service, compared as an origin, so a
 * `returnUrl` of another site is refused and the sign-in never becomes an
 * open redirect.
 */
export function allowedOrigin(): string {
	try {
		return new URL(config.allowedOrigin).origin;
	} catch {
		return config.allowedOrigin;
	}
}

/**
 * The callback the user may ask for: an absolute URL of the allowed origin.
 *
 * Null when it is not one: the caller answers 400 and nothing is written.
 */
export function allowedReturnUrl(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.origin !== allowedOrigin()) return null;
	return url.toString();
}

/** The challenge of a verifier: the base64url of its sha256. */
export function challengeOf(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** The key of a state in Redis. */
export function stateKey(state: string): string {
	return `${STATE_PREFIX}${state}`;
}

/**
 * The start of the sign-in: the URL the browser must go to.
 *
 * The verifier stays on the server, with the state, for ten minutes. The state
 * is added to the callback URL, so the answer comes back with it and the
 * server can tell which sign-in it belongs to.
 */
export async function startOpenRouterOAuth(
	redis: Redis,
	input: { userId: string; returnUrl: string },
): Promise<string | null> {
	const returnUrl = allowedReturnUrl(input.returnUrl);
	if (!returnUrl) return null;
	const verifier = randomBytes(32).toString('base64url');
	const challenge = challengeOf(verifier);
	const state = randomBytes(16).toString('base64url');
	const stored: StoredState = { userId: input.userId, verifier, returnUrl };
	await redis.set(stateKey(state), JSON.stringify(stored), 'EX', STATE_TTL_SECONDS);
	const callback = new URL(returnUrl);
	callback.searchParams.set('state', state);
	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set('callback_url', callback.toString());
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', 'S256');
	return url.toString();
}

/**
 * The state of a sign-in, read once.
 *
 * The state is consumed by the read: a state that is replayed finds nothing.
 * Another user's state is refused the same way, and it is consumed too — the
 * state is a one-shot ticket, not a session.
 */
async function takeState(redis: Redis, state: string, userId: string): Promise<StoredState | null> {
	let raw: string | null = null;
	try {
		raw = await redis.getdel(stateKey(state));
	} catch {
		return null;
	}
	if (!raw) return null;
	let stored: StoredState;
	try {
		stored = JSON.parse(raw) as StoredState;
	} catch {
		return null;
	}
	if (!stored || stored.userId !== userId) return null;
	return stored;
}

/**
 * The exchange of the code for a key.
 *
 * The call goes through the guard, like every other call of the service, and
 * its base is the base of the provider: the tests point it at their mock.
 */
async function exchangeKey(
	redis: Redis,
	stored: StoredState,
	code: string,
): Promise<string | null> {
	const entry = await providerEntry(redis, OPENROUTER_ID);
	if (!entry) return null;
	const base = providerBaseUrl(entry).replace(/\/+$/, '');
	if (!base) return null;
	try {
		const response = await guardedShortFetch(`${base}${EXCHANGE_PATH}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				code,
				code_verifier: stored.verifier,
				code_challenge_method: 'S256',
			}),
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { key?: unknown };
		const key = typeof payload.key === 'string' ? payload.key : '';
		return key.length > 0 ? key : null;
	} catch {
		return null;
	}
}

/**
 * The answer of the end of a sign-in.
 *
 * The two refusals are not the same: a sign-in that does not exist is a 404,
 * and an exchange that fails is a bad request.
 */
export type OAuthOutcome =
	| { kind: 'created'; row: ConnectionRow }
	| { kind: 'not_found' }
	| { kind: 'exchange_failed' };

/**
 * The end of the sign-in: the code becomes a connection.
 *
 * The key is sealed like any other secret, and the connection is tested once:
 * the answer says whether the key works.
 *
 * No row is written when the sign-in does not hold or when the exchange
 * fails.
 */
export async function completeOpenRouterOAuth(
	db: Pool,
	redis: Redis,
	input: { userId: string; code: string; state: string },
): Promise<OAuthOutcome> {
	const stored = await takeState(redis, input.state, input.userId);
	if (!stored) return { kind: 'not_found' };
	const key = await exchangeKey(redis, stored, input.code);
	if (!key) return { kind: 'exchange_failed' };
	const row = await createConnection(db, input.userId, {
		kind: 'oauth',
		provider: OPENROUTER_ID,
		label: OPENROUTER_LABEL,
		baseUrl: null,
		apiKey: key,
	});
	const tested = await testConnection(redis, row, connectionSecret(row));
	await updateConnectionStatus(db, row.id, tested.status, tested.statusMessage);
	return { kind: 'created', row: { ...row, status: tested.status, status_message: tested.statusMessage } };
}

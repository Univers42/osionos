import { createHash, randomBytes } from 'node:crypto';

/**
 * The personal access token: its shape, its hash, and the two refusals that
 * belong to it (C112).
 *
 * A token is 256 bits of randomness and nothing else: `osn_pat_` plus 32
 * bytes in base64url, which is 43 characters. The service shows it ONCE — in
 * the answer of the creation — and keeps only its sha256, its last four
 * characters and its id. The token itself never reaches the database, a log,
 * a URL or a screenshot.
 */

/** The prefix every token carries: a glance says what the string is. */
export const PAT_PREFIX = 'osn_pat_';

/** The bytes of randomness in a token: 256 bits, and not one bit less. */
export const PAT_SECRET_BYTES = 32;

/** The body of a token: 32 bytes in base64url are 43 characters. */
const PAT_BODY = '[A-Za-z0-9_-]{43}';

/** A whole token, and nothing else. */
export const PAT_PATTERN = new RegExp(`^${PAT_PREFIX}${PAT_BODY}$`);

/** The bearer header of a token: exactly `Bearer osn_pat_<43>`. */
const PAT_BEARER = new RegExp(`^Bearer (${PAT_PREFIX}${PAT_BODY})$`);

/**
 * The query parameters that carry a token.
 *
 * A token in a query string is REFUSED (C112): a URL is written down by the
 * proxies, the browsers and the logs of the world.
 */
const TOKEN_QUERY_KEYS = new Set(['token', 'access_token']);

/**
 * Mints a token: the prefix, and 32 bytes of the system's randomness.
 *
 * The bytes come from `crypto.randomBytes`, never from `Math.random`: a token
 * is a credential, and a credential that can be guessed is not a credential.
 */
export function mintToken(): string {
	return `${PAT_PREFIX}${randomBytes(PAT_SECRET_BYTES).toString('base64url')}`;
}

/**
 * The hash of a token: the sha256 of it, in hex.
 *
 * This is what the database holds. The lookup is by hash, so a dump of the
 * table is not a list of usable credentials (C112).
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex');
}

/**
 * The last four characters of a token: the only part of it a person may see
 * again, and the only part the settings list carries.
 */
export function last4(token: string): string {
	const value = String(token ?? '');
	return value.slice(-4);
}

/**
 * The token of a bearer header, or null.
 *
 * The header must be EXACTLY `Bearer osn_pat_<43 base64url>`: a token that
 * rides another scheme, a header with a second value, or a token of another
 * shape is not a token this service accepts.
 */
export function parsePatBearer(header: string | null | undefined): string | null {
	const match = PAT_BEARER.exec(String(header ?? ''));
	return match ? match[1] : null;
}

/**
 * Whether a URL carries a token in its query string.
 *
 * Three shapes count: a `token` parameter, an `access_token` parameter, and
 * any value that starts with the prefix — a token that hides behind another
 * name is still a token in a URL.
 */
export function hasTokenInQuery(url: string | URL | null | undefined): boolean {
	let parsed: URL;
	try {
		parsed = url instanceof URL ? url : new URL(String(url ?? ''), 'http://localhost');
	} catch {
		return false;
	}
	for (const [key, value] of parsed.searchParams) {
		if (TOKEN_QUERY_KEYS.has(key.toLowerCase())) return true;
		if (value.startsWith(PAT_PREFIX)) return true;
	}
	return false;
}

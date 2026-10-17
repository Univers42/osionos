// The account name a sandbox terminal shows (whoami, id, the prompt). One sanitizer for every
// producer and consumer: the host bridge when it mints a token, verifyIdeToken when it reads one.
// The name only ever reaches the box as the OSIO_USER entry of the PTY exec Env, where osio-login
// re-validates it; it never enters a path, a volume name or the create Env.
//
// Caveat: the reserved set is a copy of the image's /etc/passwd.base names, kept honest by
// tests/bridge/ide-username.test.mjs (set IDE_PASSWD_BASE to a file read out of the built image).
// A base image that gains a system account is caught by that test, not at runtime, so a stale set
// fails open: the box's own osio-login still rejects names found in its passwd.base.

import { rest } from './bridge-social-core.mjs';

export const DEFAULT_IDE_USERNAME = 'coder';
export const IDE_USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
export const IDE_USERNAME_LOOKUP_TIMEOUT_MS = 1500;

export const RESERVED_IDE_USERNAMES = new Set([
	'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news', 'uucp', 'proxy',
	'www-data', 'backup', 'list', 'irc', '_apt', 'nobody', 'coder',
]);

/** A name that may travel in a token or an Env entry exactly as it is. */
export function isValidIdeUsername(name) {
	return typeof name === 'string' && IDE_USERNAME_RE.test(name) && !RESERVED_IDE_USERNAMES.has(name);
}

/** Maps any stored username to a valid one: lowercase, other characters to `_`, a leading digit gets
 *  a `u` prefix, at most 32 characters. A name with no letter or digit left, or a reserved one,
 *  is `coder`. */
export function sanitizeIdeUsername(raw) {
	if (typeof raw !== 'string') return DEFAULT_IDE_USERNAME;
	let name = raw.normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
	if (/^[0-9]/.test(name)) name = `u${name}`;
	name = name.replace(/^-/, '_').slice(0, 32);
	if (!/[a-z0-9]/.test(name)) return DEFAULT_IDE_USERNAME;
	return isValidIdeUsername(name) ? name : DEFAULT_IDE_USERNAME;
}

/** The token's `un` as the verifier takes it: exact match or `coder`. Never throws. */
export function usernameFromToken(value) {
	return isValidIdeUsername(value) ? value : DEFAULT_IDE_USERNAME;
}

/** The sanitized osionos username for `userId`, or undefined when the lookup cannot answer within
 *  the bound. Any failure means "mint without `un`", never a failed mint. */
export async function lookupIdeUsername(config, fetchImpl, userId, timeoutMs = IDE_USERNAME_LOOKUP_TIMEOUT_MS) {
	let timer;
	const bound = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error('username lookup timed out')), timeoutMs);
	});
	try {
		const rows = await Promise.race([
			rest(config, fetchImpl, `osionos_bridge_identities?user_id=eq.${userId}&select=username&limit=1`),
			bound,
		]);
		const stored = Array.isArray(rows) ? rows[0]?.username : undefined;
		return typeof stored === 'string' && stored !== '' ? sanitizeIdeUsername(stored) : undefined;
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
	}
}

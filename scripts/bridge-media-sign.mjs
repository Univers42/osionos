/**
 * Signed media URLs, the first step of #235/#233 (devil verdict 2026-11-03): a page-media URL can
 * carry `?exp=&kid=&sig=`, an HMAC over its path and expiry, and the owner's own Bearer session
 * also opens it. The bare capability URL still serves, so nothing that renders media today breaks;
 * MEDIA_URL_ENFORCE=true turns it into a 403 once the bare-read log shows no unknown reader left.
 *
 * `exp` is rounded up to the next hour boundary at least an hour away, so every render within one
 * hour builds the same URL and the browser cache keeps working; a link lives between 1 and 2 h.
 *
 * Caveat: a signed URL is a bearer capability for its lifetime. Anyone it leaks to (a Referer,
 * a screenshot of the address bar) can read the file until `exp`. Rotation: MEDIA_URL_SECRET is the
 * signing key, MEDIA_URL_SECRET_PREVIOUS still verifies, so a rotation breaks no link younger
 * than 2 h.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const HOUR_SEC = 3600;
const SIG = /^[0-9a-f]{64}$/;
const KID = /^[0-9a-f]{8}$/;
const EXP = /^\d{1,12}$/;

/** The signing key first, then the previous one, each with an 8-hex key id. Empty when unset. */
export function mediaKeysFromEnv(env) {
	return [env?.MEDIA_URL_SECRET, env?.MEDIA_URL_SECRET_PREVIOUS]
		.map((value) => String(value ?? '').trim())
		.filter((secret, index, all) => secret !== '' && all.indexOf(secret) === index)
		.map((secret) => ({ kid: createHash('sha256').update(secret).digest('hex').slice(0, 8), secret }));
}

const digest = (secret, path, exp) => createHmac('sha256', secret).update(`${path}.${exp}`).digest('hex');

/** `path` with its signature, or null when no key is configured. */
export function signMediaPath(keys, path, nowSec = Math.floor(Date.now() / 1000)) {
	const [key] = keys;
	if (!key) return null;
	const exp = (Math.ceil(nowSec / HOUR_SEC) + 1) * HOUR_SEC;
	return `${path}?exp=${exp}&kid=${key.kid}&sig=${digest(key.secret, path, exp)}`;
}

/** True when `params` carry an unexpired signature of `path` by one of `keys`. */
export function verifyMediaSignature(keys, path, params, nowSec = Math.floor(Date.now() / 1000)) {
	const exp = params.get('exp') ?? '';
	const kid = params.get('kid') ?? '';
	const sig = params.get('sig') ?? '';
	if (!EXP.test(exp) || !KID.test(kid) || !SIG.test(sig) || Number(exp) < nowSec) return false;
	const key = keys.find((candidate) => candidate.kid === kid);
	if (!key) return false;
	return timingSafeEqual(Buffer.from(digest(key.secret, path, exp), 'hex'), Buffer.from(sig, 'hex'));
}

/**
 * Counts bare (unsigned, sessionless) reads and logs one line a minute while there are any, so the
 * switch to MEDIA_URL_ENFORCE can wait until nothing unknown still reads them.
 */
export function createBareReadLog(logger = console, intervalMs = 60_000) {
	const counts = { bare: 0, signed: 0, session: 0 };
	const timer = setInterval(() => {
		if (counts.bare === 0) return;
		logger.info(`[osionos-bridge] media: ${counts.bare} bare read(s), ${counts.signed} signed, ${counts.session} by the owner's session in the last minute`);
		counts.bare = 0;
		counts.signed = 0;
		counts.session = 0;
	}, intervalMs);
	timer.unref?.();
	return { count: (kind) => { counts[kind] += 1; }, stop: () => clearInterval(timer) };
}

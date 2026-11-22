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

// osionos#233 D233-1: the plain-node copy of src/shared/lib/media/mediaSignature.ts, so a page
// write never stores a link that dies within 2 h. tests/canvas/media-signature-drift.test.ts fails
// when the two disagree.
// Caveat: text-shape match, like the client's — a percent-encoded or split signed link is stored as-is.
const SIGNED_UPLOAD = /(\/api\/media\/uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}\.[a-z0-9]{1,8})\?([^\s"'<>()\\#]*)/gi;
const SIGNATURE_PARAM = /^(?:amp;)?(?:exp|kid|sig)=/i;

function keptQuery(query) {
	const kept = query.split('&').filter((param) => param !== '' && !SIGNATURE_PARAM.test(param));
	if (kept.length === 0) return '';
	return `?${kept.map((param) => param.replace(/^amp;/, '')).join(query.includes('&amp;') ? '&amp;' : '&')}`;
}

/** `text` with exp/kid/sig removed from every bridge-upload URL in it; otherwise byte-identical. */
export function stripMediaSignature(text) {
	if (!text.includes('sig=')) return text;
	return text.replace(SIGNED_UPLOAD, (match, path, query) =>
		query.split('&').some((param) => SIGNATURE_PARAM.test(param)) ? `${path}${keptQuery(query)}` : match);
}

/** `value` with every string stripped; the same reference when nothing held a signature. */
export function stripMediaSignatures(value) {
	if (typeof value === 'string') return stripMediaSignature(value);
	if (value === null || typeof value !== 'object') return value;
	let out = null;
	for (const key of Object.keys(value)) {
		const stripped = stripMediaSignatures(value[key]);
		if (stripped !== value[key]) out ??= Array.isArray(value) ? [...value] : { ...value };
		if (out) out[key] = stripped;
	}
	return out ?? value;
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

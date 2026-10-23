/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-turnstile.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Turnstile for the app's password sign-in, verified by the bridge itself: the public overlay
// sets AUTH_TURNSTILE_OPTIONAL on the gateway, so the gateway's own check cannot be the only one.
// The secret (TURNSTILE_SECRET_KEY) stays inside config.turnstileSecret and is never logged,
// never echoed and never part of an error message.
//
// Caveat: double verification. Under `enforce` the bridge forwards the SAME real token to the
// gateway, and Cloudflare tokens are single-use. It works only when the gateway has no
// TURNSTILE_SECRET_KEY and AUTH_TURNSTILE_OPTIONAL=true; with a gateway secret the second
// siteverify answers timeout-or-duplicate and every sign-in is a 403.
//
// Caveat: a Cloudflare outage refuses every password sign-in (503), by design; the passwordless
// exchange does not call Cloudflare. A token is single-use at Cloudflare: if the gateway ALSO
// holds a secret and is not optional, its second siteverify of the same token fails as a
// duplicate. The bypass is a dev switch, so the secret is not asked for while it is on.


export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const LOCAL_BYPASS_TOKEN = 'localhost-turnstile-token';
const TOKEN_FIELDS = ['turnstileToken', 'cf-turnstile-response'];
const MAX_TOKEN_CHARS = 2048;
const SITEVERIFY_TIMEOUT_MS = 5_000;

function turnstileError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

const MODES = new Set(['off', 'enforce']);

function isLoopbackHost(hostname) {
	return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');
}

// Caveat: only the URLs this process is configured with are checked; a public host reached
// through a proxy that rewrites them is invisible here.
function publicHttpsOrigin(env) {
	return [env.OSIONOS_APP_URL, env.PUBLIC_OSIONOS_APP_URL, env.OSIONOS_ALLOWED_ORIGIN].some((value) => {
		try {
			const url = new URL(String(value ?? ''));
			return url.protocol === 'https:' && !isLoopbackHost(url.hostname);
		} catch {
			return false;
		}
	});
}

/**
 * OSIONOS_BRIDGE_TURNSTILE: `off` (default, the sign-in is exactly what it was before this
 * check existed) or `enforce` (the bridge verifies the browser token through siteverify).
 * Throws at boot for an unknown mode, for `enforce` without TURNSTILE_SECRET_KEY, and for a
 * bypass on a public deployment. The bypass only has a meaning under `enforce`.
 */
export function turnstileSettingsFromEnv(env) {
	const mode = String(env.OSIONOS_BRIDGE_TURNSTILE ?? 'off').trim().toLowerCase() || 'off';
	if (!MODES.has(mode)) throw new Error('OSIONOS_BRIDGE_TURNSTILE must be "off" or "enforce".');
	const secret = env.TURNSTILE_SECRET_KEY ?? '';
	if (mode === 'off') return { mode, secret, bypass: false };
	if (!secret) throw new Error('OSIONOS_BRIDGE_TURNSTILE=enforce needs TURNSTILE_SECRET_KEY.');
	const bypass = env.TURNSTILE_BYPASS_LOCAL === 'true';
	const publicDeployment = env.NODE_ENV === 'production' || String(env.GROBASE_PUBLIC_ADDRESSES ?? '').trim() !== '' || publicHttpsOrigin(env);
	if (bypass && publicDeployment) {
		throw new Error('TURNSTILE_BYPASS_LOCAL=true is not allowed with NODE_ENV=production, GROBASE_PUBLIC_ADDRESSES or a public https app origin: Turnstile would be skipped for the public.');
	}
	return { mode, secret, bypass };
}

export function turnstileBootLine(config) {
	if (config.turnstileMode !== 'enforce') return '[osionos-bridge] turnstile: off (OSIONOS_BRIDGE_TURNSTILE unset); the gateway alone decides.';
	if (config.turnstileBypassLocal) return '[osionos-bridge] turnstile: enforce with BYPASS (TURNSTILE_BYPASS_LOCAL=true, local development only).';
	return '[osionos-bridge] turnstile: enforce, verified by the bridge through siteverify.';
}

/** The first non-empty of the two accepted fields, trimmed. A non-string field counts as absent. */
function tokenFrom(payload) {
	for (const field of TOKEN_FIELDS) {
		const value = payload?.[field];
		if (typeof value === 'string' && value.trim() !== '') return value.trim();
	}
	return '';
}

async function siteverify(token, remoteIp, config, fetchImpl) {
	const form = new URLSearchParams({ secret: config.turnstileSecret, response: token });
	if (remoteIp) form.set('remoteip', remoteIp);
	let answer;
	try {
		const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
		if (!response.ok) throw new Error(`siteverify answered ${response.status}`);
		answer = await response.json();
	} catch {
		throw turnstileError(503, 'turnstile_unavailable', 'The sign-in check is unavailable; try again shortly.');
	}
	if (answer?.success !== true) throw turnstileError(422, 'turnstile_failed', 'The sign-in check failed; try again.');
}

/**
 * The token to forward to the gateway: the one the browser sent, verified here first.
 * `remoteIp` is the address the gateway would also see.
 */
export async function resolveTurnstileToken(payload, { config, fetchImpl, remoteIp = '' }) {
	// off: the constant the bridge always sent, whatever the browser sent.
	if (config.turnstileMode !== 'enforce') return LOCAL_BYPASS_TOKEN;
	const token = tokenFrom(payload);
	if (token.length > MAX_TOKEN_CHARS) throw turnstileError(422, 'turnstile_failed', 'The sign-in check failed; try again.');
	if (config.turnstileBypassLocal) return token || LOCAL_BYPASS_TOKEN;
	if (!token) throw turnstileError(422, 'turnstile_required', 'Complete the sign-in check and try again.');
	await siteverify(token, remoteIp, config, fetchImpl);
	return token;
}

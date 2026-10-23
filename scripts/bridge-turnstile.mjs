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

/** True only for the exact string "true"; refuses to exist on a public deployment. */
export function turnstileBypassFromEnv(env) {
	const bypass = env.TURNSTILE_BYPASS_LOCAL === 'true';
	if (bypass && (env.NODE_ENV === 'production' || String(env.GROBASE_PUBLIC_ADDRESSES ?? '').trim() !== '')) {
		throw new Error('TURNSTILE_BYPASS_LOCAL=true is not allowed with NODE_ENV=production or GROBASE_PUBLIC_ADDRESSES set: Turnstile would be skipped for the public.');
	}
	return bypass;
}

export function turnstileBootLine(config) {
	if (config.turnstileBypassLocal) return '[osionos-bridge] turnstile: BYPASS (TURNSTILE_BYPASS_LOCAL=true, local development only).';
	return config.turnstileSecret
		? '[osionos-bridge] turnstile: verified by the bridge through siteverify.'
		: '[osionos-bridge] turnstile: NOT CONFIGURED (TURNSTILE_SECRET_KEY unset); password sign-in answers 503.';
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
	const token = tokenFrom(payload);
	if (token.length > MAX_TOKEN_CHARS) throw turnstileError(422, 'turnstile_failed', 'The sign-in check failed; try again.');
	if (config.turnstileBypassLocal) return token || LOCAL_BYPASS_TOKEN;
	if (!token) throw turnstileError(422, 'turnstile_required', 'Complete the sign-in check and try again.');
	if (!config.turnstileSecret) throw turnstileError(503, 'turnstile_unconfigured', 'The sign-in check is not configured on this server.');
	await siteverify(token, remoteIp, config, fetchImpl);
	return token;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-connector.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Universal Connector — bridge broker for credential validation.
 *
 * `POST /api/connector/:providerKey/validate` proves a credential is live using
 * the lightest AUTHENTICATED, NON-COMPLETION endpoint (Anthropic: GET /v1/models).
 * The provider key lives only in this Node process (env) — it never reaches the
 * browser, logs, or the response. Upstream auth-error bodies are NOT echoed (they
 * can leak key fragments); we map to a generic { ok, code, message }.
 */

import { bearerToken } from './bridge-social-core.mjs';

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';
const VALIDATE_TIMEOUT_MS = 8000;
const CONNECTOR_RE = /^\/api\/connector\/([a-z0-9_-]+)\/validate$/;

function respondJson(response, status, body, config) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
	return true;
}

/** Anthropic credential probe — authenticated, non-completion (GET /v1/models). */
async function validateAnthropic(env, fetchImpl) {
	const key = env.ANTHROPIC_API_KEY;
	if (!key) {
		return { ok: false, code: 'invalid_credential', message: 'ANTHROPIC_API_KEY is not configured on the bridge.' };
	}
	// Bound the probe so a slow/hanging upstream can't pin a request open (DoS).
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
	try {
		const res = await fetchImpl(ANTHROPIC_MODELS_URL, {
			method: 'GET',
			headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
			signal: controller.signal,
		});
		if (res.ok) return { ok: true };
		if (res.status === 401 || res.status === 403) {
			return { ok: false, code: 'invalid_credential', message: 'Anthropic rejected the API key.' };
		}
		return { ok: false, code: 'unreachable', message: `Anthropic responded ${res.status}.` };
	} catch {
		return { ok: false, code: 'unreachable', message: 'Could not reach Anthropic.' };
	} finally {
		clearTimeout(timer);
	}
}

const VALIDATORS = { anthropic: validateAnthropic };

/** Mirrors createAgentHandler: returns false when the path is not ours. */
export function createConnectorHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	return async function handleConnectorRoute(url, request, response, requestConfig = config) {
		const match = CONNECTOR_RE.exec(url.pathname);
		if (!match) return false;
		if ((request.method || 'GET').toUpperCase() !== 'POST') return false;

		try {
			verifySession(bearerToken(request), requestConfig);
		} catch (error) {
			return respondJson(response, error?.status ?? 401, { ok: false, code: 'unknown', message: 'Authentication required.' }, requestConfig);
		}

		const providerKey = match[1];
		const validator = VALIDATORS[providerKey];
		const result = validator
			? await validator(env, fetchImpl)
			: { ok: false, code: 'unknown', message: `Unknown connector: ${providerKey}` };
		return respondJson(response, 200, result, requestConfig);
	};
}

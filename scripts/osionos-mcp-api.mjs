/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-mcp-api.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The HTTP layer of the MCP server: the JSON fetch, the credential it sends,
 * and the one retry a revoked session earns.
 *
 * The credential is a personal access token from OSIONOS_MCP_TOKEN (or, kept for
 * callers that already hold one, a bridge-issued bearer from OSIONOS_MCP_JWT). It
 * is read before any network call, and nothing mints a session for another user.
 * Credential order, first hit wins: OSIONOS_MCP_TOKEN, OSIONOS_MCP_JWT, an injected
 * `mintSession`. OSIONOS_MCP_JWT is NOT scoped by a PAT: it is a bearer the caller
 * already holds, sent as is with no scope mask, route allow-list or per-token revoke,
 * and it can only present its own user, never choose one.
 * A call refused with `session_revoked` drops the cache of an injected
 * `mintSession` (tests) and makes the call again -- ONCE (C128).
 *
 * The session is a module of its own so a test can drive it with a fake fetch:
 * the MCP server itself is a stdio program that starts its transport on import.
 */

import { isPatSecret } from './bridge-pat-store.mjs';

const FETCH_TIMEOUT_MS = 8_000;
/** A session is renewed this long before it expires. */
const RENEW_MARGIN_MS = 30_000;
/** The code of a refusal that means "this session is over". */
const REVOKED_CODE = 'session_revoked';
export const MISSING_TOKEN_TEXT = 'Set OSIONOS_MCP_TOKEN to a personal access token (Settings → Developer → New token).';
export const MALFORMED_TOKEN_TEXT = 'OSIONOS_MCP_TOKEN is not a personal access token (it must start with osio_pat_). Copy it again from Settings → Developer.';

/** What the model is told for each refusal code of the PAT gate; the gate answers `{ error: code }`. */
const PAT_HINTS = new Map([
  ['pat_invalid', 'The token is not valid, was revoked or has expired. Create a new token in Settings → Developer.'],
  ['pat_route_not_allowed', 'The token may not use this route.'],
  ['pat_scope_denied', "The token's permissions do not include this."],
  ['pat_forbidden_attribute', 'The token may not change those fields.'],
  ['pat_no_workspace', "The token's owner has no workspace."],
  ['pat_unavailable', 'Token lookup is unavailable; try again.'],
]);

/**
 * The personal access token of the environment: '' when unset, a refusal when it is not
 * shaped like one. The refusal never carries the value.
 *
 * @returns {string}
 */
export function mcpTokenFromEnv() {
  const token = String(process.env.OSIONOS_MCP_TOKEN ?? '').trim();
  if (token && !isPatSecret(token)) throw new Error(MALFORMED_TOKEN_TEXT);
  return token;
}

/** The refusal of the PAT gate rewritten as a plain sentence; the status and body stay on the error. */
function explainRefusal(error) {
  // error.body is read for its code only: it is never printed or put in a tool result.
  const hint = typeof error?.body?.error === 'string' ? PAT_HINTS.get(error.body.error) : undefined;
  if (hint) error.message = hint;
  return error;
}

/**
 * One fetch, with a deadline; the body is read as text.
 *
 * @param {typeof fetch} fetchImpl the fetch to use
 * @param {string} url the URL
 * @param {object} [options] the fetch options, plus a timeoutMs
 * @returns {Promise<{response: Response, text: string}>}
 */
export async function fetchText(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The JSON of a fetch, or an error that carries the status and the body -- so a
 * caller can read the code of a refusal (the 401 of a revoked session).
 *
 * @param {typeof fetch} fetchImpl the fetch to use
 * @param {string} url the URL
 * @param {object} [options] the fetch options, plus a timeoutMs
 * @returns {Promise<any>} the body
 */
export async function fetchJson(fetchImpl, url, options = {}) {
  const { response, text } = await fetchText(fetchImpl, url, options);
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (typeof body === 'object' && body && 'error' in body) message = body.error;
    else if (typeof body === 'object' && body && 'message' in body) message = body.message;
    const error = new Error(String(message));
    error.status = response.status;
    // Kept for callers that read a refusal code (explainRefusal, isRevoked); never print it.
    error.body = body;
    throw error;
  }
  return body;
}

/** True when the error is the 401 of a session that was revoked everywhere. */
function isRevoked(error) {
  // error.body is read for its code only: it is never printed.
  const code = error?.body?.code ?? error?.body?.error?.code;
  return error?.status === 401 && code === REVOKED_CODE;
}

/**
 * The API client of the MCP server: the session it keeps and the calls it makes.
 *
 * @param {object} deps
 * @param {typeof fetch} [deps.fetchImpl] the fetch the calls use
 * @param {() => Promise<{accessToken: string, refreshToken?: string, user?: unknown, workspaces?: unknown[], expiresAt?: number}>} [deps.mintSession] mints a new app session; the server passes none
 * @param {() => Promise<string>} deps.resolveApiUrl the API the calls go to
 * @returns {{request: (path: string, options?: object) => Promise<any>, session: () => Promise<string>, forget: () => void}}
 */
export function createMcpApiClient({ fetchImpl = fetch, mintSession, resolveApiUrl }) {
  let cachedSession = null;

  /**
   * The bearer the calls carry: the personal access token, the environment JWT, the
   * cached injected session, or a new injected one. No other source exists.
   *
   * @returns {Promise<string>}
   */
  async function session() {
    const token = mcpTokenFromEnv();
    if (token) return token;
    const envJwt = String(process.env.OSIONOS_MCP_JWT ?? '').trim();
    if (envJwt) return envJwt;
    if (!mintSession) throw new Error(MISSING_TOKEN_TEXT);
    if (cachedSession?.accessToken && cachedSession.expiresAt > Date.now() + RENEW_MARGIN_MS) {
      return cachedSession.accessToken;
    }
    const minted = await mintSession();
    cachedSession = {
      accessToken: String(minted?.accessToken ?? '').trim(),
      refreshToken: String(minted?.refreshToken ?? ''),
      user: minted?.user ?? null,
      workspaces: Array.isArray(minted?.workspaces) ? minted.workspaces : [],
      expiresAt: Number(minted?.expiresAt ?? 0),
    };
    return cachedSession.accessToken;
  }

  /**
   * One call, with the session bearer.
   *
   * @param {string} path the path of the route
   * @param {{method: string, body: unknown, auth: boolean}} options
   * @returns {Promise<any>}
   */
  async function once(path, { method, body, auth }) {
    // The credential is checked before the API is probed: no credential, no request at all.
    const bearer = auth ? await session() : '';
    const apiUrl = await resolveApiUrl();
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = `Bearer ${bearer}`;
    return fetchJson(fetchImpl, `${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((error) => { throw explainRefusal(error); });
  }

  /**
   * The call, and the one retry a revoked session earns.
   *
   * @param {string} path the path of the route
   * @param {{method?: string, body?: unknown, auth?: boolean}} [options]
   * @returns {Promise<any>}
   */
  async function request(path, { method = 'GET', body, auth = true } = {}) {
    try {
      return await once(path, { method, body, auth });
    } catch (error) {
      if (!auth || !isRevoked(error)) throw error;
      cachedSession = null;
      return await once(path, { method, body, auth });
    }
  }

  return { request, session, forget: () => { cachedSession = null; } };
}

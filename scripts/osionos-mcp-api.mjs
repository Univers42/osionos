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
 * The HTTP layer of the MCP server: the JSON fetch, the app session it keeps,
 * and the one retry a revoked session earns.
 *
 * The session is cached until it is close to its expiry. A call refused with
 * `session_revoked` (the user was signed out of every device) drops the cache,
 * mints a new session and makes the call again -- ONCE: a second refusal
 * surfaces, and the caller sees it (C128).
 *
 * The session is a module of its own so a test can drive it with a fake fetch:
 * the MCP server itself is a stdio program that starts its transport on import.
 */

const FETCH_TIMEOUT_MS = 8_000;
/** A session is renewed this long before it expires. */
const RENEW_MARGIN_MS = 30_000;
/** The code of a refusal that means "this session is over". */
const REVOKED_CODE = 'session_revoked';

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
    error.body = body;
    throw error;
  }
  return body;
}

/** True when the error is the 401 of a session that was revoked everywhere. */
function isRevoked(error) {
  const code = error?.body?.code ?? error?.body?.error?.code;
  return error?.status === 401 && code === REVOKED_CODE;
}

/**
 * The API client of the MCP server: the session it keeps and the calls it makes.
 *
 * @param {object} deps
 * @param {typeof fetch} [deps.fetchImpl] the fetch the calls use
 * @param {() => Promise<{accessToken: string, refreshToken?: string, user?: unknown, workspaces?: unknown[], expiresAt?: number}>} deps.mintSession mints a new app session
 * @param {() => Promise<string>} deps.resolveApiUrl the API the calls go to
 * @returns {{request: (path: string, options?: object) => Promise<any>, session: () => Promise<string>, forget: () => void}}
 */
export function createMcpApiClient({ fetchImpl = fetch, mintSession, resolveApiUrl }) {
  let cachedSession = null;

  /**
   * The token the calls carry: the environment one, the cached one, or a new one.
   *
   * @returns {Promise<string>}
   */
  async function session() {
    const envJwt = String(process.env.OSIONOS_MCP_JWT ?? '').trim();
    if (envJwt) return envJwt;
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
    const apiUrl = await resolveApiUrl();
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = `Bearer ${await session()}`;
    return fetchJson(fetchImpl, `${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

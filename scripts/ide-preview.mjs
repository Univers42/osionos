/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-preview.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Preview links for the IDE server: the app mints a signed, port-bound link and /p/<cap>/ serves
// the box's answer in an opaque origin. Split from bridge-ide-ops.mjs, which keeps the tunnel.

import { bearerToken, readJsonBody } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { jsonReply } from './bridge-ide-sandbox.mjs';
import { tunnelUpstream } from './bridge-ide-ops.mjs';
import { requireSandboxIdentity, deriveNames } from './ide-sandbox-spec.mjs';
import { ideTokenSecret, signPreviewCap, verifyPreviewCap } from './ide-token.mjs';

// The browser's origin check compares text, so a value with a path or trailing slash would never
// match; it is refused instead of silently locking every browser out. One rule for the allowed
// origin and the public preview origin.
export function parseExactOrigin(value, message) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error(message), { status: 503 }); }
  if (!['http:', 'https:'].includes(url.protocol) || value !== url.origin) {
    throw Object.assign(new Error(message), { status: 503 });
  }
  return url.origin;
}

// `*` without credentials: module scripts of an opaque-origin page are fetched in CORS mode and
// need it; `cross-origin` because `same-site` blocks every subresource of such a page (measured,
// Chrome 154). The CSP sandbox omits same-origin, top-navigation, downloads and modals so the box's
// pages cannot reach cookies, storage or the API origin.
export const PREVIEW_HEADERS = Object.freeze({
  'content-security-policy': "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'cross-origin-resource-policy': 'cross-origin',
  'access-control-allow-origin': '*',
});

const PREVIEW_PATH = /^\/p\/(pc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(\/.*)?$/;
const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+( *; *[\w-]+=[\w.+-]+)*$/;
const SAFE_ERROR_STATUSES = new Set([400, 403, 429, 503, 504]);

// Ponytail: the limit is about 8 x the 2 MiB response cap held per user; the number is an
// estimate, not a measurement. It undercounts across bridge replicas (the map is per process).
const MAX_INFLIGHT_PER_USER = 8;
const inflightByUser = new Map();

function sendPreviewText(response, status, message, method) {
  const body = Buffer.from(message);
  response.writeHead(status, { ...PREVIEW_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length });
  response.end(method === 'HEAD' ? undefined : body);
}

function previewFailure(response, error, method) {
  const status = error?.status ?? 502;
  if (status === 401) return sendPreviewText(response, 401, 'This preview link is not valid.', method);
  if (status === 410) return sendPreviewText(response, 410, 'This preview link has expired. Reopen it from the Ports panel.', method);
  const message = SAFE_ERROR_STATUSES.has(status) ? error.message : 'Preview failed.';
  return sendPreviewText(response, SAFE_ERROR_STATUSES.has(status) ? status : 502, message, method);
}

// Counted before the upstream call and released in a finally, so a failing or timed-out request
// cannot hold a slot.
async function withInflightSlot(userId, run) {
  const count = inflightByUser.get(userId) ?? 0;
  if (count >= MAX_INFLIGHT_PER_USER) throw Object.assign(new Error('Too many preview requests in flight.'), { status: 429 });
  inflightByUser.set(userId, count + 1);
  try {
    return await run();
  } finally {
    const left = (inflightByUser.get(userId) ?? 1) - 1;
    if (left > 0) inflightByUser.set(userId, left); else inflightByUser.delete(userId);
  }
}

// Only a validated content type and a length come from the box. Its set-cookie, location, CORS and
// CSP headers are dropped, so a redirect from the box loses its Location and is shown as is.
function sendUpstream(response, upstream, method) {
  const type = upstream.headers?.['content-type'];
  const body = Buffer.from(String(upstream.body ?? ''), 'base64');
  response.writeHead(upstream.status, {
    ...PREVIEW_HEADERS,
    'content-type': typeof type === 'string' && CONTENT_TYPE.test(type) ? type : 'application/octet-stream',
    'content-length': body.length,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

async function mintPreviewLink(request, requestConfig, { verifySession, env }) {
  const payload = await readJsonBody(request, 8 * 1024);
  const session = verifySession(bearerToken(request), requestConfig);
  // Identity first: an unlisted subject is told 403 whatever kind of token it holds.
  const { userId, workspaceId } = requireSandboxIdentity(session, payload?.workspaceId, env);
  if (!Number.isFinite(session?.exp)) throw Object.assign(new Error('Preview needs an IDE token.'), { status: 401 });
  const port = payload?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Object.assign(new Error('port must be an integer between 1 and 65535.'), { status: 400 });
  takeToken(`ide-preview-mint:${userId}`, { capacity: 20, refillPerSec: 0.5 });
  const notConfigured = 'Preview is not configured.';
  const base = parseExactOrigin(env.OSIONOS_IDE_PUBLIC_URL, notConfigured);
  const { cap } = signPreviewCap({ userId, workspaceId, port, secret: ideTokenSecret(env), parentExp: session.exp });
  return { ok: true, url: `${base}/p/${cap}/` };
}

async function servePreview(url, request, response, { env, upstream }) {
  const method = (request.method || 'GET').toUpperCase();
  try {
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) return sendPreviewText(response, 404, 'IDE sandbox is not enabled.', method);
    if (method !== 'GET' && method !== 'HEAD') return sendPreviewText(response, 405, 'Method not allowed.', method);
    const match = PREVIEW_PATH.exec(url.pathname);
    if (!match) return sendPreviewText(response, 404, 'Not found.', method);
    const { userId, workspaceId, port } = verifyPreviewCap(match[1], { secret: ideTokenSecret(env) });
    // Re-checked on every request: removing a subject from the allowlist ends its links at once.
    requireSandboxIdentity({ userId, workspaceIds: [workspaceId] }, workspaceId, env);
    takeToken(`ide-preview:${userId}`, { capacity: 120, refillPerSec: 40 });
    const answer = await withInflightSlot(userId, () => upstream(
      deriveNames(userId, workspaceId), port,
      { method, path: `${match[2] ?? '/'}${url.search}`, headers: { accept: String(request.headers.accept ?? '*/*') } },
    ));
    const status = answer?.status;
    if (answer?.truncated || !Number.isInteger(status) || status < 200 || status > 599) {
      return sendPreviewText(response, 502, 'Preview response was refused.', method);
    }
    return sendUpstream(response, answer, method);
  } catch (error) {
    return previewFailure(response, error, method);
  }
}

/** Preview links: the app mints a signed, port-bound link (POST /api/ide/preview/session) and the
 *  IDE server serves it at /p/<cap>/ in an opaque origin. No cookie exists, so the box's pages hold
 *  no credential. GET/HEAD only. */
export function createIdePreviewHandler({ config, verifySession, env = process.env, upstream = tunnelUpstream(env) }) {
  return async function handleIdePreviewRoute(url, request, response, requestConfig = config) {
    if (url.pathname.startsWith('/p/')) {
      await servePreview(url, request, response, { env, upstream });
      return true;
    }
    if (url.pathname !== '/api/ide/preview/session') return false;
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) {
      jsonReply(response, 404, { ok: false, message: 'IDE sandbox is not enabled.' }, requestConfig);
    } else if ((request.method || 'GET').toUpperCase() !== 'POST') {
      jsonReply(response, 405, { ok: false }, requestConfig);
    } else {
      try {
        jsonReply(response, 200, await mintPreviewLink(request, requestConfig, { verifySession, env }), requestConfig);
      } catch (error) {
        jsonReply(response, error?.status ?? 401, { ok: false, message: error?.message ?? 'Unauthorized.' }, requestConfig);
      }
    }
    return true;
  };
}

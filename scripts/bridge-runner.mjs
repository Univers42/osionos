// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-runner.mjs                                  :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

/**
 * bridge-runner — the authenticated broker in front of the osionos-runner code
 * sandbox (POST /api/ide/run). The bridge holds the trust boundary; the runner
 * only ever sees requests that already passed here.
 *
 * SECURITY (every point is a named devil condition):
 *  - Double-gate: no `OSIONOS_RUNNER_URL` env → 404, route disabled. The client
 *    `osio.ide` flag is NOT a security control; this env is. Ships unset.
 *  - Auth FIRST: verifySession → 401 JSON before any SSE stream is opened (copy
 *    of bridge-agent's createAgentHandler; NOT the unauth bypassPermissions spawn).
 *  - Language allowlist (defense-in-depth; the runner validates too), source size
 *    cap, stdin cap, clamped timeout.
 *  - Rate limit (token bucket) + per-user AND global concurrency caps, so N users
 *    can't melt the host runner.
 *  - The runner is reached only over the internal network; its SSE is piped
 *    straight back. The browser never talks to the runner.
 *
 * No new deps — Node built-ins + shared bridge helpers. Add to BOTH Dockerfile
 * COPY lists (bridge.Dockerfile, deploy/bridge-fly/Dockerfile) or it's absent
 * from the built images.
 */

import { bearerToken, readJsonBody, safeText } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

const RUN_BODY_LIMIT = 256 * 1024;
const MAX_STDIN = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const RUNNER_UPSTREAM_TIMEOUT_MS = 35_000;
const MAX_INFLIGHT_PER_USER = 2;
const MAX_INFLIGHT_GLOBAL = 8;

// Defense-in-depth allowlist — keep in sync with the runner's LANGS
// (infrastructure/docker/osionos/runner/server.mjs). The runner rejects unknown
// languages too; this fails fast before the upstream hop.
const RUN_LANGUAGES = new Set([
  'python', 'c', 'cpp', 'java', 'javascript', 'typescript', 'shell',
  'ruby', 'php', 'go', 'rust', 'lua', 'perl',
]);

const inflightByUser = new Map();
let inflightGlobal = 0;

function sse(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function jsonReply(response, status, body, config) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': config.allowedOrigin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

function writeSseHead(response, config) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'access-control-allow-origin': config.allowedOrigin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  });
}

/**
 * Factory mirroring the other bridge modules: returns a route handler that
 * returns true when it owns the route, false to fall through.
 */
export function createRunnerHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
  return async function handleRunnerRoute(url, request, response, requestConfig = config) {
    const isFormat = url.pathname === '/api/ide/format';
    if (url.pathname !== '/api/ide/run' && !isFormat) return false;
    if ((request.method || 'GET').toUpperCase() !== 'POST') return false;

    // Double-gate: no runner configured → route disabled (hidden). JSON, not SSE.
    const runnerUrl = env.OSIONOS_RUNNER_URL;
    if (!runnerUrl) { jsonReply(response, 404, { ok: false, message: 'Code runner is not enabled.' }, requestConfig); return true; }

    // Auth FIRST — 401 JSON before any SSE.
    let session;
    try {
      session = verifySession(bearerToken(request), requestConfig);
    } catch (error) {
      jsonReply(response, error?.status ?? 401, { ok: false, message: error instanceof Error ? error.message : 'Authentication required.' }, requestConfig);
      return true;
    }

    let payload;
    try {
      payload = await readJsonBody(request, RUN_BODY_LIMIT);
    } catch (error) {
      jsonReply(response, error?.status ?? 400, { ok: false, message: error instanceof Error ? error.message : 'Invalid request body.' }, requestConfig);
      return true;
    }

    const language = safeText(payload?.language, 32);
    const source = typeof payload?.source === 'string' ? payload.source : '';
    const stdin = typeof payload?.stdin === 'string' ? payload.stdin.slice(0, MAX_STDIN) : undefined;
    const timeoutMs = Math.min(Math.max(Number(payload?.timeoutMs) || DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
    if (!RUN_LANGUAGES.has(language)) { jsonReply(response, 400, { ok: false, message: `Unsupported language: ${language}` }, requestConfig); return true; }
    if (!source || source.length > RUN_BODY_LIMIT) { jsonReply(response, 400, { ok: false, message: 'Missing or oversized source.' }, requestConfig); return true; }

    // Format is a short JSON proxy (no SSE, no long-lived run slot). Rate-limited,
    // then passed through to the runner's /format (which owns the formatter set).
    if (isFormat) {
      try {
        takeToken(`fmt:${session.userId}`, { capacity: 20, refillPerSec: 1 });
      } catch (error) {
        jsonReply(response, error?.status ?? 429, { ok: false, message: 'Too many format requests.' }, requestConfig);
        return true;
      }
      try {
        const upstream = await fetchImpl(`${runnerUrl.replace(/\/$/, '')}/format`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ language, source }),
          signal: AbortSignal.timeout(RUNNER_UPSTREAM_TIMEOUT_MS),
        });
        const text = await upstream.text();
        response.writeHead(upstream.status, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'access-control-allow-origin': requestConfig.allowedOrigin,
          'access-control-allow-credentials': 'true',
          vary: 'Origin',
        });
        response.end(text);
      } catch {
        jsonReply(response, 502, { ok: false, message: 'Formatter unavailable.' }, requestConfig);
      }
      return true;
    }

    // Rate limit (throws 429) + per-user and global concurrency caps.
    try {
      takeToken(`run:${session.userId}`, { capacity: 6, refillPerSec: 0.15 });
    } catch (error) {
      jsonReply(response, error?.status ?? 429, { ok: false, message: 'Too many runs — slow down.' }, requestConfig);
      return true;
    }
    const perUser = inflightByUser.get(session.userId) || 0;
    if (perUser >= MAX_INFLIGHT_PER_USER || inflightGlobal >= MAX_INFLIGHT_GLOBAL) {
      jsonReply(response, 429, { ok: false, message: 'Too many concurrent runs.' }, requestConfig);
      return true;
    }
    inflightByUser.set(session.userId, perUser + 1);
    inflightGlobal += 1;

    writeSseHead(response, requestConfig);
    sse(response, 'meta', { language });

    const controller = new AbortController();
    request.on('close', () => controller.abort());
    const upstreamTimer = setTimeout(() => controller.abort(), RUNNER_UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetchImpl(`${runnerUrl.replace(/\/$/, '')}/exec`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language, source, stdin, timeoutMs }),
        signal: controller.signal,
      });
      if (!upstream.ok || !upstream.body) {
        sse(response, 'error', { message: `Runner error (${upstream.status})` });
      } else {
        // Pipe the runner's SSE straight to the browser (same event vocabulary).
        for await (const chunk of upstream.body) {
          if (response.writableEnded) break;
          response.write(chunk);
        }
      }
    } catch (error) {
      if (!response.writableEnded) sse(response, 'error', { message: 'Runner unavailable.' });
    } finally {
      clearTimeout(upstreamTimer);
      const left = (inflightByUser.get(session.userId) || 1) - 1;
      if (left <= 0) inflightByUser.delete(session.userId); else inflightByUser.set(session.userId, left);
      inflightGlobal = Math.max(0, inflightGlobal - 1);
      if (!response.writableEnded) response.end();
    }
    return true;
  };
}

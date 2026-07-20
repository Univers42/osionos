// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    bridge-ide-ops.mjs                                 :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// The IDE non-interactive ops: git (P6), container-backed ripgrep (P7), and file
// write (P4 editor→container / materialize). All run through the SAME exec engine
// the runner-daemon test proved, on the SERVER-derived container name, with
// validated argv (ide-sandbox-spec). Same double-gate + auth as the provisioner.
//
// PAT: request-scoped. The client sends the pasted token with a push/pull op; it
// is injected into that ONE git exec and never stored (condition 12/13). Nothing
// PAT lives server-side between requests.

import { bearerToken, readJsonBody } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { createDockerClient } from './ide-docker.mjs';
import {
  requireSandboxIdentity, deriveNames, buildGitExecSpec, buildSearchExecSpec, buildWriteExecSpec,
} from './ide-sandbox-spec.mjs';

const BODY_LIMIT = 1024 * 1024; // editor writes carry (base64) file content

function reply(response, status, body, config) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': config.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

/** ripgrep `--json` → flat matches. One JSON object per line; we keep `match`
 *  events. Pure + exported for a fixture test (no daemon needed). */
export function parseRipgrepJson(output) {
  const results = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'match') continue;
    const path = event.data?.path?.text;
    const text = (event.data?.lines?.text ?? '').replace(/\n$/, '');
    const lineNumber = event.data?.line_number;
    if (path && lineNumber) results.push({ path, lineNumber, line: text.slice(0, 200) });
    if (results.length >= 500) break;
  }
  return results;
}

/** Auth + identity + a running sandbox, or throw a {status} error. Rate-limit is
 *  charged BEFORE the shared-daemon inspect, so a flood is rejected locally with
 *  429 and never load-amplifies onto the docker daemon (review finding). */
async function resolveSandbox(request, payload, env, config, verifySession) {
  const session = verifySession(bearerToken(request), config);
  const identity = requireSandboxIdentity(session, payload?.workspaceId);
  takeToken(`ide-ops:${identity.userId}`, { capacity: 60, refillPerSec: 1 });
  const names = { ...identity, ...deriveNames(identity.userId, identity.workspaceId) };
  const docker = createDockerClient(env);
  const info = await docker.inspect(names.containerName);
  if (!info?.State?.Running) throw Object.assign(new Error('No running sandbox. Open the workspace first.'), { status: 409 });
  return { docker, names };
}

export function createIdeOpsHandler({ config, verifySession, env = process.env }) {
  const routes = new Set(['/api/ide/git', '/api/ide/search', '/api/ide/fs']);

  return async function handleIdeOpsRoute(url, request, response, requestConfig = config) {
    if (!routes.has(url.pathname)) return false;
    if ((request.method || 'GET').toUpperCase() !== 'POST') { reply(response, 405, { ok: false }, requestConfig); return true; }
    if (env.OSIONOS_IDE_SANDBOX !== '1' || !env.OSIONOS_IDE_DOCKER_HOST) { reply(response, 404, { ok: false, message: 'IDE sandbox is not enabled.' }, requestConfig); return true; }

    let payload;
    try { payload = await readJsonBody(request, BODY_LIMIT); }
    catch (error) { reply(response, error?.status ?? 400, { ok: false, message: 'Invalid body.' }, requestConfig); return true; }

    let ctx;
    try { ctx = await resolveSandbox(request, payload, env, requestConfig, verifySession); }
    catch (error) { reply(response, error?.status ?? 401, { ok: false, message: error?.message ?? 'Unauthorized.' }, requestConfig); return true; }

    try {
      if (url.pathname === '/api/ide/git') {
        const spec = buildGitExecSpec(payload.argv, typeof payload.pat === 'string' ? payload.pat : undefined);
        const { output, exitCode } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: exitCode === 0, exitCode, output: String(output).slice(0, 64 * 1024) }, requestConfig);
      } else if (url.pathname === '/api/ide/search') {
        const spec = buildSearchExecSpec(String(payload.query ?? ''), 200);
        const { output } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: true, results: parseRipgrepJson(String(output)) }, requestConfig);
      } else {
        const content = typeof payload.content === 'string' ? payload.content : '';
        const spec = buildWriteExecSpec(String(payload.path ?? ''), Buffer.from(content).toString('base64'));
        const { exitCode } = await ctx.docker.runExec(ctx.names.containerName, spec);
        reply(response, 200, { ok: exitCode === 0 }, requestConfig);
      }
    } catch (error) {
      reply(response, error?.status ?? 500, { ok: false, message: error?.message ?? 'Operation failed.' }, requestConfig);
    }
    return true;
  };
}

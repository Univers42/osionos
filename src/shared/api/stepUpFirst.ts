/**
 * Reads the step-up (sudo) grant before a request the bridge gates on it.
 *
 * Chrome logs every 4xx response as a console error, so letting the bridge answer
 * 403 `sudo_required` was an error line in a normal flow (Terminal > New Terminal, a password
 * change, an export; #293). For a gated request this wrapper first asks GET /api/account/sudo,
 * which answers 200 `{ active }` with the grant `requireSudo` checks (scripts/bridge-guard.mjs).
 * Without an active grant it answers the same 403 `sudo_required` itself, so callers and
 * `sudoRequiredAwareFetch` (which opens the prompt) see what they always saw, and nothing reaches
 * the network. The bridge still refuses on its own: this only avoids asking.
 *
 * Caveat: the table mirrors the bridge's `requireSudo` calls by hand (tests/canvas/
 * step-up-first.test.ts cross-checks it coarsely); a gated route missing here still works and
 * logs its 403 as before. A grant that expires between the read and the request also still gets
 * the bridge's 403, as does any request when the status cannot be read.
 */

import { SUDO_REQUIRED_CODE } from './sudoRequired';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface StepUpGatedRoute {
  method: 'POST' | 'DELETE';
  /** A literal path prefix, as the bridge module names it. */
  prefix: string;
  pattern: RegExp;
  /** Gated only for this body (the IDE token, when it is for a machine). */
  body?: (body: unknown) => boolean;
}

const MACHINE = 'm-[a-z2-7]{16}';
const UUID = '[0-9a-f-]{36}';
const route = (method: StepUpGatedRoute['method'], prefix: string, rest = '', body?: StepUpGatedRoute['body']): StepUpGatedRoute =>
  ({ method, prefix, pattern: new RegExp(`^${prefix}${rest}$`, 'i'), body });

export const STEP_UP_GATED: readonly StepUpGatedRoute[] = [
  route('POST', '/api/account/export'),
  route('POST', '/api/account/emails'),
  route('DELETE', '/api/account/emails', '/[^/]+'),
  route('POST', '/api/account/emails', '/[^/]+/(code|verify|primary)'),
  route('POST', '/api/account/2fa/enroll'),
  route('POST', '/api/account/2fa/disable'),
  route('POST', '/api/account/2fa/recovery/regenerate'),
  route('POST', '/api/account/keys'),
  route('DELETE', '/api/account/keys', '/[^/]+'),
  route('POST', '/api/account/password'),
  route('POST', '/api/account/username'),
  route('POST', '/api/account/deletion'),
  route('POST', '/api/account/tokens'),
  route('DELETE', '/api/account/tokens'),
  route('POST', '/api/machines', '/pair/(claim|approve)'),
  route('DELETE', '/api/machines', `/${MACHINE}`),
  route('POST', '/api/machines', `/${MACHINE}/token`),
  route('DELETE', '/api/workspaces', `/${UUID}`),
  route('POST', '/api/workspaces', `/${UUID}/(cancel-delete|members/transfer-ownership)`),
  route('POST', '/api/ide/token', '', (body) => (body as { scope?: unknown } | null)?.scope === 'node'),
];

function parsedBody(body: RequestInit['body']): unknown {
  if (typeof body !== 'string') return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function isStepUpGated(method: string, path: string, body?: RequestInit['body']): boolean {
  const upper = method.toUpperCase();
  return STEP_UP_GATED.some((entry) => entry.method === upper && entry.pattern.test(path)
    && (entry.body === undefined || entry.body(parsedBody(body))));
}

function authorizationOf(init?: RequestInit): Record<string, string> {
  const value = new Headers(init?.headers).get('Authorization');
  return value ? { Authorization: value } : {};
}

/** True only when the bridge said, with a 200, that no grant is active. */
async function knownInactive(inner: FetchLike, url: URL, init?: RequestInit): Promise<boolean> {
  try {
    const status = await inner(new URL('/api/account/sudo', url).href, { method: 'GET', headers: authorizationOf(init) });
    if (!status.ok) return false;
    const body = (await status.json().catch(() => null)) as { active?: unknown } | null;
    return body?.active === false;
  } catch {
    return false;
  }
}

const refusal = () => new Response(
  JSON.stringify({ ok: false, code: SUDO_REQUIRED_CODE, message: 'Sudo is required for this action.' }),
  { status: 403, headers: { 'Content-Type': 'application/json' } },
);

export function stepUpFirstFetch(inner: FetchLike): FetchLike {
  return async (input, init) => {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return inner(input, init);
    }
    if (!isStepUpGated(init?.method ?? 'GET', url.pathname, init?.body)) return inner(input, init);
    if (await knownInactive(inner, url, init)) return refusal();
    return inner(input, init);
  };
}

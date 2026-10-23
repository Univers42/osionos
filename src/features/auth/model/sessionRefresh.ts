/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionRefresh.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Keeping a bridge session alive: when a token is due, what the refresh route's answers
 * mean, the one-in-flight rule, and the cross-tab lease that stops two tabs from rotating
 * the same refresh token (the second use is a theft signal and kills the whole family).
 *
 * Caveat: the lease lives in localStorage, which has no compare-and-set. Two tabs that read
 * "no lease" in the same instant can both rotate; the bridge then answers the second with
 * `refresh_token_reused` and the account is signed out. The window is a few milliseconds
 * wide and the failure is closed (a sign-in, never a leak). A tab that dies mid-rotation
 * leaves its lease for LEASE_MS; if it died after the route answered but before the result
 * was published, nobody holds the new token and the next refresh signs the account out.
 */

import type { LogoutNotice } from '@/features/auth/model/bridgeLogout';
import { REVOKED_NOTICE } from '@/features/auth/model/bridgeLogout';
import { isBridgeAppToken, isBridgeAppTokenExpired } from '@/features/auth/model/userStore.helpers';

export const REFRESH_SKEW_MS = 5 * 60 * 1000;
export const REFRESH_PATH = '/api/auth/bridge/refresh';
export const REFRESH_REUSE_CODE = 'refresh_token_reused';
// Caveat: a guess. A bridge slower than this is reported 'unreachable' (kept, retried) even if it rotated.
export const REFRESH_TIMEOUT_MS = 8000;
const LEASE_MS = 10_000;
const LEASE_POLL_MS = 200;
const BRIDGE_REFRESH_TOKEN_PREFIX = 'osb_rt.';

/** The answers after which the session is gone for good; everything else is retried later. */
const FINAL_CODES = new Set([REFRESH_REUSE_CODE, 'refresh_token_invalid', 'refresh_token_expired', 'session_revoked']);

export const REUSED_NOTICE: LogoutNotice = {
  kind: 'error',
  title: 'You were signed out',
  description: 'This sign-in was used twice, which can mean it was copied. Sign in again; your unsynced edits are kept.',
};

export const SESSION_ENDED_NOTICE: LogoutNotice = {
  kind: 'info',
  title: 'Your session ended',
  description: 'It was inactive for too long. Sign in again; your unsynced edits are kept.',
};

export type RefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number }
  | { ok: false; code: string; status: number };

export type RefreshOutcome = 'refreshed' | 'adopted' | 'signed_out' | 'kept' | 'skipped';

export type RefreshedTokens = { accessToken: string; refreshToken: string; expiresAt?: number };

export function isFinalRefreshFailure(code: string): boolean {
  return FINAL_CODES.has(code);
}

export function noticeForRefreshFailure(code: string): LogoutNotice {
  if (code === REFRESH_REUSE_CODE) return REUSED_NOTICE;
  return code === 'session_revoked' ? REVOKED_NOTICE : SESSION_ENDED_NOTICE;
}

/** True when the bridge token expires within the skew or already has. A foreign token never needs it. */
export function needsRefresh(token: string | null | undefined, now = Date.now()): boolean {
  return isBridgeAppToken(token) && isBridgeAppTokenExpired(token, now + REFRESH_SKEW_MS);
}

/** An expiry the bridge sent as epoch milliseconds, or a stored ISO string, as an ISO string. */
export function isoExpiry(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return typeof value === 'string' && value ? value : undefined;
}

const failure = (code: string, status = 0): RefreshResult => ({ ok: false, code, status });

async function resultOf(response: Response): Promise<RefreshResult> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const { accessToken, refreshToken, expiresAt } = body ?? {};
  if (response.ok) {
    const valid = isBridgeAppToken(accessToken as string)
      && typeof refreshToken === 'string' && refreshToken.startsWith(BRIDGE_REFRESH_TOKEN_PREFIX)
      && typeof expiresAt === 'number' && Number.isFinite(expiresAt);
    return valid
      ? { ok: true, accessToken: accessToken as string, refreshToken: refreshToken as string, expiresAt: expiresAt as number }
      : failure('refresh_response_invalid', response.status);
  }
  return failure(typeof body?.code === 'string' ? body.code : `http_${response.status}`, response.status);
}

/**
 * POST the refresh token (body only, never a header or a URL) and read the bridge's answer.
 * Never throws. A token that is not the bridge's own (the gateway's, or none) is not sent.
 */
export async function refreshBridgeSession(options: {
  apiBase: string;
  refreshToken: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}): Promise<RefreshResult> {
  const { apiBase, refreshToken, fetchImpl = (input, init) => fetch(input, init), signal } = options;
  if (!apiBase || !refreshToken.startsWith(BRIDGE_REFRESH_TOKEN_PREFIX)) return failure('no_refresh_token');
  try {
    const response = await fetchImpl(`${apiBase}${REFRESH_PATH}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: signal ?? AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    return await resultOf(response);
  } catch {
    return failure('unreachable');
  }
}

/** Callers with the same key share the run that is already in flight; the next call starts a new one. */
export function createSingleFlight<T>() {
  const inflight = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const running = inflight.get(key);
    if (running) return running;
    const started = run().finally(() => inflight.delete(key));
    inflight.set(key, started);
    return started;
  };
}

export interface RefreshStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface RefreshDeps {
  userId: string;
  /** The tokens as they are NOW (the persisted record wins over a stale in-memory copy). */
  readTokens: () => { accessToken: string; refreshToken?: string } | null;
  rotate: (refreshToken: string) => Promise<RefreshResult>;
  /** Applies tokens to this tab's session and persisted record. */
  adopt: (tokens: RefreshedTokens) => void;
  signOut: (code: string) => void;
  storage?: RefreshStorage | null;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

type Lease = { owner: string; until: number };
type Published = RefreshedTokens & { prev: string };

const leaseKey = (userId: string) => `osionos:refresh-lease:${userId}`;
const resultKey = (userId: string) => `osionos:refresh-result:${userId}`;

function readJson<T>(storage: RefreshStorage | null | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(storage: RefreshStorage | null | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // No storage means no coordination, not no refresh.
  }
}

function remove(storage: RefreshStorage | null | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Same as writeJson.
  }
}

/** A result another tab published for the token this tab holds: adopt it instead of rotating. */
function adoptPublished(deps: RefreshDeps, ownRefreshToken: string): boolean {
  const published = readJson<Published>(deps.storage, resultKey(deps.userId));
  if (!published || published.prev !== ownRefreshToken || !published.accessToken || !published.refreshToken) return false;
  deps.adopt({ accessToken: published.accessToken, refreshToken: published.refreshToken, expiresAt: published.expiresAt });
  return true;
}

/** Waits while another tab holds a fresh lease; takes it once it is free or has lapsed. */
async function takeLease(deps: RefreshDeps, owner: string, ownRefreshToken: string): Promise<'held' | 'adopted'> {
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let polls = 0; polls <= LEASE_MS / LEASE_POLL_MS + 1; polls += 1) {
    const lease = readJson<Lease>(deps.storage, leaseKey(deps.userId));
    if (!lease || lease.until <= now() || lease.owner === owner) break;
    await wait(LEASE_POLL_MS);
    if (adoptPublished(deps, ownRefreshToken)) return 'adopted';
  }
  writeJson(deps.storage, leaseKey(deps.userId), { owner, until: now() + LEASE_MS } satisfies Lease);
  return 'held';
}

function releaseLease(deps: RefreshDeps, owner: string) {
  if (readJson<Lease>(deps.storage, leaseKey(deps.userId))?.owner === owner) remove(deps.storage, leaseKey(deps.userId));
}

async function rotateHolding(deps: RefreshDeps, refreshToken: string): Promise<RefreshOutcome> {
  const result = await deps.rotate(refreshToken);
  if (result.ok) {
    const tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
    deps.adopt(tokens);
    writeJson(deps.storage, resultKey(deps.userId), { prev: refreshToken, ...tokens } satisfies Published);
    return 'refreshed';
  }
  if (!isFinalRefreshFailure(result.code)) return 'kept';
  remove(deps.storage, resultKey(deps.userId));
  deps.signOut(result.code);
  return 'signed_out';
}

/**
 * One rotation for one account, in the order that keeps two tabs from both rotating:
 * check the published result, take the lease, check again, call the route, publish, release.
 */
export async function runRefresh(deps: RefreshDeps): Promise<RefreshOutcome> {
  const start = deps.readTokens()?.refreshToken;
  if (!start) return 'skipped';
  if (adoptPublished(deps, start)) return 'adopted';
  const owner = `${deps.now ? deps.now() : Date.now()}-${crypto.randomUUID()}`;
  if (await takeLease(deps, owner, start) === 'adopted') return 'adopted';
  try {
    const current = deps.readTokens()?.refreshToken;
    if (!current) return 'skipped';
    if (adoptPublished(deps, current)) return 'adopted';
    return await rotateHolding(deps, current);
  } finally {
    releaseLease(deps, owner);
  }
}

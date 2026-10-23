/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountSecurityApi.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the account plane's step-up and identity routes (P1-2b): the emailed sudo
 * code, the username change and the deletion request.
 *
 * Like `accountProfileApi`, it calls `fetch` itself: the shared `api` client turns every
 * non-2xx into an `ApiError` that drops the body's `retryAfterSeconds`, which the sudo
 * prompt needs. The fetch goes through `sudoRequiredAwareFetch`, so a `sudo_required` 403
 * raises the one SudoPrompt without any caller handling it.
 *
 * Caveat: `retryAfterSeconds` is read from the body, then the `Retry-After` header; a
 * 429 with neither reports no wait and the prompt says "a little later". `deletionStatus` reads any 404 as "no
 * request", so a bridge that lacks the route looks like an account with nothing scheduled.
 */

import { API_BASE } from '@/shared/api/client';
import { sudoRequiredAwareFetch } from '@/shared/api/sudoRequired';
import { classifySettingsError, settingsJwt } from '@/store/settings/settingsStoreUtils';

export type AccountSecurityOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'sudo_required' | 'unavailable' }
  | { ok: false; reason: 'rate_limited'; code: string; retryAfterSeconds: number | null }
  | { ok: false; reason: 'refused' | 'failed'; code: string; message: string };

export interface DeletionRequest {
  requestedAt: string | null;
  scheduledFor: string | null;
}

const guardedFetch = sudoRequiredAwareFetch((input, init) => fetch(input, init));

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function retryAfter(response: Response, body: Record<string, unknown>): number | null {
  const fromBody = Number(body.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  const fromHeader = Number(response.headers.get('retry-after'));
  return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : null;
}

function failure<T>(response: Response, body: Record<string, unknown>): AccountSecurityOutcome<T> {
  const code = text(body.code) ?? 'request_failed';
  if (response.status === 429) return { ok: false, reason: 'rate_limited', code, retryAfterSeconds: retryAfter(response, body) };
  const kind = classifySettingsError(response.status, code);
  if (kind === 'sudo_required') return { ok: false, reason: 'sudo_required' };
  // sudo_unavailable has its own sentence in the prompt, so it stays a refusal with its code.
  if (kind === 'unavailable' && code !== 'sudo_unavailable') return { ok: false, reason: 'unavailable' };
  const message = text(body.message) ?? `The request failed (${response.status}).`;
  return { ok: false, reason: response.status >= 500 ? 'failed' : 'refused', code, message };
}

async function call<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  read: (payload: Record<string, unknown>) => T,
  missing?: T,
): Promise<AccountSecurityOutcome<T>> {
  const jwt = settingsJwt();
  if (!API_BASE || !jwt) return { ok: false, reason: 'unavailable' };
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await guardedFetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    return { ok: false, reason: 'failed', code: 'network', message: error instanceof Error ? error.message : 'The request failed.' };
  }
  const payload = await bodyOf(response);
  if (response.ok) return { ok: true, data: read(payload) };
  if (missing !== undefined && response.status === 404) return { ok: true, data: missing };
  return failure(response, payload);
}

const deletionOf = (payload: Record<string, unknown>): DeletionRequest => ({
  requestedAt: text(payload.requestedAt),
  scheduledFor: text(payload.scheduledFor),
});

/** Sends the emailed code. The address comes from the session, never from the client. */
export const requestSudoCode = () =>
  call('POST', '/api/account/sudo/email', {}, (payload) => ({ sentTo: text(payload.sentTo) ?? '' }));

export const verifySudoCode = (code: string) =>
  call('POST', '/api/account/sudo/verify', { code }, () => null);

export const sudoStatus = () =>
  call('GET', '/api/account/sudo', undefined, (payload) => ({ active: payload.active === true, expiresAt: text(payload.expiresAt) }));

export const changeUsername = (username: string) =>
  call('POST', '/api/account/username', { username }, (payload) => ({ username: text(payload.username) ?? username }));

export const requestDeletion = () => call('POST', '/api/account/deletion', {}, deletionOf);

/** `data: null` is "no request is open": a 404 here is an answer, not a failure. */
export const deletionStatus = () =>
  call<DeletionRequest | null>('GET', '/api/account/deletion', undefined, deletionOf, null);

export const cancelDeletion = () => call('DELETE', '/api/account/deletion', undefined, () => null);

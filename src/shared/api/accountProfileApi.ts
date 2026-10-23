/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountProfileApi.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The one client for the account profile route (`GET` and `PATCH /api/account/profile`).
 *
 * The shared `api` client cannot carry this route: `http-gate` sends no `If-Match`
 * header and its `ApiError` drops the 412 body's `version` and `profile`, so a client
 * that wants to know what the row looks like now has nothing to look at. This module
 * therefore calls `fetch` itself — the one exception to "no fetch wrapper of its own",
 * and it exists for that reason alone.
 *
 * The outcome is typed, because "the request went out" and "the profile was saved" are
 * different things: `ok` (the row and its version), `conflict` (the server's row and its
 * version, read from the 412), `invalid` (the field the server refused), `unavailable`
 * (this server does not serve the route) and `failed` (everything else).
 */

import { API_BASE } from '@/shared/api/client';
import { classifySettingsError, settingsJwt } from '@/store/settings/settingsStoreUtils';

const PROFILE_PATH = '/api/account/profile';

/** The caller's own row, as the bridge answers it. */
export interface AccountProfile {
  userId: string;
  displayName: string | null;
  username: string | null;
  pronouns: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  website: string | null;
  links: string[] | null;
  timezone: string | null;
  orcid: string | null;
  patreon: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  directoryOptOut: boolean | null;
  profession: string | null;
  readmePageId: string | null;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The columns a client may write. `username` is P1-2b's and is not here. */
export type AccountProfilePatch = Partial<Pick<AccountProfile,
  'displayName' | 'pronouns' | 'headline' | 'bio' | 'location' | 'company' | 'website' | 'links'
  | 'timezone' | 'orcid' | 'patreon' | 'directoryOptOut' | 'profession' | 'readmePageId'>>;

export type AccountProfileOutcome =
  | { ok: true; profile: AccountProfile; version: number }
  | { ok: false; reason: 'conflict'; profile: AccountProfile | null; version: number | null }
  | { ok: false; reason: 'invalid'; field: string | null }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed'; message: string };

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The row, or null when the body is not a profile at all. */
function toProfile(raw: unknown): AccountProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.userId !== 'string') return null;
  return {
    userId: row.userId,
    displayName: text(row.displayName),
    username: text(row.username),
    pronouns: text(row.pronouns),
    headline: text(row.headline),
    bio: text(row.bio),
    location: text(row.location),
    company: text(row.company),
    website: text(row.website),
    links: Array.isArray(row.links) ? row.links.filter((link): link is string => typeof link === 'string') : null,
    timezone: text(row.timezone),
    orcid: text(row.orcid),
    patreon: text(row.patreon),
    avatarUrl: text(row.avatarUrl),
    bannerUrl: text(row.bannerUrl),
    directoryOptOut: typeof row.directoryOptOut === 'boolean' ? row.directoryOptOut : null,
    profession: text(row.profession),
    readmePageId: text(row.readmePageId),
    version: count(row.version),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

/** The version the row carries: the body first, the ETag second. */
function versionOf(body: Record<string, unknown>, etag: string | null): number {
  if (body.version !== undefined && body.version !== null) return count(body.version);
  const fromEtag = Number(String(etag ?? '').replace(/^W\//i, '').replace(/^"(.*)"$/, '$1'));
  return Number.isFinite(fromEtag) ? fromEtag : 0;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readOutcome(response: Response, body: Record<string, unknown>): AccountProfileOutcome {
  if (response.status === 412) {
    return {
      ok: false,
      reason: 'conflict',
      profile: toProfile(body.profile),
      version: body.version === undefined || body.version === null ? null : count(body.version),
    };
  }
  if (response.status === 422) {
    return { ok: false, reason: 'invalid', field: text(body.field) };
  }
  if (response.ok) {
    const profile = toProfile(body);
    if (!profile) return { ok: false, reason: 'failed', message: 'The server answered without a profile.' };
    return { ok: true, profile, version: versionOf(body, response.headers.get('etag')) };
  }
  const code = text(body.code);
  if (classifySettingsError(response.status, code) === 'unavailable') return { ok: false, reason: 'unavailable' };
  return {
    ok: false,
    reason: 'failed',
    message: text(body.message) ?? `The request failed (${response.status}).`,
  };
}

async function callProfile(method: 'GET' | 'PATCH', body?: unknown, version?: number): Promise<AccountProfileOutcome> {
  const jwt = settingsJwt();
  if (!API_BASE || !jwt) return { ok: false, reason: 'unavailable' };
  if (method === 'PATCH' && !Number.isFinite(version)) {
    // Without an ETag there is no row to write against: the server would answer 428.
    return { ok: false, reason: 'unavailable' };
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (version !== undefined) headers['If-Match'] = `"${version}"`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${PROFILE_PATH}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : 'The request failed.' };
  }
  return readOutcome(response, await bodyOf(response));
}

/** The caller's own profile and its version. */
export function fetchAccountProfile(): Promise<AccountProfileOutcome> {
  return callProfile('GET');
}

/**
 * Writes the patch against the version the client holds. The body carries only the
 * patched fields, so a retry can never overwrite another column.
 */
export function saveAccountProfile(patch: AccountProfilePatch, version: number): Promise<AccountProfileOutcome> {
  return callProfile('PATCH', patch, version);
}

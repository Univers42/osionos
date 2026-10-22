/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   personalization.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the personalization routes: the user's switch over the
 * recommender's log, and their activity to download or clear (C48, C54).
 *
 * The call rides the app's authenticated helper — `api` from @/shared/api/client
 * with the session JWT — like every other settings call. With no API configured
 * (an offline build) every function answers "not available": never a fake
 * success, so the panel can say the truth instead of pretending the switch was
 * saved.
 *
 * The bridge decides whose row it is: the body of the write carries the switch
 * and nothing else, and the server names the user.
 *
 * The download carries the log AND the vectors the recommender derived from
 * it — the data derived from the user is the user's data too (C54).
 */

import { API_BASE, api, getActiveJwt } from '@/shared/api/client';

/** One row of the log, with the columns the database stores. */
export interface PersonalizationEvent {
  id?: number;
  ts?: string;
  user_id?: string;
  item_kind?: string;
  item_id?: string;
  workspace_id?: string | null;
  event?: string;
  weight?: number;
  surface?: string;
  rec_id?: string | null;
  rank?: number | null;
  dwell_ms?: number | null;
  is_synthetic?: boolean;
}

/** One vector the recommender computed: a model's read of the user. */
export interface RecommendationVector {
  model_id?: number;
  status?: string;
  trained_until?: string | null;
  factors?: number;
  vector?: number[];
}

/**
 * The vectors derived from the user: the ones the models hold of them, and the
 * ones where they are a suggested person. The database answers them as one
 * JSONB object; the fields are optional because the answer is the database's.
 */
export interface RecommendationFactors {
  user_vectors?: RecommendationVector[];
  as_item?: RecommendationVector[];
}

/** The download: the log, and what was derived from it. */
export interface ActivityExport {
  /** The log itself, oldest first. */
  events: PersonalizationEvent[];
  /** The vectors: null when the database function is not deployed yet. */
  derived: { factors: RecommendationFactors | null };
}

/** The answer of a personalization call: the value, or why there is none. */
export type PersonalizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'unavailable' | 'failed'; message: string };

/**
 * The bridge the calls ride. The default is the app's own helper; the tests
 * replace it whole, so a request can be read before it is sent.
 */
export interface PersonalizationBridge {
  /** The bridge base URL. Empty = no API configured. */
  baseUrl: string;
  /** The session bearer, or null when there is no session. */
  jwt: () => string | null;
  /** The call itself: method, path and body. */
  call: <T>(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) => Promise<T>;
}

/** The bridge of the app: the authenticated helper, with the session JWT. */
export const appPersonalizationBridge: PersonalizationBridge = {
  baseUrl: API_BASE,
  jwt: getActiveJwt,
  call: <T>(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown) => {
    const jwt = getActiveJwt() ?? undefined;
    if (method === 'GET') return api.get<T>(path, jwt);
    if (method === 'PUT') return api.put<T>(path, body, jwt);
    return api.delete<T>(path, jwt);
  },
};

let bridge: PersonalizationBridge = appPersonalizationBridge;

/** Replaces the bridge. The tests use it; the app never calls it. */
export function setPersonalizationBridge(next: PersonalizationBridge): void {
  bridge = next;
}

const UNAVAILABLE = 'The privacy settings are not available in this build.';
const SIGNED_OUT = 'Sign in to manage your activity.';

/** One call, and the two ways it can fail without pretending it worked. */
async function request<T>(
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<PersonalizationResult<T>> {
  if (!bridge.baseUrl) return { ok: false, code: 'unavailable', message: UNAVAILABLE };
  if (!bridge.jwt()) return { ok: false, code: 'unavailable', message: SIGNED_OUT };
  try {
    return { ok: true, value: await bridge.call<T>(method, path, body) };
  } catch (error) {
    return {
      ok: false,
      code: 'failed',
      message: error instanceof Error ? error.message : 'The request failed.',
    };
  }
}

/** The switch, as the server has it. A user with no row collects by default. */
export async function readPersonalization(): Promise<PersonalizationResult<{ captureExplicit: boolean }>> {
  const result = await request<{ captureExplicit?: boolean }>('GET', '/api/personalization');
  if (!result.ok) return result;
  return { ok: true, value: { captureExplicit: result.value?.captureExplicit !== false } };
}

/** The switch, saved. The server decides whose row it is, not the body. */
export async function writePersonalization(capture: boolean): Promise<PersonalizationResult<{ captureExplicit: boolean }>> {
  const result = await request<{ captureExplicit?: boolean }>('PUT', '/api/personalization', {
    captureExplicit: capture,
  });
  if (!result.ok) return result;
  return { ok: true, value: { captureExplicit: result.value?.captureExplicit !== false } };
}

/**
 * The user's own log, oldest first, with the columns the database stores —
 * and the vectors the recommender derived from that log: a download that
 * leaves out the data derived from the user is not the user's data.
 *
 * An older bridge answers no `derived` at all (the function is not deployed
 * yet): the download is then the log alone, and the vectors are null.
 */
export async function downloadActivity(): Promise<PersonalizationResult<ActivityExport>> {
  const result = await request<{
    events?: PersonalizationEvent[];
    derived?: { factors?: RecommendationFactors | null };
  }>('GET', '/api/personalization/activity');
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      events: Array.isArray(result.value?.events) ? result.value.events : [],
      derived: { factors: result.value?.derived?.factors ?? null },
    },
  };
}

/** The user's own log, gone. The answer says how many rows were erased. */
export async function clearActivity(): Promise<PersonalizationResult<{ erased: number }>> {
  const result = await request<{ erased?: number }>('DELETE', '/api/personalization/activity');
  if (!result.ok) return result;
  return { ok: true, value: { erased: Number(result.value?.erased) || 0 } };
}

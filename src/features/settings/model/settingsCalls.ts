/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsCalls.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, api, ApiError, getActivePageJwt } from '@/shared/api/client';
import { classifySettingsError } from '@/store/settings/settingsStoreUtils';

import { recordSettingsAction } from '@/store/settings';

export function runAsync(work: Promise<unknown>) {
  work.catch(() => undefined);
}

export function runMaybeAsync(work: Promise<unknown> | void) {
  Promise.resolve(work).catch(() => undefined);
}

export function noopHandledAction(label: string, metadata: Record<string, unknown> = {}) {
  recordSettingsAction(label, metadata);
}

/**
 * Why an account action did not happen. `unavailable` means this server does
 * not offer the action yet; `sudo_required` means it wants a fresh sign-in (the
 * shared fetch path raises the prompt); `failed` is everything else.
 */
export type AccountActionFailure = 'unavailable' | 'sudo_required' | 'failed';

export type AccountActionOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AccountActionFailure; message: string };

/** What the user is told. `null` means: say nothing (the sudo prompt speaks). */
export interface AccountActionNotice {
  kind: 'info' | 'error';
  title: string;
  description?: string;
}

/**
 * Runs an account action and reports what the server actually did.
 *
 * The outcome is never a bare `null`: a caller that forgets to look at `ok`
 * still cannot mistake "nothing happened" for "it worked".
 */
export async function runAccountAction<T>(path: string, body: unknown): Promise<AccountActionOutcome<T>> {
  const jwt = getActivePageJwt();
  if (!jwt || !API_BASE) {
    return { ok: false, reason: 'unavailable', message: 'This server does not offer this action yet.' };
  }
  try {
    const data = await api.post<T>(path, body, jwt);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      const reason = classifySettingsError(error.status, error.code);
      if (reason === 'unavailable') {
        return { ok: false, reason, message: 'This server does not offer this action yet.' };
      }
      if (reason === 'sudo_required') {
        return { ok: false, reason, message: 'This action needs a fresh sign-in.' };
      }
    }
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : 'The request failed.' };
  }
}

/**
 * The honest notice for an action that did not happen. `null` for a success
 * and for a sudo refusal: the shared fetch path raises the re-auth prompt, so
 * an extra toast would only say less.
 */
export function accountActionNotice(outcome: AccountActionOutcome<unknown>, action: string): AccountActionNotice | null {
  if (outcome.ok) return null;
  if (outcome.reason === 'sudo_required') return null;
  if (outcome.reason === 'unavailable') {
    return { kind: 'info', title: `${action} isn't available on this server yet` };
  }
  return { kind: 'error', title: `${action} failed`, description: outcome.message };
}

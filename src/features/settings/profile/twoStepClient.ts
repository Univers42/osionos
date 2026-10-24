/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   twoStepClient.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client side of the two-step routes (P3-2-a, P3-2-b). The server owns every fact here:
 * `enabled` is whatever GET /api/account/2fa/status says, and the preferred method only
 * orders the options the modal shows; the server never reads it.
 *
 * Caveat: confirm and disable cut off every session issued before them, so the answer's new
 * refresh token (a new family, bridge-session-stepup.mjs) is the only way this device stays in.
 * A server with session records off answers no refresh token; then the old pair stays.
 */

import { useCallback, useEffect, useState } from 'react';

import { adoptStepUpToken, dropLocalSession } from '@/features/auth';
import { trySettingsGet, errorMessage } from '@/store/settings/settingsStoreUtils';
import { runAccountAction } from '../model/settingsCalls';

export interface TwoStepStatus {
  enabled: boolean;
  recoveryRemaining: number;
}

export type TwoStepState =
  | { phase: 'loading' }
  | { phase: 'unavailable'; reason?: string }
  | { phase: 'ready'; status: TwoStepStatus };

export async function fetchTwoStepStatus(): Promise<TwoStepState> {
  try {
    const body = await trySettingsGet<{ enabled?: boolean; recoveryRemaining?: number }>('/api/account/2fa/status');
    if (!body || typeof body.enabled !== 'boolean') return { phase: 'unavailable' };
    return { phase: 'ready', status: { enabled: body.enabled, recoveryRemaining: Number(body.recoveryRemaining) || 0 } };
  } catch (error) {
    return { phase: 'unavailable', reason: errorMessage(error) };
  }
}

export function useTwoStepStatus(): { state: TwoStepState; refresh: () => Promise<void> } {
  const [state, setState] = useState<TwoStepState>({ phase: 'loading' });
  const refresh = useCallback(async () => setState(await fetchTwoStepStatus()), []);
  useEffect(() => {
    let live = true;
    fetchTwoStepStatus().then((next) => { if (live) setState(next); }, () => undefined);
    return () => { live = false; };
  }, []);
  return { state, refresh };
}

/** Uses the tokens a verify or disable returned, because the server just retired the old family. */
export function adoptSessionToken(userId: string, accessToken: string | undefined, refreshToken?: string): void {
  if (accessToken) adoptStepUpToken(userId, accessToken, refreshToken);
}

export const RECORD_UNAVAILABLE = 'session_record_unavailable';
export const SIGNED_OUT_NOTICE = 'Two-step verification changed and you are signed out; sign in again.';

/** The server changed the factor but could not start the new session: it is signed out, so is this device. */
export const dropSessionAfterStepUp = (userId: string): void => dropLocalSession(userId);

export const startEnrolment = () => runAccountAction<{ otpauthUrl?: string }>('/api/account/2fa/enroll', {});
export const confirmEnrolment = (code: string) => runAccountAction<{ accessToken?: string; refreshToken?: string }>('/api/account/2fa/verify', { code });
export const createRecoveryCodes = () => runAccountAction<{ codes?: string[] }>('/api/account/2fa/recovery/generate', {});
export const disableTwoStep = () => runAccountAction<{ accessToken?: string; refreshToken?: string }>('/api/account/2fa/disable', {});

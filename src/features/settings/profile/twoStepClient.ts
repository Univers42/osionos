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
 * Caveat: the new token (after verify or disable) carries no refresh token, and the cut-off
 * also refuses the refresh family issued before it (bridge-sessions.mjs assertSessionNotCutOff
 * on fam_iat_ms), so this device signs in again when that access token expires.
 */

import { useCallback, useEffect, useState } from 'react';

import { adoptStepUpToken } from '@/features/auth';
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

/** Uses the token a verify or disable returned, because the server just retired the old one. */
export function adoptSessionToken(userId: string, accessToken: string | undefined): void {
  if (accessToken) adoptStepUpToken(userId, accessToken);
}

export const startEnrolment = () => runAccountAction<{ otpauthUrl?: string }>('/api/account/2fa/enroll', {});
export const confirmEnrolment = (code: string) => runAccountAction<{ accessToken?: string }>('/api/account/2fa/verify', { code });
export const createRecoveryCodes = () => runAccountAction<{ codes?: string[] }>('/api/account/2fa/recovery/generate', {});
export const disableTwoStep = () => runAccountAction<{ accessToken?: string }>('/api/account/2fa/disable', {});

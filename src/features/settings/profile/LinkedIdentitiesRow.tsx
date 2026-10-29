/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LinkedIdentitiesRow.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Linked sign-in methods" row of Account security: what the server reports, nothing
 * the app infers. Read-only. There is no Link button (OAuth sign-in is not wired in this
 * app) and no Unlink one: GoTrue has no admin route that deletes an identity.
 *
 * Caveat: the list says which accounts GoTrue holds, not whether a password also exists.
 */

import React, { useEffect, useState } from 'react';

import { trySettingsGet, errorMessage } from '@/store/settings/settingsStoreUtils';
import { SettingRow } from '../ui/settingsKit';

export interface LinkedIdentity {
  provider: string;
  identityId: string | null;
  email: string | null;
  linkedAt: string | null;
}

type IdentitiesState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: string }
  | { phase: 'ready'; identities: LinkedIdentity[] };

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', github: 'GitHub', '42': '42', email: 'Email' };
const UNLINK_NOTE = 'To remove a linked account, contact support; unlinking is not available yet.';

export const providerLabel = (provider: string): string => PROVIDER_LABELS[provider] ?? provider;

async function fetchIdentities(): Promise<IdentitiesState> {
  try {
    const body = await trySettingsGet<{ identities?: LinkedIdentity[] }>('/api/account/identities');
    if (!body || !Array.isArray(body.identities)) return { phase: 'error', reason: 'This server does not report linked sign-in methods yet.' };
    return { phase: 'ready', identities: body.identities };
  } catch (error) {
    return { phase: 'error', reason: errorMessage(error) };
  }
}

function describeIdentity(identity: LinkedIdentity): string {
  const since = identity.linkedAt ? new Date(identity.linkedAt).toLocaleDateString() : null;
  return [providerLabel(identity.provider), identity.email, since && `linked ${since}`].filter(Boolean).join(' - ');
}

function IdentityList({ state }: { state: IdentitiesState }) {
  if (state.phase === 'loading') return <p role="status">Loading sign-in methods...</p>;
  if (state.phase === 'error') return <p role="alert">{state.reason}</p>;
  if (state.identities.length === 0) return <p>No linked accounts yet.</p>;
  return (
    <ul aria-label="Linked sign-in methods" className="space-y-1">
      {state.identities.map((identity) => <li key={identity.identityId ?? identity.provider}>{describeIdentity(identity)}</li>)}
    </ul>
  );
}

export const LinkedIdentitiesRow: React.FC = () => {
  const [state, setState] = useState<IdentitiesState>({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    fetchIdentities().then((next) => { if (live) setState(next); }, () => undefined);
    return () => { live = false; };
  }, []);
  return (
    <SettingRow
      stack
      title="Linked sign-in methods"
      description={<><IdentityList state={state} /><p className="mt-2">{UNLINK_NOTE}</p></>}
    />
  );
};

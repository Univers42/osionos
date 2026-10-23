/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccountDangerZone.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';

import {
  cancelDeletion,
  deletionStatus,
  requestDeletion,
  type AccountSecurityOutcome,
  type DeletionRequest,
} from '@/shared/api/accountSecurityApi';
import { Button, useToastStore } from '@/shared/ui';
import { TypedConfirmModal } from '../ConfirmModals';
import { SettingRow } from '../settingsKit';
import { DangerZone } from './DangerZone';
import { deleteConfirmText } from './dangerModel';

const DELETE_NOT_AVAILABLE = "Account deletion isn't available on this server yet";

function plainDate(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { dateStyle: 'long' }) : 'the scheduled date';
}

function failureMessage(outcome: AccountSecurityOutcome<unknown>): string {
  if (outcome.ok) return '';
  if (outcome.reason === 'sudo_required') return 'Confirm it\'s you, then try again.';
  if (outcome.reason === 'unavailable') return DELETE_NOT_AVAILABLE;
  return 'message' in outcome ? outcome.message : 'Too many tries. Try again later.';
}

/**
 * The delete-account gesture: the typed username, then sudo (the server refuses without
 * it and the shared prompt opens), then the request. The user stays signed in; while a
 * request is open the zone shows the grace date and Cancel.
 */
export const AccountDangerZone: React.FC<{ username?: string | null; email?: string | null }> = ({ username, email }) => {
  const toast = useToastStore((state) => state.push);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<DeletionRequest | null>(null);

  useEffect(() => {
    let live = true;
    void deletionStatus().then((outcome) => {
      if (live) setPending(outcome.ok ? outcome.data : null);
    });
    return () => { live = false; };
  }, []);

  async function handleRequest() {
    const outcome = await requestDeletion();
    if (outcome.ok) {
      setPending(outcome.data);
      toast({ kind: 'success', title: 'Deletion scheduled. You can cancel it until the date shown here.' });
      return;
    }
    if (outcome.reason === 'unavailable') {
      toast({ kind: 'info', title: DELETE_NOT_AVAILABLE });
      return;
    }
    // A sudo refusal has already opened the shared prompt; the modal stays open for "Try again".
    throw new Error(failureMessage(outcome));
  }

  async function handleCancel() {
    const outcome = await cancelDeletion();
    if (outcome.ok) {
      setPending(null);
      toast({ kind: 'success', title: 'Deletion cancelled' });
    } else {
      toast({ kind: 'error', title: 'Could not cancel the deletion', description: failureMessage(outcome) });
    }
  }

  return (
    <DangerZone>
      {pending ? (
        <SettingRow
          danger
          title="Your account is scheduled for deletion"
          description={`Your account will be deleted on ${plainDate(pending.scheduledFor)}.`}
          action={<Button onClick={() => { void handleCancel(); }}>Cancel deletion</Button>}
        />
      ) : (
        <SettingRow
          danger
          title="Delete my account"
          description="Permanently delete your account and remove access to your pages and workspaces. You have 14 days to change your mind."
          action={<Button tone="danger" onClick={() => setConfirming(true)}>Delete my account</Button>}
        />
      )}
      {confirming && (
        <TypedConfirmModal
          title="Delete account"
          message="Type your username to schedule this account for deletion. You stay signed in, and can cancel from this page."
          confirmText={deleteConfirmText(username, email)}
          danger
          actionLabel="Schedule deletion"
          onConfirm={handleRequest}
          onClose={() => setConfirming(false)}
        />
      )}
    </DangerZone>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PendingDeleteBanner.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { useUserStore } from '@/features/auth';
import { Button, useToastStore } from '@/shared/ui';

import { accountActionNotice, cancelWorkspaceDelete } from '../model/settingsCalls';
import { canRetryAfterSudo, useSudoPromptStore } from '../ui/sudo/sudoPromptModel';

/**
 * Shown to the owner of a workspace whose delete is staged: when it goes, and a Cancel that
 * posts /cancel-delete. The sudo prompt opens on its own refusal; "Try again" unlocks once it
 * granted, as in the username dialog.
 */
export const PendingDeleteBanner: React.FC<{ workspaceId: string; userId: string; deleteAfter: string }> = ({ workspaceId, userId, deleteAfter }) => {
  const toast = useToastStore((state) => state.push);
  const grants = useSudoPromptStore((state) => state.grants);
  const [busy, setBusy] = useState(false);
  const [needsSudo, setNeedsSudo] = useState(false);
  const [grantsAtRefusal, setGrantsAtRefusal] = useState(grants);
  const canRetry = canRetryAfterSudo(needsSudo, grants, grantsAtRefusal);
  const when = deleteAfter && !Number.isNaN(Date.parse(deleteAfter)) ? new Date(deleteAfter).toLocaleDateString() : 'soon';

  async function cancel() {
    setBusy(true);
    const outcome = await cancelWorkspaceDelete(workspaceId);
    setBusy(false);
    if (outcome.ok) {
      setNeedsSudo(false);
      toast({ kind: 'success', title: 'Deletion cancelled' });
      await useUserStore.getState().refreshWorkspaces(userId);
      return;
    }
    if (outcome.reason === 'sudo_required') {
      setNeedsSudo(true);
      setGrantsAtRefusal(grants);
      return;
    }
    setNeedsSudo(false);
    const notice = accountActionNotice(outcome, 'Cancelling the deletion');
    if (notice) toast(notice);
  }

  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-md border border-[var(--osio-danger)] px-3 py-2 text-sm">
      <span>Scheduled for deletion on {when}</span>
      <Button onClick={cancel} disabled={busy || !canRetry}>{needsSudo ? 'Try again' : 'Cancel deletion'}</Button>
    </div>
  );
};

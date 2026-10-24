/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockedUsersPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Settings panel: list of blocked users with an unblock action each. */

import React, { useEffect, useState } from 'react';

import { Button } from '@/shared/ui';
import { Avatar } from '@/features/settings/ui/settingsKit';
import { ConfirmModal } from '@/features/settings/ui/ConfirmModals';
import { useBlocksStore } from '@/store/social/useBlocksStore';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const BlockedUsersPanel: React.FC = () => {
  const { data, loading, error, hydrate, unblock, rowErrors } = useBlocksStore();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string>('');

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (loading && data.length === 0) {
    return <p className="text-sm text-[var(--osio-fg-muted)]">Loading…</p>;
  }
  if (error && data.length === 0) {
    return <p className="text-sm text-[var(--osio-fg-muted)]">{error}</p>;
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[var(--osio-fg-muted)]">You haven&apos;t blocked anyone.</p>
        <p className="text-sm text-[var(--osio-fg-muted)]">Blocking someone hides them from your directory and your connections, and stops their messages. They are not told.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {data.map((blocked) => (
          <li key={blocked.userId} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <Avatar value={blocked.avatar ?? undefined} label={blocked.name ?? undefined} />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                {blocked.name ?? blocked.userId}
                {blocked.reason ? <span className="text-[var(--osio-fg-muted)]"> — {blocked.reason}</span> : null}
                {blocked.createdAt ? <span className="text-[var(--osio-fg-muted)]"> · Blocked on {formatDate(blocked.createdAt)}</span> : null}
              </span>
              <Button tone="ghost" onClick={() => { setPendingId(blocked.userId); setPendingName(blocked.name ?? blocked.userId); }}>Unblock</Button>
            </div>
            {rowErrors[blocked.userId] ? (
              <p className="text-sm text-[var(--osio-fg-muted)]">{rowErrors[blocked.userId]}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {pendingId && (
        <ConfirmModal
          title="Unblock"
          message={`Unblock ${pendingName}? They will be able to message you and appear in your directory again.`}
          actionLabel="Unblock"
          onConfirm={() => { const id = pendingId; setPendingId(null); void unblock(id); }}
          onClose={() => setPendingId(null)}
        />
      )}
    </>
  );
};

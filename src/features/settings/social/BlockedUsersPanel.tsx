/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockedUsersPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Settings panel: list of blocked users with an unblock action each. */

import React, { useEffect } from 'react';

import { Button, Card, SectionHeader } from '@/shared/ui';
import { useBlocksStore } from '@/store/social/useBlocksStore';

export const BlockedUsersPanel: React.FC = () => {
  const { data, loading, hydrate, unblock } = useBlocksStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SectionHeader title={`Blocked (${data.length})`} />
        {loading && data.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((blocked) => (
              <li key={blocked.userId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                  {blocked.name ?? blocked.userId}
                  {blocked.reason ? <span className="text-[var(--osio-fg-muted)]"> — {blocked.reason}</span> : null}
                </span>
                <Button tone="ghost" onClick={() => void unblock(blocked.userId)}>Unblock</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

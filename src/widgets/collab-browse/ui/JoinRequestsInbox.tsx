/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   JoinRequestsInbox.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Owner-side inbox of pending join requests for one workspace. */

import React, { useCallback, useEffect, useState } from 'react';

import { Button, Card, SectionHeader } from '@/shared/ui';
import { listJoinRequests, resolveJoinRequest, type JoinRequest } from '@/shared/social/collabApi';
import { errorMessage, pushSettingsError } from '@/store/settings/settingsStoreUtils';

interface JoinRequestsInboxProps {
  workspaceId: string;
}

export const JoinRequestsInbox: React.FC<JoinRequestsInboxProps> = ({ workspaceId }) => {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await listJoinRequests(workspaceId));
    } catch (caught) {
      pushSettingsError('Could not load join requests', caught);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const resolve = useCallback(async (id: string, action: 'approve' | 'deny') => {
    setRequests((current) => current.filter((item) => item.id !== id));
    try {
      await resolveJoinRequest(id, action);
    } catch (caught) {
      pushSettingsError(errorMessage(caught), caught);
      void load();
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  if (!loading && requests.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SectionHeader title={`Join requests (${requests.length})`} />
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <li key={request.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                {request.requester.name}
                {request.message ? <span className="text-[var(--osio-fg-muted)]"> — {request.message}</span> : null}
              </span>
              <Button tone="primary" onClick={() => void resolve(request.id, 'approve')}>Approve</Button>
              <Button tone="ghost" onClick={() => void resolve(request.id, 'deny')}>Deny</Button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
};

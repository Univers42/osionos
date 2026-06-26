/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useGroupChannel.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Group-channel CRUD hook: thin wrapper over groupApi that tracks a `busy`
 * flag + surfaces the last error, so the create modal and members panel share
 * one place for the bridge calls (create, rename, add/remove member, role).
 */

import { useCallback, useState } from 'react';

import type { ChatChannel } from '@/shared/chat/channelApi';
import {
  addMembers,
  createGroup,
  removeMember,
  renameChannel,
  setMemberRole,
} from '@/shared/chat/groupApi';

interface CreateGroupInput {
  name: string;
  memberIds: string[];
  avatar?: string;
  description?: string;
  workspaceId?: string;
}

export function useGroupChannel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(op: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await op();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback(
    (input: CreateGroupInput): Promise<ChatChannel | null> => run(() => createGroup(input)),
    [run],
  );
  const rename = useCallback(
    (id: string, patch: { name?: string; avatar?: string; description?: string; topic?: string }) =>
      run(() => renameChannel(id, patch)),
    [run],
  );
  const add = useCallback(
    (channelId: string, userIds: string[]) => run(() => addMembers(channelId, userIds)),
    [run],
  );
  const remove = useCallback(
    (channelId: string, userId: string) => run(() => removeMember(channelId, userId)),
    [run],
  );
  const changeRole = useCallback(
    (channelId: string, userId: string, role: string) => run(() => setMemberRole(channelId, userId, role)),
    [run],
  );

  return { busy, error, create, rename, add, remove, changeRole };
}

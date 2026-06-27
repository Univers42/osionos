/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SharedSpacePresenceBar.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Mount point for Shared-space presence (AOC §6). It runs ONLY when the active
 * workspace is a Shared space (one the user joined, not owns) AND the
 * `osio.collab.shared` flag is on — which stays OFF until the server-side
 * namespace-deny cutover lands (AOC §Sec1). It connects the collab store to that
 * space and renders the roster; otherwise it is a no-op that renders nothing.
 */

import React, { useCallback, useRef } from 'react';
import { Paperclip } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { isSharedCollabEnabled } from '@/shared/config/featureFlags';
import type { Workspace } from '@/entities/user/model/types';
import { useCollabStore } from '../store/useCollabStore';
import { seedSharedFile } from '../model/seedSharedFile';
import { uploadSharedFile } from '../api/uploadSharedFile';
import { CollabRoster } from './CollabRoster';
import { CollabCaretLayer } from './CollabCaretLayer';
import { SummonPrompt } from './SummonPrompt';
import { useSharedSpacePresence } from './useSharedSpacePresence';
import { useBroadcastLocalCaret } from './useBroadcastLocalCaret';
import { useBroadcastLocalActivity } from './useBroadcastLocalActivity';
import { useSummonInbox } from './useSummonInbox';
import { useSharedAnnounceToasts } from './useSharedAnnounceToasts';

const EMPTY: readonly Workspace[] = [];

export const SharedSpacePresenceBar: React.FC = () => {
  const enabled = isSharedCollabEnabled();
  const persona = useUserStore((state) => state.activePersona());
  const activeWorkspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? '');
  const shared = useUserStore((state) => state.activeSession()?.sharedWorkspaces ?? EMPTY);

  const route = usePageStore((state) => state.activePage?.id ?? null);
  const isSharedSpace = enabled && !!activeWorkspaceId && shared.some((w) => w._id === activeWorkspaceId);
  const spaceId = isSharedSpace ? activeWorkspaceId : null;
  const self = persona?.id ? { id: persona.id, displayName: persona.name } : null;

  const fileInput = useRef<HTMLInputElement>(null);
  useSharedSpacePresence(spaceId, self);
  useBroadcastLocalCaret(!!spaceId);
  useBroadcastLocalActivity(!!spaceId, route);
  useSummonInbox(!!spaceId);
  useSharedAnnounceToasts(!!spaceId);

  const onSummon = useCallback((memberId: string, name: string) => {
    if (!route) return;
    void useCollabStore.getState().request(memberId, { kind: 'summon', route }).then((res) => {
      useToastStore.getState().push({
        kind: res.accepted ? 'success' : 'info',
        title: res.accepted ? `${name} is on the way` : `${name} didn't join`,
        durationMs: 4000,
      });
    });
  }, [route]);

  const onPickFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const id = spaceId;
    const selfId = self?.id;
    if (!file || !id || !selfId) return;
    try {
      await seedSharedFile(id, file, {
        selfId,
        upload: (sp, f) => uploadSharedFile(sp, f as File),
        broadcast: (e) => useCollabStore.getState().broadcast(e),
      });
      useToastStore.getState().push({ kind: 'success', title: 'Shared with the space', description: file.name, durationMs: 4000 });
    } catch (error) {
      useToastStore.getState().push({ kind: 'error', title: 'Could not share the file', description: error instanceof Error ? error.message : undefined });
    }
  }, [spaceId, self?.id]);

  if (!spaceId) return null;
  return (
    <>
      <CollabRoster onSummon={onSummon} />
      <button
        type="button"
        title="Share a file with this space"
        aria-label="Share a file with this space"
        onClick={() => fileInput.current?.click()}
        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      >
        <Paperclip size={15} aria-hidden />
      </button>
      <input ref={fileInput} type="file" hidden onChange={onPickFile} />
      <CollabCaretLayer />
      <SummonPrompt />
    </>
  );
};

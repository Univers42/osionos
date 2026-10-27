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
 * Mount point for Shared-space presence (AOC §6). It runs ONLY when the
 * `osio.collab.shared` flag is on — which stays OFF until the server-side
 * namespace-deny cutover lands (AOC §Sec1) — AND the active workspace is a
 * space the user JOINED or OWNS with someone else inside (Notion lists the
 * owner in the roster too; the bridge mints the owner a space token, so the
 * join actually authenticates). The JOIN decision itself lives in the pure
 * `sharedSpaceIdFor` gate (model/sharedSpaceGate.ts), fed with plain values;
 * the other-member count for an OWNED workspace comes from the hydrated
 * `useWorkspaceMembersStore` (GET /api/workspaces/:id/members). Otherwise this
 * is a no-op that renders nothing.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Paperclip } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { usePageStore } from '@/store/usePageStore';
import { useToastStore } from '@osionos/ui/primitives/useToastStore';
import { isSharedCollabEnabled } from '@/shared/config/featureFlags';
import { useWorkspaceMembersStore } from '@/store/settings';
import type { Workspace } from '@/entities/user/model/types';
import { useCollabStore } from '../store/useCollabStore';
import { sharedSpaceIdFor } from '../model/sharedSpaceGate';
import { seedSharedFile } from '../model/seedSharedFile';
import { uploadSharedFile } from '../api/uploadSharedFile';
import { CollabRoster } from './CollabRoster';
import { CollabCaretLayer } from './CollabCaretLayer';
import { SummonPrompt } from './SummonPrompt';
import { useSharedSpacePresence } from './useSharedSpacePresence';
import { useSharedSpacePage } from './useSharedSpacePage';
import { useBroadcastLocalCaret } from './useBroadcastLocalCaret';
import { useLiveBlockSync } from './useLiveBlockSync';
import { useBroadcastLocalActivity } from './useBroadcastLocalActivity';
import { useSummonInbox } from './useSummonInbox';
import { useSharedAnnounceToasts } from './useSharedAnnounceToasts';

const EMPTY: readonly Workspace[] = [];

export const SharedSpacePresenceBar: React.FC = () => {
  const enabled = isSharedCollabEnabled();
  const persona = useUserStore((state) => state.activePersona());
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const activeWorkspaceId = activeWorkspace?._id ?? '';
  const activeUserId = useUserStore((state) => state.activeUserId);
  const shared = useUserStore((state) => state.activeSession()?.sharedWorkspaces ?? EMPTY);

  // Owner check follows the same comparison the workspace switcher trusts
  // (WorkspaceSwitcher.tsx canRename): ownerId vs the active user id.
  const ownedBySelf = !!activeWorkspace && activeWorkspace.ownerId === activeUserId;
  const sharedWorkspaceIds = shared.map((workspace) => workspace._id);

  // An OWNED workspace needs its roster count before the gate can pass; the
  // store is the existing GET /members wrapper, hydrated once per workspace.
  const otherMemberCount = useWorkspaceMembersStore((state) =>
    (state.data[activeWorkspaceId] ?? []).filter((member) => member.userId !== activeUserId).length);
  useEffect(() => {
    if (!enabled || !ownedBySelf || !activeWorkspaceId || !activeUserId) return;
    void useWorkspaceMembersStore.getState().hydrate(activeWorkspaceId, activeUserId);
  }, [enabled, ownedBySelf, activeWorkspaceId, activeUserId]);

  const spaceId = sharedSpaceIdFor({
    flagEnabled: enabled,
    activeWorkspaceId,
    sharedWorkspaceIds,
    ownedBySelf,
    otherMemberCount,
  });
  const self = persona?.id ? { id: persona.id, displayName: persona.name } : null;

  // The active page id is both the page-channel binding and the summon target.
  const route = usePageStore((state) => state.activePage?.id ?? null);

  const fileInput = useRef<HTMLInputElement>(null);
  useSharedSpacePresence(spaceId, self);
  // A second, page-scoped socket: page data and page presence only (C501/C502).
  useSharedSpacePage(spaceId, route, self);
  useBroadcastLocalCaret(!!spaceId && !!route);
  // Live block sync rides the page channel: edits on the page being viewed reach
  // every member block by block within a frame instead of the outbox debounce.
  useLiveBlockSync(spaceId, self?.id ?? null, route);
  useBroadcastLocalActivity(!!spaceId && !!route, route);
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
        <Paperclip size={16} aria-hidden />
      </button>
      <input ref={fileInput} type="file" hidden onChange={onPickFile} />
      <CollabCaretLayer />
      <SummonPrompt />
    </>
  );
};

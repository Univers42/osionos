/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileView.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Member profile page — opens as a workspace-grid tab (kind "profile",
 * pageId = the member's user id; the "/people/:userId" route of this app's
 * tab-based navigation). Avatar, name, org role, presence dot, and a
 * "Message" action that opens (find-or-create) the DM channel as a tab.
 */

import React from 'react';
import { MessageCircle } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { openDm } from '@/shared/chat/channelApi';
import { usePresenceHeartbeat } from '@/shared/people/usePresenceHeartbeat';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useProfile } from './useProfile';

interface ProfileViewProps {
  userId: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ userId }) => {
  const { profile, error } = useProfile(userId);
  const activeUserId = useUserStore((s) => s.activeUserId);
  usePresenceHeartbeat();

  const startDm = () => {
    openDm(userId)
      .then((channel) => {
        useWorkspaceLayout.getState().openTab({
          tabId: genId('tab'),
          pageId: channel.id,
          workspaceId: channel.workspaceId,
          kind: 'channel',
          title: channel.name,
          icon: 'icon:message-circle',
        });
      })
      .catch(() => undefined);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--osio-bg-page)] text-sm text-[var(--osio-fg-muted)]">
        {error}
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--osio-bg-page)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <div className="mx-auto max-w-2xl px-8 py-12">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-3xl font-bold text-[var(--osio-accent-fg)]">
              {profile.avatar
                ? <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
                : profile.name.slice(0, 1).toUpperCase()}
            </div>
            <span
              title={profile.online ? 'Online' : 'Offline'}
              className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-[var(--osio-bg-page)] ${profile.online ? 'bg-green-500' : 'bg-[var(--osio-fg-subtle)]'}`}
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
            <p className="mt-1 text-sm text-[var(--osio-fg-muted)]">
              {profile.role ? `${profile.role} · ` : ''}
              {profile.online ? 'Online now' : 'Offline'}
            </p>
          </div>
        </div>

        {userId !== activeUserId && (
          <div className="mt-8">
            <button
              type="button"
              onClick={startDm}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
            >
              <MessageCircle size={16} /> Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

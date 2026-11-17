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
 * Built-in member profile — the fallback used when the admin-authored profile template is
 * absent or disabled. The sidebar lives in ProfileFrame; this is the main column: README and
 * shared posts. Rendered as a child of ProfilePageView, which owns the presence heartbeat.
 */

import React, { useMemo } from 'react';

import { ProfileFrame } from './ProfileFrame';
import { ReadmePrompt } from './ReadmePrompt';
import { ProfileSharedPosts } from './ProfileSharedPosts';
import { ReadmeBlocks } from './ReadmeBlocks';
import { toReadmeRecord } from './model/binding';
import { showsReadmePrompt } from './model/sidebarModel';
import { useProfile } from './useProfile';
import { useUserStore } from '@/features/auth';

interface ProfileViewProps {
  userId: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ userId }) => {
  const { profile, error } = useProfile(userId);
  const readmeRecord = useMemo(() => toReadmeRecord(profile), [profile]);
  const isOwner = useUserStore((s) => s.activeUserId) === userId;

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
    <ProfileFrame userId={userId} profile={profile}>
      <ReadmeBlocks readme={profile.readme} record={readmeRecord} />
      {showsReadmePrompt(profile, isOwner) && <ReadmePrompt />}
      <ProfileSharedPosts userId={userId} />
    </ProfileFrame>
  );
};

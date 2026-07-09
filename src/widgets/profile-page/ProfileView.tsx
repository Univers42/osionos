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
 * Built-in member profile — the fallback shell used when the admin-authored
 * profile template is absent or disabled. Avatar, name, org role, presence dot,
 * and the shared Message/Connect actions. Rendered as a child of ProfilePageView,
 * which owns the presence heartbeat.
 */

import React from 'react';

import { ProfileActions } from './profileChrome';
import { ProfileSharedPosts } from './ProfileSharedPosts';
import { useProfile } from './useProfile';

interface ProfileViewProps {
  userId: string;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ userId }) => {
  const { profile, error } = useProfile(userId);

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

        <ProfileActions userId={userId} name={profile.name} />

        <ProfileSharedPosts userId={userId} />
      </div>
    </div>
  );
};

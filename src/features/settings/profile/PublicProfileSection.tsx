/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicProfileSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The public profile editor of Settings: the shared profile form, drawn only when the server
 * can take the save; an offline build gets an explanation instead of a dead form.
 */

import React, { useEffect } from 'react';
import { UserX } from 'lucide-react';

import { BannerUpload } from './BannerUpload';
import { ProfileEditForm } from './ProfileEditForm';
import { ProfilePhotoRow } from './ProfilePhotoRow';
import { useAccountProfileStore } from '@/store/settings';
import { EmptyState, PanelStatus, Section } from '../ui/settingsKit';

export const PublicProfileSection: React.FC = () => {
  const { status, profile, error, hydrate } = useAccountProfileStore();

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (status === 'unavailable') {
    return (
      <Section title="Public profile" anchor="public-profile">
        <EmptyState
          icon={<UserX size={16} />}
          title="Your public profile can't be edited here"
          hint="This version of osionos is not connected to a server that stores profiles. Connect to your workspace server to edit it."
        />
      </Section>
    );
  }

  const media = (displayName: string) => profile && (
    <>
      <ProfilePhotoRow avatarUrl={profile.avatarUrl} name={displayName} onChanged={() => void hydrate()} />
      <BannerUpload bannerUrl={profile.bannerUrl} onChanged={() => void hydrate()} />
    </>
  );

  return (
    <Section title="Public profile" anchor="public-profile">
      <PanelStatus status={profile ? 'ready' : status === 'error' ? 'error' : 'loading'} error={error} onRetry={() => void hydrate()}>
        <ProfileEditForm media={media} saveLabel="Save profile" discardLabel="Discard changes" />
      </PanelStatus>
    </Section>
  );
};

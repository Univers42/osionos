/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicProfileEditor.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Loads the profile and hosts the shared edit form with its photo and banner rows. The one
 * place that decides loading / error / unavailable, so Settings and the profile page show
 * the same states. Every prop but the host-specific ones goes straight to the form.
 */

import React, { useEffect } from 'react';
import { UserX } from 'lucide-react';

import { Button } from '@/shared/ui';
import { useAccountProfileStore } from '@/store/settings';
import { EmptyState, PanelStatus } from '../ui/settingsKit';
import { BannerUpload } from './BannerUpload';
import { ProfileEditForm, type ProfileEditFormProps } from './ProfileEditForm';
import { ProfilePhotoRow } from './ProfilePhotoRow';

export const PublicProfileEditor: React.FC<Omit<ProfileEditFormProps, 'media'>> = (formProps) => {
  const { status, profile, error, hydrate } = useAccountProfileStore();

  // A fresh read on every open: the save carries the version this read returns, so an
  // editor opened from a stale page would only ever end in a conflict.
  useEffect(() => { void hydrate(); }, [hydrate]);

  // A host that edits in place needs a way out when there is no form to Cancel.
  const close = !profile && formProps.discardAlways && formProps.onDone
    ? <div className="pt-3"><Button onClick={formProps.onDone}>Close</Button></div>
    : null;

  if (status === 'unavailable') {
    return (
      <>
        <EmptyState
          icon={<UserX size={16} />}
          title="Your public profile can't be edited here"
          hint="This version of osionos is not connected to a server that stores profiles. Connect to your workspace server to edit it."
        />
        {close}
      </>
    );
  }

  const media = (displayName: string) => profile && (
    <>
      <ProfilePhotoRow avatarUrl={profile.avatarUrl} name={displayName} onChanged={() => void hydrate()} />
      <BannerUpload bannerUrl={profile.bannerUrl} onChanged={() => void hydrate()} />
    </>
  );

  return (
    <>
      <PanelStatus status={profile ? 'ready' : status === 'error' ? 'error' : 'loading'} error={error} onRetry={() => void hydrate()}>
        <ProfileEditForm media={media} {...formProps} />
      </PanelStatus>
      {close}
    </>
  );
};

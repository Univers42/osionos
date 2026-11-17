/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfilePhotoRow.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The photo row of the public profile: current photo, upload, and removal behind a confirm.
 * Shared by the Settings section and the profile page's edit mode.
 */

import React, { useState } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { isSafeImageSource } from '@/shared/lib/media/bridgeMediaUrl';
import { Avatar, Button, useToastStore } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { ImageAvatarUpload } from './ImageAvatarUpload';

export const ProfilePhotoRow: React.FC<{ avatarUrl: string | null; name: string; onChanged: () => void }> = ({ avatarUrl, name, onChanged }) => {
  const toast = useToastStore((state) => state.push);
  const [asking, setAsking] = useState(false);

  const remove = async () => {
    setAsking(false);
    try {
      await api.delete('/api/profile/avatar', getActivePageJwt() ?? undefined);
      toast({ kind: 'success', title: 'Photo removed' });
      onChanged();
    } catch {
      toast({ kind: 'error', title: 'The photo could not be removed. Try again.' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 pb-2">
      <Avatar name={name} src={isSafeImageSource(avatarUrl) ? avatarUrl : undefined} size="lg" />
      <ImageAvatarUpload onUploaded={onChanged} />
      {avatarUrl && <Button tone="danger" onClick={() => setAsking(true)}>Remove photo</Button>}
      {asking && (
        <ConfirmModal
          title="Remove your photo?"
          message="Your profile goes back to showing your initials. You can upload a new photo any time."
          actionLabel="Remove photo"
          danger
          onConfirm={remove}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
};

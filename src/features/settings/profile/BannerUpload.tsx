/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BannerUpload.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The banner row of the public profile: a 3:1 preview, "Upload banner" (crop in
 * the browser, POST /api/profile/banner) and "Remove banner" behind a confirm.
 * The bridge validates and strips; this only prepares the one 1500x500 variant.
 */

import React, { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { Button, useToastStore } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { type EncodedAvatar } from './avatarVariants';
import { BANNER_HEIGHT, BANNER_WIDTH, bannerCropRect, buildBannerPayload } from './bannerVariant';
import { SIGN_IN_TO_UPLOAD, uploadFailureMessage } from './uploadFailure';

interface BannerUploadProps {
  bannerUrl: string | null;
  onChanged: () => void;
}

async function drawBanner(bitmap: ImageBitmap, type: string, quality: number): Promise<EncodedAvatar | null> {
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const crop = bannerCropRect(bitmap.width, bitmap.height);
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  return blob ? { type: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) } : null;
}

const safeSource = (url: string | null): string | undefined => (url && /^(https:\/\/|\/(?!\/))/.test(url) ? url : undefined);

export const BannerUpload: React.FC<BannerUploadProps> = ({ bannerUrl, onChanged }) => {
  const toast = useToastStore((state) => state.push);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const source = safeSource(bannerUrl);

  const fail = (reason: string) => {
    toast({ kind: 'error', title: 'The banner could not be uploaded.', description: reason });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const jwt = getActivePageJwt();
    if (!jwt) return fail(SIGN_IN_TO_UPLOAD);
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const banner = await buildBannerPayload((_width, type, quality) => drawBanner(bitmap, type, quality));
        await api.post('/api/profile/banner', { banner }, jwt);
        toast({ kind: 'success', title: 'Banner saved' });
        onChanged();
      } finally {
        bitmap.close();
      }
    } catch (error) {
      fail(uploadFailureMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setAsking(false);
    try {
      await api.delete('/api/profile/banner', getActivePageJwt() ?? undefined);
      toast({ kind: 'success', title: 'Banner removed' });
      onChanged();
    } catch {
      toast({ kind: 'error', title: 'The banner could not be removed. Try again.' });
    }
  };

  return (
    <div className="space-y-2 pb-3">
      <span className="block text-sm font-medium text-[var(--osio-fg-default)]">Banner</span>
      <div className="aspect-[3/1] w-full overflow-hidden rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)]">
        {source && <img src={source} alt="Your profile banner" className="h-full w-full object-cover" />}
      </div>
      <p className="text-xs text-[var(--osio-fg-muted)]">Shown above your profile. Cropped to 3 by 1 from the middle of the image you pick.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Banner image"
          className="hidden"
          onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }}
        />
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus size={14} /> {busy ? 'Uploading…' : 'Upload banner'}
        </Button>
        {source && <Button type="button" tone="danger" onClick={() => setAsking(true)}>Remove banner</Button>}
      </div>
      {asking && (
        <ConfirmModal
          title="Remove your banner?"
          message="Your profile page goes back to having no banner. You can upload a new one any time."
          actionLabel="Remove banner"
          danger
          onConfirm={remove}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
};

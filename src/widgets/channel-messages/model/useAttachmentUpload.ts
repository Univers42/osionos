/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAttachmentUpload.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Wraps attachmentApi.uploadAttachment with a local-preview lifecycle: a
 * URL.createObjectURL is minted immediately so the draft thumbnail renders while
 * the raw-bytes upload is in flight, then stamped onto the returned DRAFT
 * descriptor's `url` (a blob: URL — used ONLY for the local preview chip; the
 * server fills the real /api/chat/uploads/:id url once the message is sent).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { uploadAttachment } from '@/shared/chat/attachmentApi';
import { compressImage, validateFile, type PreparedImage } from '@/shared/chat/mediaProcessing';
import type { Attachment } from '@/shared/chat/messageApi';
import { useToastStore } from '@osionos/ui/primitives/useToastStore';

/** The file being uploaded and the fraction of it sent; null when none is. */
export interface UploadProgress {
  name: string;
  fraction: number;
}

export function useAttachmentUpload(channelId: string) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current = [];
    },
    [],
  );

  const upload = useCallback(
    async (file: File): Promise<Attachment | null> => {
      const check = validateFile(file);
      if (!check.ok) {
        useToastStore.getState().push({ kind: 'error', title: 'Can’t attach file', description: check.error });
        return null;
      }
      setProgress({ name: file.name, fraction: 0 });
      // Smart-compress images first so a 25MB+ 4K PNG becomes ~1MB and never trips
      // the bridge cap; other kinds upload as-is (already size-validated above).
      const prepared: PreparedImage = check.kind === 'image' ? await compressImage(file) : { file };
      const previewUrl = URL.createObjectURL(prepared.file);
      objectUrls.current.push(previewUrl);
      try {
        const descriptor = await uploadAttachment(channelId, prepared.file, (fraction) => setProgress({ name: file.name, fraction }));
        const metadata = { ...descriptor.metadata };
        if (prepared.width) metadata.width = prepared.width;
        if (prepared.height) metadata.height = prepared.height;
        return { ...descriptor, url: previewUrl, name: descriptor.name ?? file.name, metadata };
      } catch {
        URL.revokeObjectURL(previewUrl);
        objectUrls.current = objectUrls.current.filter((u) => u !== previewUrl);
        useToastStore.getState().push({ kind: 'error', title: 'Upload failed', description: file.name });
        return null;
      } finally {
        setProgress(null);
      }
    },
    [channelId],
  );

  return { upload, uploading: progress !== null, progress };
}

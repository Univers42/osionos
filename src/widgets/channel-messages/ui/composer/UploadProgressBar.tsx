/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UploadProgressBar.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import type { UploadProgress } from '../../model/useAttachmentUpload';

/** The file the composer is uploading and how much of it has been sent. */
export const UploadProgressBar: React.FC<{ progress: UploadProgress }> = ({ progress }) => {
  const percent = Math.round(progress.fraction * 100);
  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
      <span className="min-w-0 truncate">Uploading {progress.name}</span>
      <progress
        aria-label={`Uploading ${progress.name}`}
        value={percent}
        max={100}
        className="h-1.5 flex-1 accent-[var(--osio-accent)]"
      />
      <span className="tabular-nums">{percent}%</span>
    </div>
  );
};

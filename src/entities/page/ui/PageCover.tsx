/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageCover.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  COVER_PICKER_TABS,
  IconImage,
  resolveCollectionMediaAsset,
} from '@/shared/lib/markengine/uiCollectionAssets';
import { CoverAssetPicker } from './CoverAssetPicker';

interface PageCoverProps {
  /** Current cover value — URL, CSS gradient, or canonical ui-collection media ref. */
  cover: string;
  /** Update the cover. */
  onChangeCover: (cover: string) => void;
  /** Remove the cover entirely. */
  onRemoveCover: () => void;
}

/**
 * Full-width cover image/gradient at the top of a Notion page.
 * Shows a gallery picker on "Change cover".
 */
export const PageCover: React.FC<PageCoverProps> = ({
  cover,
  onChangeCover,
  onRemoveCover,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isGradient = cover.startsWith('linear-gradient') || cover.startsWith('radial-gradient');
  const resolvedCover = isGradient
    ? null
    : resolveCollectionMediaAsset(cover, COVER_PICKER_TABS);
  const isUrl = !isGradient;
  const coverSrc = resolvedCover?.url ?? cover;

  /* Close picker on outside click */
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showPicker]);

  const handleSelect = useCallback(
    (value: string) => {
      onChangeCover(value);
      setShowPicker(false);
    },
    [onChangeCover],
  );

  const handleRemove = useCallback(() => {
    onRemoveCover();
    setShowPicker(false);
  }, [onRemoveCover]);

  return (
    <div className="notion-page-cover">
      <div className="notion-page-cover-media">
        {isUrl ? (
          <img
            src={coverSrc}
            alt=""
            className="notion-page-cover-img"
            draggable={false}
          />
        ) : (
          <div
            className="notion-page-cover-gradient"
            style={{ background: cover }}
          />
        )}
      </div>

      {/* Hover controls */}
      <div className="notion-page-cover-controls">
        <button
          type="button"
          className="notion-page-cover-btn"
          onClick={() => setShowPicker((v) => !v)}
        >
          <IconImage />
          Change cover
        </button>
        <button
          type="button"
          className="notion-page-cover-btn"
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Cover picker */}
      {showPicker && (
        <div
          ref={pickerRef}
          style={{
            position: 'absolute',
            zIndex: 1000,
            right: 16,
            top: 'calc(100% + 4px)',
          }}
        >
          <CoverAssetPicker value={cover} onSelect={handleSelect} />
        </div>
      )}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageCover.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 04:43:10 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  COVER_PICKER_TABS,
  IconImage,
  normalizeMediaSource,
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
  disabled?: boolean;
}

/**
 * Full-width cover image/gradient at the top of a osionos page.
 * Shows a gallery picker on "Change cover".
 */
export const PageCover: React.FC<PageCoverProps> = ({
  cover,
  onChangeCover,
  onRemoveCover,
  disabled = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const isGradient = cover.startsWith('linear-gradient') || cover.startsWith('radial-gradient');
  const resolvedCover = isGradient
    ? null
    : resolveCollectionMediaAsset(cover, COVER_PICKER_TABS, 'Cover', 'cover');
  const isUrl = !isGradient;
  const coverSrc = normalizeMediaSource(resolvedCover?.url ?? cover);

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
      if (disabled) return;
      onChangeCover(value);
      setShowPicker(false);
    },
    [disabled, onChangeCover],
  );

  const handleRemove = useCallback(() => {
    if (disabled) return;
    onRemoveCover();
    setShowPicker(false);
  }, [disabled, onRemoveCover]);

  return (
    <div data-testid="page-cover" className="osionos-page-cover">
      <div data-testid="page-cover-media" className="osionos-page-cover-media">
        {isUrl ? (
          <img
            src={coverSrc}
            alt=""
            data-testid="page-cover-image"
            className="osionos-page-cover-img"
            draggable={false}
          />
        ) : (
          <div
            data-testid="page-cover-gradient"
            className="osionos-page-cover-gradient"
            style={{ background: cover }}
          />
        )}
      </div>

      {/* Hover controls */}
      {!disabled && <div className="osionos-page-cover-controls">
        <button
          type="button"
          data-testid="page-cover-toggle-picker"
          className="osionos-page-cover-btn"
          onClick={() => setShowPicker((v) => !v)}
        >
          <IconImage />
          Change cover
        </button>
        <button
          type="button"
          data-testid="page-cover-remove"
          className="osionos-page-cover-btn"
          onClick={handleRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>}

      {/* Cover picker */}
      {showPicker && !disabled && (
        <div
          ref={pickerRef}
          data-testid="page-cover-picker"
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

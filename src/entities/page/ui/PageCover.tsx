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
import { LayoutDashboard, MoveVertical, Trash2 } from 'lucide-react';
import {
  COVER_PICKER_TABS,
  IconImage,
  normalizeMediaSource,
  resolveCollectionMediaAsset,
} from '@/shared/lib/markengine/uiCollectionAssets';
import { CoverAssetPicker } from './CoverAssetPicker';
import { CoverMediaElement } from './CoverMediaElement';
import { DEFAULT_COVER_POSITION } from './coverPositionMath';
import { useCoverReposition } from './useCoverReposition';

interface PageCoverProps {
  /** Current cover value — URL, CSS gradient, or canonical ui-collection media ref. */
  cover: string;
  /** Vertical focal point (%) for the cover image; defaults to centered (50). */
  position?: number;
  /** Update the cover. */
  onChangeCover: (cover: string) => void;
  /** Persist a new vertical focal point (%) after the user repositions the image. */
  onChangeCoverPosition?: (position: number) => void;
  /** Remove the cover entirely. */
  onRemoveCover: () => void;
  /** Turn this page into a header canvas (glass cards over the cover). Hidden when absent. */
  onCustomizeHeader?: () => void;
  disabled?: boolean;
}

/**
 * Full-width cover image/gradient at the top of a osionos page.
 * Shows a gallery picker on "Change cover".
 */
export const PageCover: React.FC<PageCoverProps> = ({
  cover,
  position,
  onChangeCover,
  onChangeCoverPosition,
  onRemoveCover,
  onCustomizeHeader,
  disabled = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const noop = useCallback(() => {}, []);
  const repos = useCoverReposition(position ?? DEFAULT_COVER_POSITION, onChangeCoverPosition ?? noop);

  const isGradient = cover.startsWith('linear-gradient') || cover.startsWith('radial-gradient');
  const resolvedCover = isGradient
    ? null
    : resolveCollectionMediaAsset(cover, COVER_PICKER_TABS);
  const isUrl = !isGradient;
  const coverSrc = normalizeMediaSource(resolvedCover?.url ?? cover);
  // Reposition only makes sense for an image cover (a gradient always fills).
  const canReposition = isUrl && !!onChangeCoverPosition;

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
      <div
        data-testid="page-cover-media"
        className="osionos-page-cover-media"
        data-repositioning={repos.active ? '' : undefined}
      >
        <CoverMediaElement
          cover={cover}
          src={coverSrc}
          isGradient={isGradient}
          position={repos.position}
          attachMedia={repos.attachMedia}
          handlers={repos.handlers}
        />
      </div>

      {/* While repositioning: a drag hint + Save / Cancel */}
      {!disabled && repos.active && (
        <>
          <div data-testid="page-cover-reposition-hint" className="osionos-page-cover-reposition-hint">
            Drag image up or down to reposition
          </div>
          <div className="osionos-page-cover-controls osionos-page-cover-controls--active">
            <button
              type="button"
              data-testid="page-cover-reposition-save"
              className="osionos-page-cover-btn"
              onClick={repos.save}
            >
              Save position
            </button>
            <button type="button" className="osionos-page-cover-btn" onClick={repos.cancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Hover controls */}
      {!disabled && !repos.active && <div className="osionos-page-cover-controls">
        {canReposition && (
          <button
            type="button"
            data-testid="page-cover-reposition"
            className="osionos-page-cover-btn"
            onClick={repos.start}
          >
            <MoveVertical size={14} />
            Reposition
          </button>
        )}
        {onCustomizeHeader && (
          <button
            type="button"
            data-testid="page-cover-customize-header"
            className="osionos-page-cover-btn"
            onClick={onCustomizeHeader}
          >
            <LayoutDashboard size={14} />
            Customize header
          </button>
        )}
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
          aria-label="Remove cover"
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

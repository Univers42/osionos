/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmojiPicker.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  CollectionAssetBoard,
  PAGE_ICON_PICKER_TABS,
} from '@/shared/lib/uiCollectionAssets';

interface EmojiPickerProps {
  /** Currently selected icon (emoji string or `svg:key`). */
  current?: string;
  /** Called when user selects an emoji or SVG icon. */
  onSelect: (icon: string) => void;
  /** Called when user removes the icon entirely. */
  onRemove: () => void;
  /** Close the picker. */
  onClose: () => void;
}

/**
 * Unified asset picker panel backed by @univers42/ui-collection.
 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  current,
  onSelect,
  onRemove,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  /* Click outside → close */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  /* Escape → close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleRemove = useCallback(() => {
    onRemove();
    onClose();
  }, [onRemove, onClose]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: 'calc(100% + 8px)',
        left: 0,
      }}
    >
      <CollectionAssetBoard
        current={current}
        tabs={PAGE_ICON_PICKER_TABS}
        label="Selector de assets"
        onSelect={handleSelect}
      />
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          className="notion-emoji-picker-remove-btn"
          onClick={handleRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

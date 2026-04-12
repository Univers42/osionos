/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmojiPicker.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/12 10:19:56 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef } from 'react';
import { CompactAssetPickerBoard } from '../AssetPickerBoard';

interface EmojiPickerProps {
  /** Currently selected icon as a canonical ui-collection value. */
  current?: string;
  /** Called when user selects an emoji, icon, or media asset. */
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
      <CompactAssetPickerBoard
        value={current}
        label="Selector de assets"
        width={340}
        onSerializedValueChange={handleSelect}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className={[
            'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            'text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600',
          ].join(' ')}
          onClick={handleRemove}
        >
          Remove icon
        </button>
      </div>
    </div>
  );
};

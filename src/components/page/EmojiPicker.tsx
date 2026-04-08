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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, SVG_ICONS } from './constants';

type PickerMode = 'emoji' | 'icon';

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
 * Notion-style emoji / icon picker panel.
 * Supports:
 *   - Emoji grid (categorised, searchable)
 *   - SVG icon grid (small built-in icon library)
 *   - "Remove" action
 */
export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  current,
  onSelect,
  onRemove,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<PickerMode>('emoji');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Smileys');

  /* Focus search on open */
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

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

  /* Filtered emoji list */
  const filteredEmojis = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return EMOJI_CATEGORIES[activeCategory] ?? [];
    }
    /* When searching, flatten all categories */
    return Object.values(EMOJI_CATEGORIES)
      .flat()
      .filter((emoji) => emoji.includes(q));
  }, [search, activeCategory]);

  const handleEmojiClick = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleSvgClick = useCallback(
    (key: string) => {
      onSelect(`svg:${key}`);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleRemove = useCallback(() => {
    onRemove();
    onClose();
  }, [onRemove, onClose]);

  const categoryNames = Object.keys(EMOJI_CATEGORIES).filter(
    (name) => name !== 'Recent' || (EMOJI_CATEGORIES[name]?.length ?? 0) > 0,
  );

  return (
    <div ref={panelRef} className="notion-emoji-picker">
      {/* Mode tabs: Emoji / Icons */}
      <div className="notion-emoji-picker-tabs">
        <button
          type="button"
          className={`notion-emoji-picker-tab ${mode === 'emoji' ? 'notion-emoji-picker-tab--active' : ''}`}
          onClick={() => setMode('emoji')}
        >
          Emoji
        </button>
        <button
          type="button"
          className={`notion-emoji-picker-tab ${mode === 'icon' ? 'notion-emoji-picker-tab--active' : ''}`}
          onClick={() => setMode('icon')}
        >
          Icons
        </button>
      </div>

      {mode === 'emoji' ? (
        <>
          {/* Search */}
          <input
            ref={searchRef}
            type="text"
            className="notion-emoji-picker-search"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Category tabs when not searching */}
          {!search && (
            <div className="notion-emoji-picker-tabs">
              {categoryNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`notion-emoji-picker-tab ${activeCategory === name ? 'notion-emoji-picker-tab--active' : ''}`}
                  onClick={() => setActiveCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="notion-emoji-picker-grid">
            {filteredEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                className="notion-emoji-picker-item"
                title={emoji}
                onClick={() => handleEmojiClick(emoji)}
              >
                {emoji}
              </button>
            ))}
            {filteredEmojis.length === 0 && (
              <span style={{ gridColumn: '1/-1', textAlign: 'center', padding: 16, fontSize: 13, color: 'var(--color-ink-muted)' }}>
                No emojis found
              </span>
            )}
          </div>
        </>
      ) : (
        /* SVG icon grid */
        <div className="notion-emoji-picker-svg-grid">
          {Object.entries(SVG_ICONS).map(([key, pathD]) => (
            <button
              key={key}
              type="button"
              className={`notion-emoji-picker-svg-item ${current === `svg:${key}` ? 'notion-cover-picker-item--active' : ''}`}
              title={key}
              onClick={() => handleSvgClick(key)}
            >
              <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: pathD }} />
            </button>
          ))}
        </div>
      )}

      {/* Footer with remove */}
      <div className="notion-emoji-picker-footer">
        <span>{current ? `Current: ${current.startsWith('svg:') ? current.slice(4) : current}` : 'No icon'}</span>
        <button type="button" className="notion-emoji-picker-remove-btn" onClick={handleRemove}>
          Remove
        </button>
      </div>
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageIcon.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:47:31 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { SVG_ICONS } from './constants';
import { EmojiPicker } from './EmojiPicker';

interface PageIconProps {
  /** Current icon — emoji string, `svg:key`, or undefined. */
  icon?: string;
  /** Called when icon changes. */
  onChangeIcon: (icon: string) => void;
  /** Called when icon is removed. */
  onRemoveIcon: () => void;
}

/**
 * Renders the large page icon (emoji or SVG).
 * Clicking opens the EmojiPicker.
 */
export const PageIcon: React.FC<PageIconProps> = ({
  icon,
  onChangeIcon,
  onRemoveIcon,
}) => {
  const [showPicker, setShowPicker] = useState(false);

  if (!icon) return null;

  const isSvg = icon.startsWith('svg:');
  const svgKey = isSvg ? icon.slice(4) : '';
  const svgPath = isSvg ? SVG_ICONS[svgKey] : undefined;

  return (
    <div className="notion-page-icon-wrapper">
      <button
        type="button"
        className="notion-page-icon"
        onClick={() => setShowPicker((v) => !v)}
        aria-label="Change page icon"
        title="Click to change icon"
      >
        {isSvg && svgPath ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: svgPath }}
          />
        ) : (
          <span>{icon}</span>
        )}
      </button>

      {showPicker && (
        <EmojiPicker
          current={icon}
          onSelect={onChangeIcon}
          onRemove={onRemoveIcon}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageIcon.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 18:19:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { AssetRenderer } from '@univers42/ui-collection';
import { EmojiPicker } from '@/shared/ui';

interface PageIconProps {
  /** Current icon as a canonical ui-collection value. */
  icon?: string;
  /** Called when icon changes. */
  onChangeIcon: (icon: string) => void;
  /** Called when icon is removed. */
  onRemoveIcon: () => void;
}

/**
 * Renders the large page icon (emoji, package icon, or SVG/media asset).
 * Clicking opens the EmojiPicker.
 */
export const PageIcon: React.FC<PageIconProps> = ({
  icon,
  onChangeIcon,
  onRemoveIcon,
}) => {
  const [showPicker, setShowPicker] = useState(false);

  if (!icon) return null;

  return (
    <div data-testid="page-icon" className="osionos-page-icon-wrapper">
      <button
        type="button"
        data-testid="page-icon-toggle-picker"
        className="osionos-page-icon"
        onClick={() => setShowPicker((v) => !v)}
        aria-label="Change page icon"
        title="Click to change icon"
      >
        <AssetRenderer value={icon} size={78} />
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

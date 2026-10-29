/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShareLevelSelect.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Dropdown } from '@/shared/ui';
import type { ShareLevel } from './types';

export const SHARE_LEVEL_LABELS: Record<ShareLevel, string> = {
  no_access: 'No access',
  can_view: 'Can view',
  can_comment: 'Can comment',
  can_edit: 'Can edit',
  full_access: 'Full access',
};

const ALL_LEVELS = Object.keys(SHARE_LEVEL_LABELS) as ShareLevel[];

interface ShareLevelSelectProps {
  value: ShareLevel;
  /** The levels the resource enforces; a page enforces fewer than the five. */
  levels?: readonly ShareLevel[];
  disabled?: boolean;
  onChange: (level: ShareLevel) => void;
}

/** The access dropdown used on every share row. */
export const ShareLevelSelect: React.FC<ShareLevelSelectProps> = ({ value, levels = ALL_LEVELS, disabled = false, onChange }) => (
  <div className={disabled ? 'pointer-events-none cursor-not-allowed opacity-60' : ''}>
    <Dropdown
      value={value}
      options={levels.map((level) => ({ value: level, label: SHARE_LEVEL_LABELS[level] }))}
      onChange={(next) => onChange(next as ShareLevel)}
      align="end"
      width="auto"
    />
  </div>
);

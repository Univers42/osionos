/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ShareLevelSelect.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
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

const OPTIONS = (Object.keys(SHARE_LEVEL_LABELS) as ShareLevel[])
  .map((level) => ({ value: level, label: SHARE_LEVEL_LABELS[level] }));

interface ShareLevelSelectProps {
  value: ShareLevel;
  disabled?: boolean;
  onChange: (level: ShareLevel) => void;
}

/** The five-level access dropdown used on every share row. */
export const ShareLevelSelect: React.FC<ShareLevelSelectProps> = ({ value, disabled = false, onChange }) => (
  <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
    <Dropdown
      value={value}
      options={OPTIONS}
      onChange={(next) => onChange(next as ShareLevel)}
      align="end"
      width="auto"
    />
  </div>
);

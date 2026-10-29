/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageLayoutSettings.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a page draws around its text: the table-of-contents rail and the
 * property rows. Both are Appearance axes (theme.ts), so they apply on every
 * page at once, without a reload, and are kept on this device.
 */

import React from 'react';

import { Toggle } from '@/shared/ui';
import { updateAppearance } from '@/shared/config/theme';
import { usePageOutline, usePageProperties } from '@/shared/config/useAppearance';
import { Section, SettingRow } from '../ui/settingsKit';

export const PageLayoutSettings: React.FC = () => {
  const pageOutline = usePageOutline();
  const pageProperties = usePageProperties();

  return (
    <Section title="Page layout">
      <SettingRow
        title="Table of contents"
        description="Show the outline at the right of a page with two or more headings."
        action={(
          <Toggle
            checked={pageOutline === 'show'}
            onChange={(checked) => updateAppearance({ pageOutline: checked ? 'show' : 'hide' })}
            label="Table of contents"
          />
        )}
      />
      <SettingRow
        title="Page properties"
        description="Show a page's properties under its title. When off, they stay on the page, out of sight."
        action={(
          <Toggle
            checked={pageProperties === 'show'}
            onChange={(checked) => updateAppearance({ pageProperties: checked ? 'show' : 'hide' })}
            label="Page properties"
          />
        )}
      />
    </Section>
  );
};

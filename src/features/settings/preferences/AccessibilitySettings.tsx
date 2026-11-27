/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccessibilitySettings.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The accessibility half of Settings > Preferences. Every control writes the
 * one Appearance object (theme.ts): the change lands on <html> and in storage
 * at once, so it takes effect without a reload and survives the next one.
 */

import React from 'react';

import { Toggle } from '@/shared/ui';
import { useAppearance } from '@/features/theme/AppearanceControls';
import { APPEARANCE_CHOICES } from '@/shared/config/appearanceChoices';
import { AxisRow } from '@/features/theme/ui/AppearanceRow';
import { Segmented } from '@/features/theme/ui/Segmented';
import { Section } from '../ui/settingsKit';

export const AccessibilitySettings: React.FC = () => {
  const [appearance, change] = useAppearance();
  const row = { appearance, onChange: change };

  return (
    <Section title="Accessibility">
      <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">
        How osionos moves, animates and answers your pointer. These choices are kept on this device.
      </p>
      <AxisRow {...row} axes={['linkUnderline']} title="Link underlines" description="Underline every link at rest, not only the ones inside a page.">
        <Segmented
          label="Link underlines"
          value={appearance.linkUnderline}
          options={APPEARANCE_CHOICES.linkUnderline.options}
          onChange={(linkUnderline) => change({ linkUnderline })}
        />
      </AxisRow>
      <AxisRow {...row} axes={['motion']} title="Motion" description="Turn the app's animations off or on, whatever your system asks for.">
        <Segmented
          label="Motion"
          value={appearance.motion}
          options={APPEARANCE_CHOICES.motion.options}
          onChange={(motion) => change({ motion })}
        />
      </AxisRow>
      <AxisRow {...row} axes={['animatedImages']} title="Animated images" description="Play GIFs and video covers, or hold them on their first frame.">
        <Segmented
          label="Animated images"
          value={appearance.animatedImages}
          options={APPEARANCE_CHOICES.animatedImages.options}
          onChange={(animatedImages) => change({ animatedImages })}
        />
      </AxisRow>
      <AxisRow {...row} axes={['hovercards']} title="Hovercards" description="Show a preview when the pointer rests on an item. When off, previews open on click.">
        <Toggle checked={appearance.hovercards === 'on'} onChange={(checked) => change({ hovercards: checked ? 'on' : 'off' })} label="Hovercards" />
      </AxisRow>
      <AxisRow {...row} axes={['urlPaste']} title="Paste a link" description="Paste a bare URL as plain text instead of turning it into a link.">
        <Segmented
          label="Paste a link"
          value={appearance.urlPaste}
          options={APPEARANCE_CHOICES.urlPaste.options}
          onChange={(urlPaste) => change({ urlPaste })}
        />
      </AxisRow>
    </Section>
  );
};

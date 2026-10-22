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

import React, { useId } from 'react';

import { MiniTabs, Toggle } from '@/shared/ui';
import { updateAppearance } from '@/shared/config/theme';
import {
  useAnimatedImagesMode,
  useHovercardsChoice,
  useLinkUnderline,
  useMotionPreference,
  useUrlPasteMode,
} from '@/shared/config/useAppearance';
import { Section, SettingRow } from '../ui/settingsKit';

type Option<T extends string> = { value: T; label: string };

/** A segmented choice with the row's title as its accessible name. */
function Choice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (next: T) => void;
}) {
  const groupId = useId();
  return (
    <div role="group" aria-labelledby={groupId} className="inline-flex">
      <span id={groupId} className="sr-only">{label}</span>
      <MiniTabs size="sm" value={value} options={options} onChange={onChange} />
    </div>
  );
}

export const AccessibilitySettings: React.FC = () => {
  const linkUnderline = useLinkUnderline();
  const motion = useMotionPreference();
  const animatedImages = useAnimatedImagesMode();
  const hovercards = useHovercardsChoice();
  const urlPaste = useUrlPasteMode();

  return (
    <Section title="Accessibility">
      <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">
        How osionos moves, animates and answers your pointer. These choices are kept on this device.
      </p>
      <SettingRow
        title="Link underlines"
        description="Underline every link at rest, not only the ones inside a page."
        action={(
          <Choice
            label="Link underlines"
            value={linkUnderline}
            options={[{ value: 'default', label: 'Default' }, { value: 'always', label: 'Always' }]}
            onChange={(next) => updateAppearance({ linkUnderline: next })}
          />
        )}
      />
      <SettingRow
        title="Motion"
        description="Turn the app's animations off or on, whatever your system asks for."
        action={(
          <Choice
            label="Motion"
            value={motion}
            options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduce' }, { value: 'full', label: 'Full' }]}
            onChange={(next) => updateAppearance({ motion: next })}
          />
        )}
      />
      <SettingRow
        title="Animated images"
        description="Play GIFs and video covers, or hold them on their first frame."
        action={(
          <Choice
            label="Animated images"
            value={animatedImages}
            options={[{ value: 'play', label: 'Play' }, { value: 'system', label: 'System' }, { value: 'still', label: 'Still' }]}
            onChange={(next) => updateAppearance({ animatedImages: next })}
          />
        )}
      />
      <SettingRow
        title="Hovercards"
        description="Open a preview card on click instead of when the pointer passes over it."
        action={(
          <Toggle
            checked={hovercards === 'on'}
            onChange={(checked) => updateAppearance({ hovercards: checked ? 'on' : 'off' })}
            label="Hovercards"
          />
        )}
      />
      <SettingRow
        title="Paste a link"
        description="Paste a bare URL as plain text instead of turning it into a link."
        action={(
          <Choice
            label="Paste a link"
            value={urlPaste}
            options={[{ value: 'link', label: 'Link' }, { value: 'plain', label: 'Plain' }]}
            onChange={(next) => updateAppearance({ urlPaste: next })}
          />
        )}
      />
    </Section>
  );
};

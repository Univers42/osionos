import React from 'react';

import { ColorSettings, LayoutSettings, useAppearance } from '@/features/theme/AppearanceControls';
import { MotionControls } from '@/features/theme/MotionControls';
import { useThemeSelection } from '@/features/theme/model/useThemeSelection';
import { StyleControls } from '@/features/theme/StyleControls';
import { ThemeSettings } from '@/features/theme/WorkspaceThemePanel';
import { Section } from '../ui/settingsKit';
import { AccessibilitySettings } from './AccessibilitySettings';
import { AppearanceBackup } from './AppearanceBackup';

/**
 * Every appearance block of Settings > Preferences, top to bottom: Theme, Style, Color,
 * Layout and text, Motion, Accessibility, then Your appearance (export, import, reset).
 * One theme selection is shared so the reset sees what the theme rows show.
 */
export const AppearanceSections: React.FC = () => {
  const theme = useThemeSelection();
  const [appearance, change] = useAppearance();
  return (
    <>
      <Section title="Theme" anchor="appearance">
        <ThemeSettings theme={theme} />
      </Section>
      <Section title="Style" anchor="style">
        <StyleControls appearance={appearance} onChange={change} />
      </Section>
      <Section title="Color" anchor="color">
        <ColorSettings appearance={appearance} paletteId={theme.palette} onChange={change} />
      </Section>
      <Section title="Layout and text" anchor="layout">
        <LayoutSettings appearance={appearance} onChange={change} />
      </Section>
      <Section title="Motion" anchor="motion">
        <MotionControls appearance={appearance} onChange={change} />
      </Section>
      <AccessibilitySettings />
      <AppearanceBackup theme={theme} />
    </>
  );
};

import React from 'react';

import { ColorSettings, LayoutSettings, useAppearance } from '@/features/theme/AppearanceControls';
import { MotionControls } from '@/features/theme/MotionControls';
import { useThemeSelection } from '@/features/theme/model/useThemeSelection';
import { StyleControls } from '@/features/theme/StyleControls';
import { AppearanceSummary } from '@/features/theme/ui/AppearanceSummary';
import { ThemeTokenReference } from '@/features/theme/ui/ThemeTokenReference';
import { ThemeSettings } from '@/features/theme/WorkspaceThemePanel';
import { Section } from '../ui/settingsKit';
import { AccessibilitySettings } from './AccessibilitySettings';
import { AppearanceBackup } from './AppearanceBackup';

/**
 * Every appearance block of Settings > Preferences, top to bottom: Theme, Style, Color,
 * Layout and text, Motion, Theme tokens, Accessibility, then Your appearance (export, import, reset).
 * One theme selection is shared so the reset sees what the theme rows show.
 */
export const AppearanceSections: React.FC = () => {
  const theme = useThemeSelection();
  const [appearance, change] = useAppearance();
  return (
    <>
      <AppearanceSummary appearance={appearance} />
      <Section title="Theme" anchor="appearance" description="The colors and fonts the whole app uses. Pick a shipped theme or load your own JSON.">
        <ThemeSettings theme={theme} />
      </Section>
      <Section title="Style" anchor="style" description="How surfaces, shadows and borders look.">
        <StyleControls appearance={appearance} onChange={change} />
      </Section>
      <Section title="Color" anchor="color" description="Accent color and the look of the text cursor.">
        <ColorSettings appearance={appearance} paletteId={theme.palette} onChange={change} />
      </Section>
      <Section title="Layout and text" anchor="layout" description="Spacing, corner shape and text size.">
        <LayoutSettings appearance={appearance} onChange={change} />
      </Section>
      <Section title="Motion" anchor="motion" description="How pages and menus move, and how fast. A choice here overrides the theme's own motion.">
        <MotionControls appearance={appearance} onChange={change} />
      </Section>
      <Section title="Theme tokens" anchor="theme-tokens" description="Every key a theme JSON accepts, with the value it has right now.">
        <ThemeTokenReference />
      </Section>
      <AccessibilitySettings />
      <AppearanceBackup theme={theme} />
    </>
  );
};

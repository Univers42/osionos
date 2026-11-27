import React from 'react';

import { isThemesEnabled } from '@/shared/config/featureFlags';
import type { ThemeMode } from '@/shared/config/theme';
import { ThemeGallery } from './ThemeGallery';

/** The theme library in Preferences: the gallery, behind the themes flag, keeping the Settings search anchor. */
export const ThemeLibraryControls: React.FC<{ mode?: ThemeMode }> = ({ mode = 'system' }) => {
  if (!isThemesEnabled()) return null;
  return (
    <div data-settings-anchor="theme-json" className="space-y-2">
      <ThemeGallery mode={mode} />
    </div>
  );
};

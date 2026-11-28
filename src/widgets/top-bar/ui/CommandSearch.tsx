import React, { useMemo } from "react";

import type { SettingsSectionId } from "@/features/settings/model/sections";
import { usePaletteSources } from "../model/usePaletteSources";
import { TopBarSearch } from "./TopBarSearch";

/** The "Search pages or run a command" palette on its own, for a shell without the top bar. */
export const CommandSearch: React.FC<{ onOpenSettings: (section?: SettingsSectionId) => void; touch?: boolean }> = ({ onOpenSettings, touch }) => {
  const ctx = useMemo(() => ({ openSettings: onOpenSettings }), [onOpenSettings]);
  const { commands, inlineSettings } = usePaletteSources(ctx);
  return <TopBarSearch commands={commands} settings={inlineSettings} touch={touch} />;
};

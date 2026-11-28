import { useEffect, useRef, useState } from "react";

import { buildCommands, type PaletteCommand } from "./commands";
import { usePalette } from "./usePalette";
import type { SettingsTable } from "./usePaletteResults";

type PaletteCtx = Parameters<typeof buildCommands>[0];

/**
 * The commands and the ':' settings table a palette searches. Both registries load WITH the
 * palette opening, never with the entry chunk; one attempt each, a failure shows as a warning and
 * the other source keeps working.
 */
export function usePaletteSources(ctx: PaletteCtx): { commands: PaletteCommand[]; inlineSettings: SettingsTable } {
  const [settingsCommands, setSettingsCommands] = useState<PaletteCommand[] | null>(null);
  const paletteOpen = usePalette((state) => state.open);
  const commands = buildCommands(ctx, settingsCommands ?? []);

  useEffect(() => {
    if (!paletteOpen || settingsCommands !== null) return;
    void Promise.allSettled([
      import("@/features/settings/model/settingsCommands").then((module) => module.settingsPaletteCommands()),
      import("@/features/page-shells/model/layoutPaletteCommands").then((module) => module.layoutPaletteCommands()),
    ]).then(([settings, pages]) => {
      if (settings.status === "rejected") console.warn("[top-bar] settings commands failed to load");
      if (pages.status === "rejected") console.warn("[top-bar] page commands failed to load");
      setSettingsCommands([
        ...(settings.status === "fulfilled" ? settings.value : []),
        ...(pages.status === "fulfilled" ? pages.value : []),
      ]);
    });
  }, [paletteOpen, settingsCommands]);

  const [inlineSettings, setInlineSettings] = useState<SettingsTable>("loading");
  const settingsRequested = useRef(false);
  useEffect(() => {
    if (!paletteOpen || settingsRequested.current) return;
    settingsRequested.current = true;
    import("@/features/settings/model/inlineSettings")
      .then((module) => setInlineSettings(module.inlineSettings()))
      .catch(() => {
        console.warn("[top-bar] inline settings failed to load");
        setInlineSettings("failed");
      });
  }, [paletteOpen]);
  return { commands, inlineSettings };
}

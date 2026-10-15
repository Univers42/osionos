import React, { useState } from "react";

import {
  applyPalette,
  applyTheme,
  PALETTES,
  persistPalette,
  persistThemeMode,
  readStoredPalette,
} from "@/shared/config/theme";

const CONTROL =
  "h-[var(--osio-control-h-md)] rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-accent)]";
const IDLE = "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)]";
const PRESSED = "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]";

interface PaletteSelectProps {
  value: string;
  onChange: (id: string) => void;
}

const PaletteSelect: React.FC<PaletteSelectProps> = ({ value, onChange }) => (
  <select
    aria-label="Palette"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={`${CONTROL} ${IDLE}`}
  >
    {PALETTES.map((entry) => (
      <option key={entry.id} value={entry.id}>
        {entry.label}
      </option>
    ))}
  </select>
);

interface ModeToggleProps {
  mode: "light" | "dark";
  onChange: (mode: "light" | "dark") => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => (
  <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
    <button
      type="button"
      aria-pressed={mode === "light"}
      onClick={() => onChange("light")}
      className={`${CONTROL} ${mode === "light" ? PRESSED : IDLE}`}
    >
      Light
    </button>
    <button
      type="button"
      aria-pressed={mode === "dark"}
      onClick={() => onChange("dark")}
      className={`${CONTROL} ${mode === "dark" ? PRESSED : IDLE}`}
    >
      Dark
    </button>
  </div>
);

export const StyleGuideToolbar: React.FC = () => {
  const [palette, setPalette] = useState(readStoredPalette);
  const [mode, setMode] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  const choosePalette = (id: string) => {
    applyPalette(id);
    persistPalette(id);
    setPalette(id);
  };

  const chooseMode = (next: "light" | "dark") => {
    applyTheme(next);
    persistThemeMode(next);
    setMode(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PaletteSelect value={palette} onChange={choosePalette} />
      <ModeToggle mode={mode} onChange={chooseMode} />
    </div>
  );
};

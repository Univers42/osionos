import React, { useCallback, useState } from "react";

import { useBlockColorProfileStore } from "@/shared/config/blockColorProfileStore";
import { Button } from "@/shared/ui";

export const PROFILE_PANEL_WIDTH = 288;

// The browser draws its own swatch frame, so the input carries no field border of its own.
const COLOUR_INPUT = "mt-1 h-[var(--osio-control-h-md)] w-full cursor-pointer rounded-[var(--osio-radius-sm)] border-0 bg-transparent p-0";

interface ColorProfilePanelProps {
  style: React.CSSProperties;
}

export const ColorProfilePanel: React.FC<ColorProfilePanelProps> = ({ style }) => {
  const profiles = useBlockColorProfileStore((state) => state.profiles);
  const addProfile = useBlockColorProfileStore((state) => state.addProfile);
  const removeProfile = useBlockColorProfileStore((state) => state.removeProfile);
  const [name, setName] = useState("Custom profile");
  const [textColor, setTextColor] = useState("#1f2937");
  const [backgroundColor, setBackgroundColor] = useState("#f3f4f6");

  const handleSubmit = useCallback((event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    addProfile({
      name,
      textColor,
      backgroundColor,
    });
    setName("Custom profile");
  }, [addProfile, backgroundColor, name, textColor]);

  return (
    <aside
      className="osio-surface-overlay fixed overflow-y-auto"
      style={{ ...style, width: PROFILE_PANEL_WIDTH, zIndex: 10003 }}
      aria-label="Color profile properties"
    >
      <div className="p-2">
        <div className="mb-3">
          <p className="text-xs font-medium text-[var(--osio-fg-muted)]">
            Color profiles
          </p>
          <p className="text-sm text-[var(--osio-fg-default)]">
            Reusable foreground and background pairs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-[var(--osio-fg-muted)]">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="osio-field mt-1 w-full px-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-[var(--osio-fg-muted)]">
              <span>Text</span>
              <input
                type="color"
                value={textColor}
                onChange={(event) => setTextColor(event.target.value)}
                className={COLOUR_INPUT}
              />
            </label>
            <label className="text-xs font-medium text-[var(--osio-fg-muted)]">
              <span>Background</span>
              <input
                type="color"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
                className={COLOUR_INPUT}
              />
            </label>
          </div>
          <Button type="submit" tone="primary" size="sm" className="w-full">
            + Save profile
          </Button>
        </form>

        <div className="mt-3 space-y-1">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center gap-2 rounded-[var(--osio-radius-sm)] px-2 py-1.5 hover:bg-[var(--osio-menu-item-hover-bg)]"
            >
              <span
                className="h-5 w-5 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)]"
                style={{ backgroundColor: profile.backgroundColor }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">
                {profile.name}
              </span>
              <button
                type="button"
                className="rounded-[var(--osio-radius-sm)] px-1.5 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
                onClick={() => removeProfile(profile.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

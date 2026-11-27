/**
 * The personal rows of Settings > Preferences: Color (accent and caret) and Layout and text
 * (density, corners, text size). Every change is written to <html> and to storage at once
 * (theme.ts); each row shows when it differs from the default and resets on its own.
 */

import React, { useSyncExternalStore } from 'react';

import {
  ACCENT_PRESETS,
  CUSTOM_ACCENT,
  FIXED_ACCENT_PALETTES,
  readCurrentAppearance,
  subscribeAppearance,
  updateAppearance,
  type Appearance,
  type Density,
  type Roundness,
  type UiScale,
} from '@/shared/config/theme';

import { APPEARANCE_CHOICES } from '@/shared/config/appearanceChoices';
import { AxisRow } from './ui/AppearanceRow';
import { CaretSettings } from './ui/CaretSettings';
import { Segmented } from './ui/Segmented';
import { Swatch } from './ui/Swatch';

type Change = (patch: Partial<Appearance>) => void;

/**
 * The live appearance and the way to change it. The value comes from the
 * Appearance store (theme.ts), not from a copy taken at mount: such a copy is
 * older than the last change, and merging a patch into it would roll that
 * change back — the theme controls and the accessibility controls write to
 * the same object.
 */
export function useAppearance(): [Appearance, Change] {
  const appearance = useSyncExternalStore(subscribeAppearance, readCurrentAppearance, readCurrentAppearance);
  return [appearance, (patch) => void updateAppearance(patch)];
}

const AccentPicker: React.FC<{ appearance: Appearance; paletteId: string; onChange: Change }> = ({ appearance, paletteId, onChange }) => {
  const custom = appearance.accent === CUSTOM_ACCENT;
  return (
    <div>
      <div role="group" aria-label="Accent" className="flex flex-wrap items-center gap-3">
        {ACCENT_PRESETS.map((preset) => (
          <Swatch
            key={preset.id}
            label={preset.label}
            colours={{ light: preset.swatch, dark: preset.swatchDark }}
            selected={appearance.accent === preset.id}
            onSelect={() => onChange({ accent: preset.id })}
          />
        ))}
        <Swatch label="Custom" className="osio-accent-swatch-custom" selected={custom} onSelect={() => onChange({ accent: CUSTOM_ACCENT })} />
        <span className="text-xs text-[var(--osio-fg-muted)]">{custom ? 'Custom' : ACCENT_PRESETS.find((preset) => preset.id === appearance.accent)?.label}</span>
      </div>
      {custom ? (
        <label className="mt-3 flex items-center gap-3 text-xs text-[var(--osio-fg-muted)]">
          Hue
          <input
            name="accent-hue"
            type="range"
            min={0}
            max={359}
            step={1}
            value={appearance.hue}
            aria-label="Accent hue"
            aria-valuetext={`${appearance.hue} degrees`}
            onChange={(event) => onChange({ hue: Number(event.target.value) })}
            className="h-[var(--osio-control-h-md)] w-48 accent-[var(--osio-accent)]"
          />
          <output className="w-9 tabular-nums text-[var(--osio-fg-default)]">{appearance.hue}°</output>
        </label>
      ) : null}
      {FIXED_ACCENT_PALETTES.includes(paletteId) ? (
        <p className="mt-2 text-xs text-[var(--osio-fg-muted)]">This color theme keeps its own accent to stay at AAA contrast.</p>
      ) : null}
    </div>
  );
};

/** The accent row and the three caret rows. */
export const ColorSettings: React.FC<{ appearance: Appearance; paletteId: string; onChange: Change }> = ({ appearance, paletteId, onChange }) => (
  <>
    <AxisRow title="Accent" description="The color of links, selections and buttons." appearance={appearance} axes={['accent', 'hue']} onChange={onChange} stack>
      <AccentPicker appearance={appearance} paletteId={paletteId} onChange={onChange} />
    </AxisRow>
    <CaretSettings appearance={appearance} onChange={onChange} />
  </>
);

/** Density, corners and text size. */
export const LayoutSettings: React.FC<{ appearance: Appearance; onChange: Change }> = ({ appearance, onChange }) => (
  <>
    <AxisRow title="Density" description="How much room rows, menus and controls take." appearance={appearance} axes={['density']} onChange={onChange}>
      <Segmented<Density>
        label="Density"
        value={appearance.density}
        options={APPEARANCE_CHOICES.density.options}
        onChange={(density) => onChange({ density })}
      />
    </AxisRow>
    <AxisRow title="Corners" description="How round buttons, cards and menus are." appearance={appearance} axes={['radius']} onChange={onChange}>
      <Segmented<Roundness>
        label="Corners"
        value={appearance.radius}
        options={APPEARANCE_CHOICES.radius.options}
        previewAxis="radius"
        onChange={(radius) => onChange({ radius })}
      />
    </AxisRow>
    <AxisRow title="Text size" description="Scales the text and the controls around it." appearance={appearance} axes={['uiScale']} onChange={onChange}>
      <Segmented<UiScale>
        label="Text size"
        value={appearance.uiScale}
        options={APPEARANCE_CHOICES.uiScale.options}
        onChange={(uiScale) => onChange({ uiScale })}
      />
    </AxisRow>
  </>
);

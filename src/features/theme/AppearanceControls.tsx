/**
 * The personal half of Settings > Appearance: an accent row (the presets and a
 * free hue) and segmented controls for density, corners and text size. Every
 * change is written to <html> and to storage at once (theme.ts).
 */

import React, { useId, useState } from 'react';

import { MiniTabs } from '@/shared/ui';
import {
  ACCENT_PRESETS,
  applyAppearance,
  CUSTOM_ACCENT,
  FIXED_ACCENT_PALETTES,
  persistAppearance,
  readStoredAppearance,
  type Appearance,
  type Density,
  type Roundness,
  type UiScale,
} from '@/shared/config/theme';

const LABEL = 'mb-2 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]';
const SWATCH =
  'h-6 w-6 shrink-0 rounded-full border border-[var(--osio-border-default)] transition-shadow duration-[var(--osio-dur-fast)]';

export function useAppearance(): [Appearance, (patch: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState<Appearance>(() => readStoredAppearance());
  const change = (patch: Partial<Appearance>) => {
    const next = { ...appearance, ...patch };
    applyAppearance(next);
    persistAppearance(next);
    setAppearance(next);
  };
  return [appearance, change];
}

const Swatch: React.FC<{ label: string; selected: boolean; onSelect: () => void; className?: string; color?: string }> = ({
  label,
  selected,
  onSelect,
  className = '',
  color,
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    onClick={onSelect}
    style={color ? { background: color } : undefined}
    className={`${SWATCH} ${className} ${
      selected ? 'ring-2 ring-[var(--osio-fg-default)] ring-offset-2 ring-offset-[var(--osio-bg-surface)]' : 'hover:ring-2 hover:ring-[var(--osio-border-strong)] hover:ring-offset-2 hover:ring-offset-[var(--osio-bg-surface)]'
    }`}
  />
);

export const AccentControl: React.FC<{ appearance: Appearance; paletteId: string; onChange: (patch: Partial<Appearance>) => void }> = ({
  appearance,
  paletteId,
  onChange,
}) => {
  const headingId = useId();
  const custom = appearance.accent === CUSTOM_ACCENT;
  return (
    <div>
      <p id={headingId} className={LABEL}>
        Accent
      </p>
      <div role="group" aria-labelledby={headingId} className="flex flex-wrap items-center gap-3">
        {ACCENT_PRESETS.map((preset) => (
          <Swatch
            key={preset.id}
            label={preset.label}
            color={preset.swatch}
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

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{ label: string; value: T; options: { value: T; label: string }[]; onChange: (next: T) => void }>) {
  const headingId = useId();
  return (
    <div>
      <p id={headingId} className={LABEL}>
        {label}
      </p>
      <div role="group" aria-labelledby={headingId} className="inline-flex">
        <MiniTabs size="sm" value={value} options={options} onChange={onChange} />
      </div>
    </div>
  );
}

export const ShapeControls: React.FC<{ appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }> = ({
  appearance,
  onChange,
}) => (
  <>
    <Segmented<Density>
      label="Density"
      value={appearance.density}
      options={[
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' },
      ]}
      onChange={(density) => onChange({ density })}
    />
    <Segmented<Roundness>
      label="Corners"
      value={appearance.radius}
      options={[
        { value: 'sharp', label: 'Sharp' },
        { value: 'default', label: 'Default' },
        { value: 'round', label: 'Round' },
      ]}
      onChange={(radius) => onChange({ radius })}
    />
    <Segmented<UiScale>
      label="Text size"
      value={appearance.uiScale}
      options={[
        { value: 'small', label: 'Small' },
        { value: 'default', label: 'Default' },
        { value: 'large', label: 'Large' },
      ]}
      onChange={(uiScale) => onChange({ uiScale })}
    />
  </>
);

/**
 * The personal half of Settings > Appearance: an accent row (the presets and a
 * free hue), segmented controls for density, corners and text size, and the
 * caret (colour, shape and blink; a shape or a steady caret is drawn by the app). Every
 * change is written to <html> and to storage at once (theme.ts).
 */

import React, { useId, useSyncExternalStore } from 'react';

import { MiniTabs } from '@/shared/ui';
import {
  ACCENT_PRESETS,
  CARET_COLORS,
  CUSTOM_ACCENT,
  FIXED_ACCENT_PALETTES,
  readCurrentAppearance,
  subscribeAppearance,
  updateAppearance,
  type Appearance,
  type CaretBlink,
  type CaretColor,
  type CaretShape,
  type Density,
  type Roundness,
  type UiScale,
} from '@/shared/config/theme';

const LABEL = 'mb-2 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]';
const SWATCH =
  'h-6 w-6 shrink-0 rounded-full border border-[var(--osio-border-default)] transition-shadow duration-[var(--osio-dur-fast)]';

/**
 * The live appearance and the way to change it. The value comes from the
 * Appearance store (theme.ts), not from a copy taken at mount: such a copy is
 * older than the last change, and merging a patch into it would roll that
 * change back — the theme controls and the accessibility controls write to
 * the same object.
 */
export function useAppearance(): [Appearance, (patch: Partial<Appearance>) => void] {
  const appearance = useSyncExternalStore(subscribeAppearance, readCurrentAppearance, readCurrentAppearance);
  const change = (patch: Partial<Appearance>) => {
    updateAppearance(patch);
  };
  return [appearance, change];
}

// The swatch shows the accent the person will get: both modes' solids are custom
// properties and the dark one takes over under <html data-theme="dark">, so a
// swatch follows the theme without the component knowing it.
const PRESET_COLOURS = 'bg-[var(--swatch-light)] [[data-theme=dark]_&]:bg-[var(--swatch-dark)]';

const Swatch: React.FC<{ label: string; selected: boolean; onSelect: () => void; className?: string; colours?: { light: string; dark: string } }> = ({
  label,
  selected,
  onSelect,
  className = '',
  colours,
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    onClick={onSelect}
    style={colours ? ({ '--swatch-light': colours.light, '--swatch-dark': colours.dark } as React.CSSProperties) : undefined}
    className={`${SWATCH} ${colours ? PRESET_COLOURS : ''} ${className} ${
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

const CARET_INKS: Record<CaretColor, { label: string; ink: string }> = {
  accent: { label: 'Accent', ink: 'var(--osio-accent-text)' },
  text: { label: 'Text', ink: 'var(--osio-fg-default)' },
  blue: { label: 'Blue', ink: 'var(--osio-block-tint-blue-fg)' },
  green: { label: 'Green', ink: 'var(--osio-block-tint-green-fg)' },
  purple: { label: 'Purple', ink: 'var(--osio-block-tint-purple-fg)' },
  red: { label: 'Red', ink: 'var(--osio-block-tint-red-fg)' },
  orange: { label: 'Orange', ink: 'var(--osio-block-tint-orange-fg)' },
  pink: { label: 'Pink', ink: 'var(--osio-block-tint-pink-fg)' },
};

export const CaretControls: React.FC<{ appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }> = ({
  appearance,
  onChange,
}) => {
  const headingId = useId();
  return (
    <>
      <div>
        <p id={headingId} className={LABEL}>
          Caret
        </p>
        <div role="group" aria-labelledby={headingId} className="flex flex-wrap items-center gap-3">
          {CARET_COLORS.map((color) => (
            <Swatch
              key={color}
              label={`${CARET_INKS[color].label} caret`}
              colours={{ light: CARET_INKS[color].ink, dark: CARET_INKS[color].ink }}
              selected={appearance.caretColor === color}
              onSelect={() => onChange({ caretColor: color })}
            />
          ))}
          <span className="text-xs text-[var(--osio-fg-muted)]">{CARET_INKS[appearance.caretColor].label}</span>
        </div>
        {/* Editable text, not an input: the drawn caret follows text, and a block needs a letter under it. */}
        <div
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Try the caret"
          spellCheck={false}
          className="mt-3 w-64 max-w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)]"
        >
          Click here and type to try it
        </div>
      </div>
      <Segmented<CaretShape>
        label="Caret shape"
        value={appearance.caretShape}
        options={[
          { value: 'bar', label: 'Thin' },
          { value: 'thick', label: 'Thick' },
          { value: 'block', label: 'Block' },
          { value: 'underscore', label: 'Underline' },
        ]}
        onChange={(caretShape) => onChange({ caretShape })}
      />
      <Segmented<CaretBlink>
        label="Caret blink"
        value={appearance.caretBlink}
        options={[
          { value: 'on', label: 'Blink' },
          { value: 'off', label: 'Steady' },
        ]}
        onChange={(caretBlink) => onChange({ caretBlink })}
      />
    </>
  );
};

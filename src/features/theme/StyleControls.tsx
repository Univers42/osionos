/**
 * Settings > Preferences > Style: one-click looks (Calm, Paper, Soft, Frost, Aurora) and, under them,
 * the three axes they combine: surface, depth and borders. A style is a native radio group,
 * so arrow keys, focus and screen readers need no key handling; the active one is derived
 * from the appearance, and none is checked while the axes are mixed ("Custom").
 */

import React, { useId } from 'react';

import { STYLE_PRESETS, activeStyleId, type StyleId } from '@/shared/config/stylePresets';
import type { Appearance, Borders, Elevation, Surface } from '@/shared/config/theme';

import { Segmented } from './AppearanceControls';

interface Look {
  radius: string;
  shadow: string;
  border: string;
  card: string;
  canvas?: string;
}

const SOLID = 'var(--osio-bg-page)';
const FROSTED = 'color-mix(in srgb, var(--osio-bg-elevated) 55%, transparent)';

const AURORA =
  'radial-gradient(70% 90% at 15% 10%, color-mix(in srgb, var(--osio-accent) 35%, transparent), transparent 70%), radial-gradient(70% 90% at 90% 90%, color-mix(in srgb, var(--osio-accent) 25%, transparent), transparent 70%), var(--osio-bg-canvas)';

const LOOKS: Record<StyleId, Look> = {
  calm: { radius: '6px', shadow: 'var(--osio-e1)', border: '1px solid var(--osio-border-default)', card: SOLID },
  paper: { radius: '1px', shadow: 'none', border: '1px solid var(--osio-border-strong)', card: SOLID },
  soft: { radius: '10px', shadow: 'var(--osio-e4)', border: '1px solid transparent', card: SOLID },
  frost: { radius: '6px', shadow: 'var(--osio-e1)', border: '1px solid var(--osio-border-default)', card: FROSTED },
  aurora: { radius: '10px', shadow: 'var(--osio-e4)', border: '1px solid transparent', card: FROSTED, canvas: AURORA },
};

/** A static miniature of one style: a canvas, a sidebar strip and a page card. No blur: the translucency is a colour mix over a coloured blob. */
const StyleMock: React.FC<{ look: Look }> = ({ look }) => {
  const card = { background: look.card, border: look.border, borderRadius: look.radius, boxShadow: look.shadow };
  return (
    <span aria-hidden="true" className="relative flex h-16 w-full gap-1.5 overflow-hidden rounded-md bg-[var(--osio-bg-canvas)] p-1.5" style={look.canvas ? { background: look.canvas } : undefined}>
      <span className="absolute -right-2 -top-3 h-10 w-14 rounded-full bg-[var(--osio-accent)] opacity-60" />
      <span className="relative w-5 shrink-0" style={card} />
      <span className="relative flex-1" style={card} />
    </span>
  );
};

export const StyleControls: React.FC<{ appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }> = ({ appearance, onChange }) => {
  const group = useId();
  const active = activeStyleId(appearance);
  return (
    <div className="space-y-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">Style</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {STYLE_PRESETS.map((preset) => (
            <label key={preset.id} className="relative flex min-h-11 cursor-pointer flex-col gap-1.5">
              <input
                type="radio"
                name={group}
                value={preset.id}
                checked={active === preset.id}
                onChange={() => onChange(preset.patch)}
                className="peer sr-only"
              />
              <span className="flex flex-col gap-1.5 rounded-xl border border-[var(--osio-border-default)] p-1.5 peer-checked:[&_svg]:block peer-checked:border-[var(--osio-accent)] peer-checked:ring-2 peer-checked:ring-[var(--osio-accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--osio-focus-ring-color)]">
                <StyleMock look={LOOKS[preset.id]} />
                <span className="flex items-center justify-between gap-1 px-0.5 text-sm font-semibold text-[var(--osio-fg-default)]">
                  {preset.label}
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="hidden h-4 w-4 shrink-0 fill-none stroke-current stroke-2">
                    <path d="M3 8.5l3.2 3.2L13 4.8" />
                  </svg>
                </span>
              </span>
            </label>
          ))}
        </div>
        {active === null ? <p className="mt-2 text-xs text-[var(--osio-fg-muted)]">Custom: the three controls below no longer match a style.</p> : null}
      </fieldset>
      <Segmented<Surface>
        label="Surface"
        value={appearance.surface}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'frosted', label: 'Frosted' },
          { value: 'glass', label: 'Glass' },
        ]}
        onChange={(surface) => onChange({ surface })}
      />
      <Segmented<Elevation>
        label="Depth"
        value={appearance.elevation}
        options={[
          { value: 'flat', label: 'Flat' },
          { value: 'default', label: 'Default' },
          { value: 'deep', label: 'Deep' },
        ]}
        onChange={(elevation) => onChange({ elevation })}
      />
      <Segmented<Borders>
        label="Borders"
        value={appearance.borders}
        options={[
          { value: 'none', label: 'None' },
          { value: 'default', label: 'Default' },
          { value: 'strong', label: 'Strong' },
        ]}
        onChange={(borders) => onChange({ borders })}
      />
    </div>
  );
};

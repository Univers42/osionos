import React from 'react';

const SWATCH =
  'h-6 w-6 shrink-0 rounded-full border border-[var(--osio-border-default)] transition-shadow duration-[var(--osio-dur-fast)]';

/** The swatch shows the colour the person will get: both modes' solids are custom properties and the dark one takes over under <html data-theme="dark">. */
const PRESET_COLOURS = 'bg-[var(--swatch-light)] [[data-theme=dark]_&]:bg-[var(--swatch-dark)]';

export const Swatch: React.FC<{
  label: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  colours?: { light: string; dark: string };
}> = ({ label, selected, onSelect, className = '', colours }) => (
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

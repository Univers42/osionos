import React from 'react';

import { CARET_COLORS, type Appearance, type CaretBlink, type CaretColor, type CaretShape } from '@/shared/config/theme';

import { AxisRow } from './AppearanceRow';
import { Segmented } from './Segmented';
import { Swatch } from './Swatch';

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

interface Props {
  appearance: Appearance;
  onChange: (patch: Partial<Appearance>) => void;
}

/**
 * The text caret: its colour (with a field to try it in), its shape and whether it blinks.
 * The try-field is editable text, not an input: the drawn caret follows text, and a block
 * needs a letter under it.
 */
export const CaretSettings: React.FC<Props> = ({ appearance, onChange }) => (
  <>
    <AxisRow title="Caret color" description="The color of the blinking text cursor." appearance={appearance} axes={['caretColor']} onChange={onChange} stack>
      <div role="group" aria-label="Caret color" className="flex flex-wrap items-center gap-3">
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
    </AxisRow>
    <AxisRow title="Caret shape" description="A thin bar, a thick bar, a block or an underline." appearance={appearance} axes={['caretShape']} onChange={onChange}>
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
    </AxisRow>
    <AxisRow title="Caret blink" description="Blink while you type, or stay steady." appearance={appearance} axes={['caretBlink']} onChange={onChange}>
      <Segmented<CaretBlink>
        label="Caret blink"
        value={appearance.caretBlink}
        options={[
          { value: 'on', label: 'Blink' },
          { value: 'off', label: 'Steady' },
        ]}
        onChange={(caretBlink) => onChange({ caretBlink })}
      />
    </AxisRow>
  </>
);

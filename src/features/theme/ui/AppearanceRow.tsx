import React from 'react';
import { RotateCcw } from 'lucide-react';

import type { Appearance } from '@/shared/config/theme';

import { defaultsFor, isChanged } from '../model/appearanceTransfer';

interface RowProps {
  title: string;
  description?: string;
  changed: boolean;
  onReset: () => void;
  /** wide controls (cards, swatches) go under the text instead of beside it. */
  stack?: boolean;
  anchor?: string;
  children: React.ReactNode;
}

const ResetButton: React.FC<{ title: string; onReset: () => void }> = ({ title, onReset }) => (
  <button
    type="button"
    onClick={onReset}
    aria-label={`Reset ${title} to default`}
    title={`Reset ${title} to default`}
    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
  >
    <RotateCcw size={14} aria-hidden="true" />
  </button>
);

/**
 * One appearance setting: a title, what it does, the control, and, only while the setting
 * differs from its default, a dot before the title and a Reset button. The dot is decoration;
 * the Reset button (named "Reset <title> to default") is the accessible signal.
 */
export const AppearanceRow: React.FC<RowProps> = ({ title, description, changed, onReset, stack = false, anchor, children }) => {
  const reset = changed ? <ResetButton title={title} onReset={onReset} /> : null;
  return (
    <div data-settings-anchor={anchor} className="border-t border-[var(--osio-border-default)] py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--osio-fg-default)]">
            {changed ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--osio-accent)]" /> : null}
            {title}
          </div>
          {description ? <div className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{description}</div> : null}
        </div>
        {stack ? reset : <div className="flex shrink-0 items-center gap-2">{reset}{children}</div>}
      </div>
      {stack ? <div className="mt-3">{children}</div> : null}
    </div>
  );
};

type AxisRowProps = Omit<RowProps, 'changed' | 'onReset'> & {
  appearance: Appearance;
  axes: readonly (keyof Appearance)[];
  onChange: (patch: Partial<Appearance>) => void;
};

/** An AppearanceRow whose reset state comes from the appearance axes it controls. */
export const AxisRow: React.FC<AxisRowProps> = ({ appearance, axes, onChange, ...row }) => (
  <AppearanceRow {...row} changed={isChanged(appearance, axes)} onReset={() => onChange(defaultsFor(axes))} />
);

import React from 'react';

import type { Appearance } from '@/shared/config/appearance';
import { diffFromDefault } from '../model/appearanceTransfer';
import { axisLabel, jumpBehavior, rowAnchorFor, sectionFor, summaryLine, valueLabel } from '../model/appearanceSummaryModel';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Scrolls to the row anchor (when the axis has one and it is rendered), else the section,
 * then puts focus on its first control so a keyboard user lands there.
 */
function jumpTo(anchors: readonly string[], appearance: Appearance): void {
  const target = anchors.map((id) => document.querySelector<HTMLElement>(`[data-settings-anchor="${id}"]`)).find(Boolean);
  if (!target) return;
  const systemReduced = globalThis.matchMedia?.(REDUCED_QUERY).matches ?? false;
  target.scrollIntoView({ block: 'start', behavior: jumpBehavior(appearance.motion, systemReduced) });
  target.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
}

const chipClass =
  'inline-flex min-h-8 max-w-full items-center rounded-[var(--osio-control-radius)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 text-left text-xs font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-accent)] pointer-coarse:min-h-11';

const linkClass =
  'inline-flex min-h-8 items-center rounded-[var(--osio-control-radius)] text-sm text-[var(--osio-fg-muted)] underline underline-offset-2 hover:text-[var(--osio-fg-default)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-accent)] pointer-coarse:min-h-11';

/**
 * "Your changes": one chip per appearance axis that is off its default, each a jump to the
 * row or section that sets it, plus a jump to export, import and reset. Pure render from `appearance`.
 */
export const AppearanceSummary: React.FC<{ appearance: Appearance }> = ({ appearance }) => {
  const changed = Object.entries(diffFromDefault(appearance));
  return (
    <div data-testid="appearance-summary" className="space-y-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
      <div className="space-y-1">
        <h2 className="font-sans text-base font-semibold text-[var(--osio-fg-default)]">Your changes</h2>
        <p className="text-sm leading-[18px] text-[var(--osio-fg-muted)]">{summaryLine(changed.length)}</p>
      </div>
      {changed.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {changed.map(([axis, value]) => {
            const label = axisLabel(axis);
            const shown = valueLabel(axis, value);
            return (
              <li key={axis} className="max-w-full">
                <button
                  type="button"
                  className={chipClass}
                  aria-label={`${label}: ${shown}, go to setting`}
                  onClick={() => jumpTo([rowAnchorFor(axis), sectionFor(axis)].filter((id): id is string => id !== null), appearance)}
                >
                  {label}: {shown}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className={linkClass} onClick={() => jumpTo(['appearance-backup'], appearance)}>
        Export, import or reset
      </button>
    </div>
  );
};

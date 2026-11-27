/**
 * Settings > Preferences > Motion: how a page or tab comes in, how menus and dialogs open,
 * how fast every animation runs, its easing curve, and how a button feels when pressed. Each row is a Segmented control written to <html>
 * by the appearance store; the CSS lives in app/styles/motion.css. A Preview replays the
 * chosen page transition on a sample card, and a muted line says when a reduced-motion
 * setting turns all of it off.
 */

import React, { useRef, useSyncExternalStore } from 'react';

import type { Appearance, Easing, MotionSpeed, OverlayTransition, PageTransition, PressFeedback } from '@/shared/config/theme';

import { APPEARANCE_CHOICES } from '@/shared/config/appearanceChoices';
import { AxisRow } from './ui/AppearanceRow';
import { Segmented } from './ui/Segmented';
import { replayPageTransition } from './model/replayPageTransition';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const subscribeReduced = (notify: () => void) => {
  const query = globalThis.matchMedia?.(REDUCED_QUERY);
  query?.addEventListener('change', notify);
  return () => query?.removeEventListener('change', notify);
};

const systemPrefersReduced = () => globalThis.matchMedia?.(REDUCED_QUERY).matches ?? false;

/** Whether the person's reduced-motion setting, or the OS's when they left it on System, is on. */
function useMotionReduced(motion: Appearance['motion']): boolean {
  const system = useSyncExternalStore(subscribeReduced, systemPrefersReduced, () => false);
  return motion === 'reduce' || (system && motion !== 'full');
}

/** A small card that wears the chosen page transition; Preview replays it. */
const PagePreview: React.FC = () => {
  const card = useRef<HTMLDivElement>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => replayPageTransition(card.current)}
        className="min-h-[var(--osio-control-h-md)] rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-xs font-medium text-[var(--osio-fg-default)] hover:border-[var(--osio-border-strong)]"
      >
        Preview
      </button>
      <div ref={card} data-motion-sample="" className="h-10 w-28 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2">
        <span className="block h-1.5 w-2/3 rounded-full bg-[var(--osio-border-strong)]" />
        <span className="mt-1.5 block h-1.5 w-1/2 rounded-full bg-[var(--osio-border-default)]" />
      </div>
    </div>
  );
};

/** The five motion rows, a preview of the page transition, and a note when reduced motion is on. */
export const MotionControls: React.FC<{ appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }> = ({ appearance, onChange }) => {
  const reduced = useMotionReduced(appearance.motion);
  return (
    <div data-testid="motion-controls">
      {reduced ? <p className="pb-3 text-sm text-[var(--osio-fg-muted)]">Your reduced-motion setting turns these off.</p> : null}
      <AxisRow
        anchor="motion-page"
        title="Page and tab transition"
        description="How a page or tab comes in when you switch to it."
        appearance={appearance}
        axes={['pageTransition']}
        onChange={onChange}
        stack
      >
        <div className="space-y-3">
          <Segmented<PageTransition>
            label="Page and tab transition"
            value={appearance.pageTransition}
            options={APPEARANCE_CHOICES.pageTransition.options}
            onChange={(pageTransition) => onChange({ pageTransition })}
          />
          <PagePreview />
        </div>
      </AxisRow>
      <AxisRow anchor="motion-overlay" title="Menus and dialogs" description="How popovers, menus and dialogs open." appearance={appearance} axes={['overlayTransition']} onChange={onChange}>
        <Segmented<OverlayTransition>
          label="Menus and dialogs"
          value={appearance.overlayTransition}
          options={APPEARANCE_CHOICES.overlayTransition.options}
          onChange={(overlayTransition) => onChange({ overlayTransition })}
        />
      </AxisRow>
      <AxisRow anchor="motion-speed" title="Animation speed" description="Scales every animation in the app." appearance={appearance} axes={['motionSpeed']} onChange={onChange}>
        <Segmented<MotionSpeed>
          label="Animation speed"
          value={appearance.motionSpeed}
          options={APPEARANCE_CHOICES.motionSpeed.options}
          onChange={(motionSpeed) => onChange({ motionSpeed })}
        />
      </AxisRow>
      <AxisRow anchor="motion-easing" title="Easing style" description="How movement starts and settles. Overrides the theme's own easing." appearance={appearance} axes={['easing']} onChange={onChange}>
        <Segmented<Easing>
          label="Easing style"
          value={appearance.easing}
          options={APPEARANCE_CHOICES.easing.options}
          onChange={(easing) => onChange({ easing })}
        />
      </AxisRow>
      <AxisRow anchor="motion-press" title="Button press" description="What a button does when you press it." appearance={appearance} axes={['pressFeedback']} onChange={onChange}>
        <Segmented<PressFeedback>
          label="Button press"
          value={appearance.pressFeedback}
          options={APPEARANCE_CHOICES.pressFeedback.options}
          onChange={(pressFeedback) => onChange({ pressFeedback })}
        />
      </AxisRow>
    </div>
  );
};

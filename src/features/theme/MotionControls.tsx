/**
 * Settings > Preferences > Motion: how a page or tab comes in, how menus and dialogs open,
 * and how fast every animation runs. Each row is a Segmented control written to <html>
 * by the appearance store; the CSS lives in app/styles/motion.css. A Preview replays the
 * chosen page transition on a sample card, and a muted line says when a reduced-motion
 * setting turns all of it off.
 */

import React, { useRef, useSyncExternalStore } from 'react';

import type { Appearance, MotionSpeed, OverlayTransition, PageTransition } from '@/shared/config/theme';

import { Segmented } from './AppearanceControls';
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

const PAGE_OPTIONS: { value: PageTransition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'blur', label: 'Blur' },
  { value: 'slide', label: 'Slide' },
  { value: 'scale', label: 'Scale' },
];

const OVERLAY_OPTIONS: { value: OverlayTransition; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'blur', label: 'Blur' },
  { value: 'zoom', label: 'Zoom' },
];

const SPEED_OPTIONS: { value: MotionSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'default', label: 'Default' },
  { value: 'fast', label: 'Fast' },
];

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

export const MotionControls: React.FC<{ appearance: Appearance; onChange: (patch: Partial<Appearance>) => void }> = ({ appearance, onChange }) => {
  const reduced = useMotionReduced(appearance.motion);
  return (
    <div className="space-y-4" data-testid="motion-controls">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">Motion</p>
      {reduced ? <p className="text-xs text-[var(--osio-fg-muted)]">Your reduced-motion setting turns these off.</p> : null}
      <div data-settings-anchor="motion-page" className="space-y-3">
        <Segmented<PageTransition>
          label="Page and tab transition"
          description="How a page or tab comes in when you switch to it."
          value={appearance.pageTransition}
          options={PAGE_OPTIONS}
          onChange={(pageTransition) => onChange({ pageTransition })}
        />
        <PagePreview />
      </div>
      <div data-settings-anchor="motion-overlay">
        <Segmented<OverlayTransition>
          label="Menus and dialogs"
          description="How popovers, menus and dialogs open."
          value={appearance.overlayTransition}
          options={OVERLAY_OPTIONS}
          onChange={(overlayTransition) => onChange({ overlayTransition })}
        />
      </div>
      <div data-settings-anchor="motion-speed">
        <Segmented<MotionSpeed>
          label="Animation speed"
          description="Scales every animation in the app."
          value={appearance.motionSpeed}
          options={SPEED_OPTIONS}
          onChange={(motionSpeed) => onChange({ motionSpeed })}
        />
      </div>
    </div>
  );
};

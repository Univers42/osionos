import React, { useEffect, useRef } from 'react';

import type { Appearance } from '@/shared/config/theme';
import type { ChoiceAxis } from '@/shared/config/appearanceChoices';
import { previewAppearance } from '@/shared/config/theme';
import { MiniTabs } from '@/shared/ui';

// Long enough that sweeping the pointer across a row to reach something else previews nothing.
const PREVIEW_INTENT_MS = 150;

/**
 * A segmented choice. `label` is the group's accessible name (the row's title); the visible
 * title and description live in the AppearanceRow around it. With `previewAxis`, resting a mouse
 * on an option shows it across the app until the pointer leaves the row or Escape is pressed;
 * a click keeps it. Touch and keyboard skip the preview: a tap or an arrow key already applies.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  previewAxis,
}: Readonly<{ label: string; value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; previewAxis?: ChoiceAxis }>) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previewing = useRef(false);

  const stopPreview = () => {
    clearTimeout(timer.current);
    if (!previewing.current) return;
    previewing.current = false;
    previewAppearance(null);
  };
  useEffect(() => stopPreview, []);

  const onPointerOver = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!previewAxis || event.pointerType !== 'mouse') return;
    const tab = (event.target as Element).closest('[role="tab"]');
    if (!tab) return;
    const option = options[Array.from(event.currentTarget.querySelectorAll('[role="tab"]')).indexOf(tab)];
    if (!option) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      previewing.current = true;
      previewAppearance({ [previewAxis]: option.value } as Partial<Appearance>);
    }, PREVIEW_INTENT_MS);
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full"
      onPointerOver={previewAxis ? onPointerOver : undefined}
      onPointerLeave={previewAxis ? stopPreview : undefined}
      onKeyDown={previewAxis ? (event) => { if (event.key === 'Escape') stopPreview(); } : undefined}
    >
      <MiniTabs size="sm" value={value} options={options} onChange={onChange} />
    </div>
  );
}

import React from 'react';

import { MiniTabs } from '@/shared/ui';

/**
 * A segmented choice. `label` is the group's accessible name (the row's title); the visible
 * title and description live in the AppearanceRow around it.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{ label: string; value: T; options: { value: T; label: string }[]; onChange: (next: T) => void }>) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full">
      <MiniTabs size="sm" value={value} options={options} onChange={onChange} />
    </div>
  );
}

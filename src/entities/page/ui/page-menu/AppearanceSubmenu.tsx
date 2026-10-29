import React from 'react';
import { Check } from 'lucide-react';

import { fontSampleClass } from '@/entities/page/model/usePageActions';
import type { PageMenuItem } from './types';
import { MENU_ROW_STYLE, PageMenuRow } from './PageMenuRow';

interface Props {
  items: PageMenuItem[];
}

/**
 * The right-hand "Appearance & layout" panel: the three font tiles, then the
 * small-text and full-width switches. Items arrive already wired to the page
 * config, so a search result and the panel run the same action.
 */
export const AppearanceSubmenu: React.FC<Props> = ({ items }) => {
  const fonts = items.filter((item) => item.font);
  const switches = items.filter((item) => !item.font);
  return (
    <>
      <div role="group" aria-label="Page font" className="grid grid-cols-3 gap-1 pb-1">
        {fonts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.run}
            aria-pressed={item.checked}
            data-font={item.font}
            style={MENU_ROW_STYLE}
            className={[
              'relative min-w-0 rounded-[var(--osio-radius-sm)] px-1 text-center hover:bg-[var(--osio-bg-hover)]',
              item.checked ? 'text-[var(--osio-accent)]' : 'text-[var(--osio-fg-default)]',
            ].join(' ')}
          >
            <span className={`block truncate text-xl leading-6 ${fontSampleClass(item.font!)}`}>Ag</span>
            <span className="block truncate text-xs">{item.label}</span>
            {item.checked && <Check size={11} className="absolute right-0.5 top-0.5" />}
          </button>
        ))}
      </div>
      <div className="osio-menu-separator" />
      {switches.map((item) => <PageMenuRow key={item.id} item={item} />)}
    </>
  );
};

import React from 'react';
import { Check } from 'lucide-react';

import { fontSampleStyle } from '@/entities/page/model/usePageActions';
import type { PageMenuItem } from './types';
import { MENU_ROW_STYLE } from './PageMenuRow';

interface Props {
  id: string;
  items: PageMenuItem[];
}

export const MoreFontsList: React.FC<Props> = ({ id, items }) => (
  <div id={id} role="group" aria-label="More fonts" className="grid grid-cols-2 gap-1 pb-1">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={item.run}
        aria-pressed={item.checked}
        data-font={item.font}
        style={MENU_ROW_STYLE}
        className="osio-menu-item"
      >
        <span className="min-w-0 flex-1 truncate text-left" style={fontSampleStyle(item.font!)}>{item.label}</span>
        {item.checked && <Check size={14} className="shrink-0 text-[var(--osio-accent)]" />}
      </button>
    ))}
  </div>
);

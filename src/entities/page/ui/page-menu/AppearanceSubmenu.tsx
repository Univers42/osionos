import React, { useId, useState } from 'react';
import { Check } from 'lucide-react';

import { fontSampleClass } from '@/entities/page/model/usePageActions';
import { extraPageFont, type PageFontFace } from '@/shared/config/pageFontCatalog';
import type { PageMenuItem } from './types';
import { MENU_ROW_STYLE, PageMenuRow } from './PageMenuRow';
import { MoreFontsList } from './MoreFontsList';

interface Props {
  items: PageMenuItem[];
}

const tileClass = (checked: boolean) => [
  'relative min-w-0 rounded-[var(--osio-radius-sm)] px-1 text-center hover:bg-[var(--osio-bg-hover)]',
  checked ? 'text-[var(--osio-accent)]' : 'text-[var(--osio-fg-default)]',
].join(' ');

const FontTile: React.FC<{ item: PageMenuItem }> = ({ item }) => (
  <button
    type="button"
    onClick={item.run}
    aria-pressed={item.checked}
    data-font={item.font}
    style={MENU_ROW_STYLE}
    className={tileClass(Boolean(item.checked))}
  >
    <span className={`block truncate text-xl leading-6 ${fontSampleClass(item.font!)}`}>Ag</span>
    <span className="block truncate text-xs">{item.label}</span>
    {item.checked && <Check size={11} className="absolute right-0.5 top-0.5" />}
  </button>
);

interface MoreFontTileProps {
  font?: PageFontFace;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}

const MoreFontTile: React.FC<MoreFontTileProps> = ({ font, expanded, controls, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label="More fonts"
    aria-expanded={expanded}
    aria-controls={controls}
    aria-pressed={Boolean(font)}
    data-font={font?.id}
    style={MENU_ROW_STYLE}
    className={tileClass(Boolean(font))}
  >
    <span className="block truncate text-xl leading-6">+</span>
    <span className="block truncate text-xs">{font?.label ?? 'More fonts'}</span>
    {font && <Check size={11} className="absolute right-0.5 top-0.5" />}
  </button>
);

/** Font samples first; the extra faces stay unmounted until More fonts is opened. */
export const AppearanceSubmenu: React.FC<Props> = ({ items }) => {
  const [expanded, setExpanded] = useState(false);
  const controls = useId();
  const fonts = items.filter((item) => item.font);
  const standardFonts = fonts.filter((item) => !extraPageFont(item.font));
  const extraFonts = fonts.filter((item) => extraPageFont(item.font));
  const currentExtra = extraPageFont(fonts.find((item) => item.checked)?.font);

  return (
    <>
      <div role="group" aria-label="Page font" className="grid grid-cols-4 gap-1 pb-1">
        {standardFonts.map((item) => <FontTile key={item.id} item={item} />)}
        <MoreFontTile font={currentExtra} expanded={expanded} controls={controls} onToggle={() => setExpanded((value) => !value)} />
      </div>
      {expanded && <MoreFontsList id={controls} items={extraFonts} />}
      <div className="osio-menu-separator" />
      {switches(items).map((item) => <PageMenuRow key={item.id} item={item} />)}
    </>
  );
};

function switches(items: PageMenuItem[]): PageMenuItem[] {
  return items.filter((item) => !item.font);
}

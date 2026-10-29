import React from 'react';
import { Bug, Languages } from 'lucide-react';

import { TRANSLATION_LANGUAGES } from '@/entities/page/model/usePageActions';
import { Dropdown } from '@/shared/ui';
import { PageMenuRow } from './PageMenuRow';
import type { PageMenuItem } from './types';

interface Props {
  items: PageMenuItem[];
  translateLocale: string;
  onTranslateLocale: (locale: string) => void;
  onApplyTranslate: () => void;
}

/** The "More" section: everything the page menu kept from before, plus the
 *  language picker and the debug tools (which stay open to flip several). */
export const MoreGroup: React.FC<Props> = ({ items, translateLocale, onTranslateLocale, onApplyTranslate }) => (
  <>
    {items.map((item, index) => {
      if (item.id.startsWith('debug-') && !items[index - 1]?.id.startsWith('debug-')) {
        return (
          <React.Fragment key="debug-tools">
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">
              <Bug size={11} className="shrink-0" />
              Tools
            </div>
            <PageMenuRow item={item} />
          </React.Fragment>
        );
      }
      if (item.id === 'translate') {
        return (
          <div key={item.id} className="flex min-h-[var(--osio-control-h-md)] items-center gap-2 rounded-[var(--osio-radius-sm)] px-2 py-1 text-sm hover:bg-[var(--osio-menu-item-hover-bg)]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--osio-fg-muted)]"><Languages size={16} /></span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <Dropdown
              variant="inline"
              width={176}
              label="Translation language"
              value={translateLocale}
              options={TRANSLATION_LANGUAGES.map((language) => ({ value: language.locale, label: language.label }))}
              onChange={onTranslateLocale}
            />
            <button type="button" className="rounded-[var(--osio-radius-sm)] bg-[var(--osio-accent)] px-2 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90" onClick={onApplyTranslate}>Apply</button>
          </div>
        );
      }
      return <PageMenuRow key={item.id} item={item} />;
    })}
  </>
);

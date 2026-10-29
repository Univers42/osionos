import React, { useState } from 'react';
import { Languages } from 'lucide-react';

import { TRANSLATION_LANGUAGES, translationLabel } from '@/entities/page/model/usePageActions';
import { MenuSubmenu } from '@/shared/ui';
import { PageMenuRow } from './PageMenuRow';
import type { PageMenuItem } from './types';

interface Props {
  items: PageMenuItem[];
  translateLocale: string;
  onTranslate: (locale: string) => void;
}

/** The "More" side panel. Translate opens one level deeper: picking a
 *  language translates at once, the current one is checked. */
export const MoreGroup: React.FC<Props> = ({ items, translateLocale, onTranslate }) => {
  const [languagesOpen, setLanguagesOpen] = useState(false);
  return (
    <>
      {items.map((item) => item.id === 'translate' ? (
        <MenuSubmenu
          key={item.id}
          label={item.label}
          icon={<Languages size={16} />}
          hint={translationLabel(translateLocale)}
          testId="page-menu-translate"
          open={languagesOpen}
          onOpenChange={setLanguagesOpen}
        >
          {TRANSLATION_LANGUAGES.map((language) => (
            <PageMenuRow
              key={language.locale}
              item={{
                id: `translate-${language.locale}`,
                label: language.label,
                icon: <span aria-hidden className="text-2xs font-medium uppercase">{language.locale}</span>,
                checked: language.locale === translateLocale,
                run: () => onTranslate(language.locale),
              }}
            />
          ))}
        </MenuSubmenu>
      ) : <PageMenuRow key={item.id} item={item} />)}
    </>
  );
};

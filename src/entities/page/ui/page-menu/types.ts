import type { ReactNode } from 'react';
import type { PageFont } from '@/shared/config/pageConfigStore';

/** One row of the page "…" menu. `run` is the only side effect; the menu
 *  decides whether to close after it (`keepOpen`). */
export interface PageMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  shortcut?: string;
  badge?: string;
  checked?: boolean;
  /** Show `checked` as an on/off switch on the right (Notion's Small text / Full width). */
  toggle?: boolean;
  danger?: boolean;
  /** Render the label as a font sample tile instead of a row. */
  font?: PageFont;
  keepOpen?: boolean;
  testId?: string;
  run: () => void;
}

/** A group of rows, optionally behind a side submenu (Appearance & layout). */
export interface PageMenuSection {
  id: string;
  label?: string;
  items: PageMenuItem[];
  submenu?: {
    label: string;
    icon: ReactNode;
    testId?: string;
    items: PageMenuItem[];
  };
}

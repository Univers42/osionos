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

/** A group of rows, optionally behind a side submenu (Appearance & layout, More, Developer tools). */
export interface PageMenuSection {
  id: string;
  label?: string;
  /** Same group as the section above: no separator between them. */
  continues?: boolean;
  items: PageMenuItem[];
  submenu?: {
    label: string;
    icon: ReactNode;
    /** Right-aligned state on the row, e.g. how many tools are on. */
    hint?: string;
    testId?: string;
    items: PageMenuItem[];
  };
}

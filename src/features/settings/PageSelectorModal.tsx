import React from 'react';

import type { PageEntry } from '@/entities/page';
import { Button, Modal } from '@/shared/ui';

// The two class sets are mutually exclusive on purpose: two utilities for one
// property on an element are settled by stylesheet order, not class order.
const CHOICE_BASE = 'osio-control flex w-full items-center justify-start gap-1.5 border px-3 text-left text-sm font-medium';
const CHOICE_SELECTED = 'border-[var(--osio-accent)] bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]';
const CHOICE_IDLE = 'border-[var(--osio-control-border)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)]';

export const PageSelectorModal: React.FC<{ pages: PageEntry[]; selectedId: string | null; onSelect: (pageId: string | null) => void; onClose: () => void }> = ({ pages, selectedId, onSelect, onClose }) => (
  <Modal open onClose={onClose} title="Select landing page" size="md">
    <div className="space-y-2">
      <Button className="w-full justify-start" onClick={() => onSelect(null)}>No landing page</Button>
      {pages.slice(0, 20).map((page) => {
        const selected = selectedId === page._id;
        return (
          <button key={page._id} type="button" aria-pressed={selected} className={`${CHOICE_BASE} ${selected ? CHOICE_SELECTED : CHOICE_IDLE}`} onClick={() => onSelect(page._id)}>
            {page.icon ?? '📄'} {page.title || 'Untitled'}
          </button>
        );
      })}
    </div>
  </Modal>
);

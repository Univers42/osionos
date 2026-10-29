import React from 'react';
import { Check } from 'lucide-react';

import { IconValueView } from '@osionos/ui/atoms/IconValueView';
import { COLLECTION_ROLE_BADGES } from '@/shared/ui/assets/collectionEmoji';

/** The fields the account list renders; the store's persona carries more. */
export interface PersonaRow {
  id?: string;
  name: string;
  email: string;
  emoji: string;
  roleBadge: string;
}

interface Props {
  personas: readonly PersonaRow[];
  sessions: Record<string, unknown>;
  activeId: string | null;
  selectedAccountId: string | null;
  onSelect: (id: string | undefined) => void;
  onLogout: (id: string) => void;
}

/** The account list at the bottom of the workspace menu. Selecting a persona
 *  switches the active user; the selected row also offers a full logout. */
export const PersonaSection: React.FC<Props> = ({ personas, sessions, activeId, selectedAccountId, onSelect, onLogout }) => (
  <div>
    {personas.map(p => {
      const session  = sessions[p.id ?? ''];
      const isLoggedIn = Boolean(session);
      const isActive = p.id === activeId;
      const isSelected = p.id === selectedAccountId;

      return (
        <div
          key={p.email}
          className={[
            'w-full flex items-center gap-3 rounded-[var(--osio-radius-sm)] px-2 py-2 text-left',
            'transition-colors duration-(--osio-dur-fast)',
            isLoggedIn ? '' : 'opacity-60',
            isActive
              ? 'bg-[var(--osio-bg-muted)]'
              : 'hover:bg-[var(--osio-menu-item-hover-bg)]',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => onSelect(p.id)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <IconValueView value={p.emoji} size={20} />

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="truncate text-sm font-medium text-[var(--osio-fg-default)]">
                  {p.name}
                </span>
                <span className="shrink-0">
                  <IconValueView
                    value={
                      COLLECTION_ROLE_BADGES[p.roleBadge.toLowerCase()] ??
                      COLLECTION_ROLE_BADGES.guest
                    }
                    size={12}
                  />
                </span>
              </span>
              <span className="block truncate text-xs text-[var(--osio-fg-muted)]">
                {p.email}
              </span>
            </span>

            {isActive && (
              <Check size={16} className="shrink-0 text-[var(--osio-accent)]" />
            )}
          </button>

          {isSelected && p.id && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLogout(p.id as string);
              }}
              title="Sign out of all devices"
              className="ml-auto h-[var(--osio-control-h-xs)] shrink-0 rounded-[var(--osio-radius-sm)] px-1.5 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-danger-subtle-bg-hover)]"
            >
              Log out
            </button>
          )}
        </div>
      );
    })}
  </div>
);

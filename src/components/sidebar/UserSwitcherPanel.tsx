/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UserSwitcherPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 22:31:03 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useEffect } from 'react';
import { Check, Crown, Brush, Eye } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';

interface Props {
  onClose: () => void;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  admin:        <Crown  size={12} className="text-amber-400"  />,
  collaborator: <Brush  size={12} className="text-blue-400"   />,
  guest:        <Eye    size={12} className="text-emerald-400"/>,
};

/**
 * Floating dropdown that lists all 3 pre-logged-in personas.
 * Click a row → switch active user.
 */
export const UserSwitcherPanel: React.FC<Props> = ({ onClose }) => {
  const ref     = useRef<HTMLDivElement>(null);
  const personas = useUserStore(s => s.personas);
  const sessions = useUserStore(s => s.sessions);
  const activeId = useUserStore(s => s.activeUserId);
  const switchUser = useUserStore(s => s.switchUser);

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={[
        'absolute top-full left-0 z-50 mt-1 w-64',
        'bg-[var(--color-surface-primary)] border border-[var(--color-line)]',
        'rounded-xl shadow-xl overflow-hidden py-1',
      ].join(' ')}
    >
      <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
        Switch account
      </p>

      {personas.map(p => {
        const session  = sessions[p.id ?? ''];
        const _loggedIn = Boolean(session?.accessToken);
        const isActive = p.id === activeId;

        return (
          <button
            key={p.email}
            type="button"
            onClick={() => { if (p.id) { switchUser(p.id); } onClose(); }}
            className={[
              'w-full flex items-center gap-3 px-3 py-2 text-left',
              'transition-colors duration-100 cursor-pointer',
              isActive
                ? 'bg-[var(--color-surface-tertiary)]'
                : 'hover:bg-[var(--color-surface-hover)]',
            ].join(' ')}
          >
            {/* Avatar emoji */}
            <span className="text-xl leading-none">{p.emoji}</span>

            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1">
                <span className="text-sm font-medium text-[var(--color-ink)] truncate">
                  {p.name}
                </span>
                <span className="shrink-0">{ROLE_ICONS[p.roleBadge] ?? null}</span>
              </span>
              <span className="block text-xs text-[var(--color-ink-muted)] truncate">
                {p.email}
              </span>
            </span>

            {isActive && (
              <Check size={16} className="shrink-0 text-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
};

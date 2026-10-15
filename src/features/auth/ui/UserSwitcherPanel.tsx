/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UserSwitcherPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 05:35:15 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, Plus, Settings, Users } from 'lucide-react';
import { Button, IconButton } from '@/shared/ui';
import { IconValueView } from '@osionos/ui/atoms/IconValueView';
import { useWorkspaceConfigStore, workspaceConfigKey } from '@/shared/config/workspaceConfigStore';
import { useUserStore } from '@/features/auth';
import { useWorkspaceOnboarding } from '@/features/workspace-onboarding/model/useWorkspaceOnboarding';
import {
  COLLECTION_ROLE_BADGES,
} from '@/shared/ui/assets/collectionEmoji';
import { LazySettingsCenter } from '@/features/settings/LazySettingsCenter';
import { AuthDialog } from './AuthDialog';

interface Props {
  onClose: () => void;
  anchorElement?: HTMLElement | null;
}

// SettingsPanel removed — use `SettingsCenter` component instead.

/**
 * Floating dropdown that lists all 3 pre-logged-in personas.
 * Click a row → switch active user.
 */
export const UserSwitcherPanel: React.FC<Props> = ({ onClose, anchorElement }) => {
  const ref     = useRef<HTMLDivElement>(null);
  const personas = useUserStore(s => s.personas);
  const sessions = useUserStore(s => s.sessions);
  const activeId = useUserStore(s => s.activeUserId);
  const switchUser = useUserStore(s => s.switchUser);
  const switchWorkspace = useUserStore(s => s.switchWorkspace);
  const workspaceConfigs = useWorkspaceConfigStore(s => s.configs);
  const logoutUser = useUserStore(s => s.logoutUser);
  const activePersona = useUserStore(s => s.activePersona());
  const activeSession = useUserStore(s => s.activeSession());
  const selectedWorkspace = useUserStore(s => s.activeWorkspace());
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'settings' | 'people' | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 48, left: 8 });

  // Track whether a modal is open to prevent outside-click from closing the panel
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = authOpen || settingsTab !== null;
  }, [authOpen, settingsTab]);

  const workspaces = useMemo(
    () => activeSession ? [...activeSession.privateWorkspaces, ...activeSession.sharedWorkspaces] : [],
    [activeSession],
  );
  const activeWorkspace = selectedWorkspace ?? workspaces[0];

  useEffect(() => {
    function updatePosition() {
      if (!anchorElement) return;
      const rect = anchorElement.getBoundingClientRect();
      const width = 300;
      const margin = 8;
      const next = {
        top: Math.min(rect.bottom + 4, globalThis.innerHeight - margin),
        left: Math.min(Math.max(rect.left, margin), globalThis.innerWidth - width - margin),
      };
      setPosition((current) => {
        if (current.top === next.top && current.left === next.left) return current;
        return next;
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorElement]);

  // Close on outside click — skip when a sub-modal is open
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (modalOpenRef.current) return;
      if (anchorElement?.contains(e.target as Node)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose, anchorElement]);

  // Close on Escape (but only close sub-modal first if one is open)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (authOpen) { setAuthOpen(false); return; }
      if (settingsTab) { setSettingsTab(null); return; }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, authOpen, settingsTab]);

  function handleNewWorkspace() {
    onClose();
    useWorkspaceOnboarding.getState().setOpen(true);
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.top,
    left: position.left,
  };

  const panel = (
    <>
      <div
        ref={ref}
        style={panelStyle}
        className={[
          'osio-surface-overlay z-[var(--osio-z-popover)] w-[300px]',
          'max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden',
        ].join(' ')}
      >
      <header className="rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-subtle)] p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--osio-bg-muted)]">
            <IconValueView value={activePersona?.emoji ?? '🌏'} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--osio-fg-default)]">
              {activeWorkspace?.name ?? 'Workspace'}
            </p>
            <p className="truncate text-xs text-[var(--osio-fg-muted)]">
              {(activeWorkspace?.settings?.plan as string | undefined) ?? 'Playground'} · {personas.length} member{personas.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setSettingsTab('settings')}>
            <Settings size={12} aria-hidden /> Settings
          </Button>
          <Button size="sm" className="flex-1" onClick={() => setSettingsTab('people')}>
            <Users size={12} aria-hidden /> People
          </Button>
        </div>
      </header>

      <div className="osio-menu-separator" />
      <div>
        <div className="osio-menu-label flex items-center justify-between">
          <span className="truncate">{activePersona?.email ?? 'No account selected'}</span>
          <IconButton label="Account settings" size="xs">
            <MoreHorizontal size={16} />
          </IconButton>
        </div>

        {workspaces.map((workspace) => {
          // Icon precedence: durable per-workspace config (Settings → Workspace →
          // Icon, persisted) → session record → initial-letter fallback.
          const icon = workspaceConfigs[workspaceConfigKey(activeId ?? '', workspace._id)]?.icon ?? workspace.icon;
          return (
          <button
            key={workspace._id}
            type="button"
            onClick={() => switchWorkspace(workspace._id)}
            className="osio-menu-item"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-xs bg-[var(--osio-bg-muted)] text-xs">
              {icon
                ? <IconValueView value={icon} size={14} />
                : (workspace.name[0] ?? 'W').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {workspace._id === activeWorkspace?._id && <Check size={14} className="text-[var(--osio-accent)]" />}
          </button>
          );
        })}
        <button
          type="button"
          onClick={handleNewWorkspace}
          data-tone="accent"
          className="osio-menu-item"
        >
          <Plus size={16} /> New workspace
        </button>
      </div>

      <div className="osio-menu-separator" />
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
                onClick={() => {
                  setSelectedAccountId(p.id);
                  if (p.id) switchUser(p.id);
                }}
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
                    logoutUser(p.id);
                  }}
                  className="ml-auto h-[var(--osio-control-h-xs)] shrink-0 rounded-[var(--osio-radius-sm)] px-1.5 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-danger-subtle-bg-hover)]"
                >
                  Log out
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="osio-menu-separator" />
      <footer>
        <button type="button" onClick={() => setAuthOpen(true)} data-tone="muted" className="osio-menu-item">
          Add another account
        </button>
        <button type="button" onClick={() => activeId && logoutUser(activeId)} data-tone="muted" className="osio-menu-item">
          Log out
        </button>
      </footer>
      </div>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {settingsTab && <LazySettingsCenter initialTab={settingsTab === 'people' ? 'people' : 'general'} onClose={() => setSettingsTab(null)} />}
    </>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
};

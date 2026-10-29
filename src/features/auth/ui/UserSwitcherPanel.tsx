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
import { Button, IconButton, useToastStore } from '@/shared/ui';
import { IconValueView } from '@osionos/ui/atoms/IconValueView';
import { useWorkspaceConfigStore, workspaceConfigKey } from '@/shared/config/workspaceConfigStore';
import { useUserStore } from '@/features/auth';
import { useWorkspaceInvitesStore } from '@/store/settings';
import { inviteErrorSentence } from '@/features/settings/people/inviteInboxModel';
import { enterJoinedWorkspace } from '@/features/settings/people/enterJoinedWorkspace';
import { useWorkspaceOnboarding } from '@/features/workspace-onboarding/model/useWorkspaceOnboarding';
import { openSettings } from '@/features/settings/model/settingsNav';
import { AuthDialog } from './AuthDialog';
import { PendingInvitesSection } from './workspace-menu/PendingInvitesSection';
import { PersonaSection } from './workspace-menu/PersonaSection';

interface Props {
  onClose: () => void;
  anchorElement?: HTMLElement | null;
}

// SettingsPanel removed — use the settings tab view (`ui/SettingsView.tsx`) instead.

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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 48, left: 8 });
  const mine = useWorkspaceInvitesStore((state) => state.mine);
  const mineLoading = useWorkspaceInvitesStore((state) => state.mineLoading);
  const mineError = useWorkspaceInvitesStore((state) => state.mineError);
  const mineUnavailable = useWorkspaceInvitesStore((state) => state.mineUnavailable);
  const fetchMine = useWorkspaceInvitesStore((state) => state.fetchMine);
  const acceptById = useWorkspaceInvitesStore((state) => state.acceptById);
  const declineInvite = useWorkspaceInvitesStore((state) => state.decline);
  const refreshWorkspaces = useUserStore((s) => s.refreshWorkspaces);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  // Track whether a modal is open to prevent outside-click from closing the panel
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = authOpen;
  }, [authOpen]);

  const workspaces = useMemo(
    () => activeSession ? [...activeSession.privateWorkspaces, ...activeSession.sharedWorkspaces] : [],
    [activeSession],
  );
  const activeWorkspace = selectedWorkspace ?? workspaces[0];
  const workspaceIcon = workspaceConfigs[workspaceConfigKey(activeId ?? '', activeWorkspace?._id ?? '')]?.icon ?? activeWorkspace?.icon;

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

  // Close on Escape (but only close the sub-modal first if one is open)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (useWorkspaceInvitesStore.getState().openedInviteId) return;
      if (authOpen) { setAuthOpen(false); return; }
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, authOpen]);

  function handleNewWorkspace() {
    onClose();
    useWorkspaceOnboarding.getState().setOpen(true);
  }

  async function joinInvite(invite: (typeof mine)[number]) {
    if (busyInviteId) return;
    setBusyInviteId(invite.id);
    const result = await acceptById(invite.id);
    setBusyInviteId(null);
    if (!result.ok) {
      useToastStore.getState().push({ kind: "error", title: inviteErrorSentence(result.code) });
      return;
    }
    useToastStore.getState().push({ kind: "success", title: "You joined the workspace" });
    await enterJoinedWorkspace(result.workspaceId, {
      refreshWorkspaces: () => refreshWorkspaces(activeId ?? ""),
      switchWorkspace,
    });
    onClose();
  }

  async function declinePending(invite: (typeof mine)[number]) {
    if (busyInviteId) return;
    setBusyInviteId(invite.id);
    const declined = await declineInvite(invite.id);
    setBusyInviteId(null);
    if (!declined) {
      useToastStore.getState().push({ kind: "error", title: inviteErrorSentence("unknown") });
      return;
    }
    useToastStore.getState().push({ kind: "success", title: "Invite declined" });
  }

  const showPendingInvites = !mineUnavailable && (mine.length > 0 || mineLoading || Boolean(mineError));

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
        data-testid="workspace-menu"
        className={[
          'osio-surface-overlay z-[var(--osio-z-popover)] w-[300px]',
          'max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden',
        ].join(' ')}
      >
      <header className="rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-subtle)] p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--osio-radius-sm)] bg-[var(--osio-bg-muted)]">
            {workspaceIcon
              ? <IconValueView value={workspaceIcon} size={24} />
              : <span className="text-sm font-semibold text-[var(--osio-fg-default)]">{(activeWorkspace?.name?.[0] ?? 'W').toUpperCase()}</span>}
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
          <Button size="sm" className="flex-1 whitespace-nowrap" onClick={() => { openSettings('general'); onClose(); }}>
            <Settings size={12} aria-hidden /> Settings
          </Button>
          <Button size="sm" className="flex-1 whitespace-nowrap" onClick={() => { openSettings('people'); onClose(); }}>
            <Users size={12} aria-hidden /> Invite members
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
            onClick={() => { switchWorkspace(workspace._id); onClose(); }}
            className="osio-menu-item"
            style={{ height: 'var(--osio-control-h-md)' }}
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

      {showPendingInvites && (
        <>
          <div className="osio-menu-separator" />
          <PendingInvitesSection
            mine={mine}
            mineLoading={mineLoading}
            mineError={mineError}
            busyInviteId={busyInviteId}
            onRetry={() => void fetchMine()}
            onJoin={(invite) => void joinInvite(invite)}
            onDecline={(invite) => void declinePending(invite)}
          />
        </>
      )}

      <div className="osio-menu-separator" />
      <PersonaSection
        personas={personas}
        sessions={sessions}
        activeId={activeId}
        selectedAccountId={selectedAccountId}
        onSelect={(id) => {
          setSelectedAccountId(id ?? null);
          if (id) switchUser(id);
        }}
        onLogout={(id) => void logoutUser(id)}
      />

      <div className="osio-menu-separator" />
      <footer>
        <button type="button" onClick={() => setAuthOpen(true)} data-tone="muted" className="osio-menu-item">
          Add another account
        </button>
        <button type="button" onClick={() => { if (activeId) void logoutUser(activeId); }} data-tone="muted" className="osio-menu-item">
          Sign out of all devices
        </button>
      </footer>
      </div>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
};

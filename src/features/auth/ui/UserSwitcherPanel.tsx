/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UserSwitcherPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/05 15:08:41 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, Plus, Settings, Users, X } from 'lucide-react';
import { AssetRenderer } from '@univers42/ui-collection';
import { useUserStore } from '@/features/auth';
import {
  COLLECTION_ROLE_BADGES,
} from '@/shared/lib/markengine/uiCollectionAssets';
import { SettingsCenter } from '@/features/settings/SettingsCenter';

interface Props {
  onClose: () => void;
  anchorElement?: HTMLElement | null;
}

interface AuthDialogProps {
  onClose: () => void;
}

const AuthDialog: React.FC<AuthDialogProps> = ({ onClose }) => {
  const loginWithCredentials = useUserStore((s) => s.loginWithCredentials);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [persistInSessions, setPersistInSessions] = useState(true);
  const [busy, setBusy] = useState(false);
  let submitLabel = 'Créer le compte';
  if (busy) {
    submitLabel = 'Validation…';
  } else if (mode === 'login') {
    submitLabel = 'Connexion';
  }

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    await loginWithCredentials(email, password, persistInSessions, mode, name);
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-backdrop)] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-ink)]">
              {mode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Les comptes persistés restent dans les sessions actives.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--color-surface-hover)]">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 rounded-md bg-[var(--color-surface-secondary)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded px-2 py-1 ${mode === 'login' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}
          >
            Se connecter
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`rounded px-2 py-1 ${mode === 'signup' ? 'bg-[var(--color-surface-primary)] shadow-sm' : ''}`}
          >
            Créer
          </button>
        </div>

        {mode === 'signup' && (
          <label className="mb-3 block text-xs font-medium text-[var(--color-ink-muted)]">
            <span>Nom</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              placeholder="Nom affiché"
            />
          </label>
        )}

        <label className="mb-3 block text-xs font-medium text-[var(--color-ink-muted)]">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            placeholder="name@example.com"
            required
          />
        </label>

        <label className="mb-3 block text-xs font-medium text-[var(--color-ink-muted)]">
          <span>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            required
          />
        </label>

        <label className="mb-4 flex items-start gap-2 text-xs text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={persistInSessions}
            onChange={(event) => setPersistInSessions(event.target.checked)}
            className="mt-0.5"
          />
          <span>Garder cet utilisateur enregistré dans les sessions actives.</span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
};

// SettingsPanel removed — use `SettingsCenter` component instead.

function toWorkspaceSlug(value: string): string {
  let slug = "";
  let previousWasSeparator = true;

  for (const char of value.toLowerCase()) {
    const isAlphaNumeric =
      (char >= "a" && char <= "z") || (char >= "0" && char <= "9");

    if (isAlphaNumeric) {
      slug += char;
      previousWasSeparator = false;
    } else if (!previousWasSeparator) {
      slug += "-";
      previousWasSeparator = true;
    }
  }

  return slug.endsWith("-") ? slug.slice(0, -1) : slug || "workspace";
}

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
  const logoutUser = useUserStore(s => s.logoutUser);
  const createWorkspace = useUserStore(s => s.createWorkspace);
  const activePersona = useUserStore(s => s.activePersona());
  const activeSession = useUserStore(s => s.activeSession());
  const selectedWorkspace = useUserStore(s => s.activeWorkspace());
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'settings' | 'people' | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newSidebarEnabled, setNewSidebarEnabled] = useState(true);
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

  async function handleNewWorkspace() {
    if (!activePersona) return;
    const name = `${activePersona.name}'s workspace`;
    const slug = toWorkspaceSlug(name);
    await createWorkspace(name, slug);
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
          'z-50 w-[300px]',
          'bg-[var(--color-surface-primary)] border border-[var(--color-line)]',
          'rounded-xl shadow-xl',
          'max-h-[calc(100vh-80px)] overflow-y-auto overflow-x-hidden',
        ].join(' ')}
      >
      <header className="bg-[var(--color-surface-secondary)] p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-surface-tertiary)]">
            <AssetRenderer value={activePersona?.emoji ?? '🌏'} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {activeWorkspace?.name ?? 'Workspace'}
            </p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">
              {(activeWorkspace?.settings?.plan as string | undefined) ?? 'Playground'} · {personas.length} member{personas.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSettingsTab('settings')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-[var(--color-surface-hover)]"
          >
            <Settings size={13} /> Settings
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('people')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-line)] px-2 py-1 text-xs hover:bg-[var(--color-surface-hover)]"
          >
            <Users size={13} /> People
          </button>
        </div>
      </header>

      <div className="border-t border-[var(--color-line)] py-2">
        <div className="mb-1 flex items-center justify-between px-3 text-xs font-medium text-[var(--color-ink-muted)]">
          <span className="truncate">{activePersona?.email ?? 'No account selected'}</span>
          <button type="button" className="rounded p-1 hover:bg-[var(--color-surface-hover)]" aria-label="Account settings">
            <MoreHorizontal size={16} />
          </button>
        </div>

        {workspaces.map((workspace) => (
          <button
            key={workspace._id}
            type="button"
            onClick={() => switchWorkspace(workspace._id)}
            className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-[var(--color-surface-hover)]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-surface-tertiary)] text-xs">
              {(workspace.name[0] ?? 'W').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            {workspace._id === activeWorkspace?._id && <Check size={14} className="text-[var(--color-accent)]" />}
          </button>
        ))}
        <button
          type="button"
          onClick={handleNewWorkspace}
          className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
        >
          <Plus size={16} /> New workspace
        </button>
      </div>

      <div className="border-t border-[var(--color-line)] py-2">
        {personas.map(p => {
          const session  = sessions[p.id ?? ''];
          const isLoggedIn = Boolean(session);
          const isActive = p.id === activeId;
          const isSelected = p.id === selectedAccountId;

          return (
            <div
              key={p.email}
              className={[
                'w-full flex items-center gap-3 px-3 py-2 text-left',
                'transition-colors duration-100',
                isLoggedIn ? '' : 'opacity-60',
                isActive
                  ? 'bg-[var(--color-surface-tertiary)]'
                  : 'hover:bg-[var(--color-surface-hover)]',
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
                <AssetRenderer value={p.emoji} size={20} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium text-[var(--color-ink)]">
                      {p.name}
                    </span>
                    <span className="shrink-0">
                      <AssetRenderer
                        value={
                          COLLECTION_ROLE_BADGES[p.roleBadge.toLowerCase()] ??
                          COLLECTION_ROLE_BADGES.guest
                        }
                        size={12}
                      />
                    </span>
                  </span>
                  <span className="block truncate text-xs text-[var(--color-ink-muted)]">
                    {p.email}
                  </span>
                </span>

                {isActive && (
                  <Check size={16} className="shrink-0 text-[var(--color-accent)]" />
                )}
              </button>

              {isSelected && p.id && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    logoutUser(p.id);
                  }}
                  className="ml-auto shrink-0 text-xs font-medium text-[var(--color-text-danger)]"
                >
                  Log out
                </button>
              )}
            </div>
          );
        })}
      </div>

      <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 text-sm font-medium">
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="flex h-8 w-full items-center px-2 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          Add another account
        </button>
        <button
          type="button"
          onClick={() => activeId && logoutUser(activeId)}
          className="flex h-8 w-full items-center px-2 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          Log out
        </button>
        <button
          type="button"
          onClick={() => setNewSidebarEnabled((value) => !value)}
          className="mt-1 flex w-full items-center gap-3 rounded-md border border-[var(--color-line)] p-2 text-left hover:bg-[var(--color-surface-hover)]"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[var(--color-ink)]">
              <span>Try the new sidebar</span>
              <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">New</span>
            </span>
            <span className="block text-xs font-normal text-[var(--color-ink-muted)]">
              Keep your pages, meetings, and AI within reach.
            </span>
          </span>
          <span className={`relative h-4 w-7 rounded-full ${newSidebarEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-tertiary)]'}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${newSidebarEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </span>
        </button>
      </footer>
      </div>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {settingsTab && <SettingsCenter initialTab={settingsTab === 'people' ? 'people' : 'general'} onClose={() => setSettingsTab(null)} />}
    </>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
};

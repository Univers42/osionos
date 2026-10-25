/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfileSecurityModals.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { changeUsername } from '@/shared/api/accountSecurityApi';
import { Button, Modal, useToastStore } from '@/shared/ui';
import { useAccountProfileStore } from '@/store/settings';
import { useSudoPromptStore } from '../ui/sudo/sudoPromptModel';
import { DataTable } from '../ui/settingsKit';
import { accountActionNotice, runAccountAction, runAsync } from '../model/settingsCalls';

export { EmailManagerModal } from './EmailManagerModal';

// The bridge's rule (P1-1): 3-32 characters, a letter, digit or underscore first.
export const USERNAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/;

const USERNAME_PROBLEMS: Record<string, string> = {
  username_unavailable: 'That name is not available.',
  invalid_username: 'Use 3 to 32 letters, digits, dots, dashes or underscores.',
};

export const UsernameModal: React.FC<{ current: string; onClose: () => void }> = ({ current, onClose }) => {
  const hydrateProfile = useAccountProfileStore((state) => state.hydrate);
  const grants = useSudoPromptStore((state) => state.grants);
  const toast = useToastStore((state) => state.push);
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [needsSudo, setNeedsSudo] = useState(false);
  const [grantsAtRefusal, setGrantsAtRefusal] = useState(grants);
  const shapeOk = USERNAME_SHAPE.test(draft);
  // "Try again" is offered once the prompt granted sudo; nothing re-sends by itself.
  const canRetry = !needsSudo || grants > grantsAtRefusal;

  async function submit() {
    setBusy(true);
    setProblem('');
    const outcome = await changeUsername(draft);
    setBusy(false);
    if (outcome.ok) {
      await hydrateProfile();
      toast({ kind: 'success', title: 'Username changed' });
      onClose();
      return;
    }
    if (outcome.reason === 'sudo_required') {
      setNeedsSudo(true);
      setGrantsAtRefusal(grants);
      setProblem("Confirm it's you first, then press Try again.");
      return;
    }
    setNeedsSudo(false);
    if (outcome.reason === 'unavailable') setProblem("Changing the username isn't available on this server yet.");
    else if (outcome.reason === 'rate_limited') setProblem('You changed your username too often. Try again later.');
    else if (outcome.reason === 'refused' || outcome.reason === 'failed') setProblem(USERNAME_PROBLEMS[outcome.code] ?? outcome.message);
  }

  return (
    <Modal open onClose={onClose} title="Change username" size="sm">
      <div className="space-y-3 p-6">
        <div className="space-y-1">
          <label htmlFor="account-username-input" className="block text-sm font-medium text-[var(--osio-fg-default)]">Username</label>
          <input
            id="account-username-input"
            className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
            value={draft}
            aria-invalid={draft !== current && !shapeOk ? true : undefined}
            aria-describedby="account-username-hint"
            onChange={(event) => { setDraft(event.target.value); setProblem(''); }}
          />
          <p id="account-username-hint" className="text-xs text-[var(--osio-fg-muted)]">3 to 32 letters, digits, dots, dashes or underscores.</p>
        </div>
        {problem && <p role="alert" className="text-sm text-[var(--osio-danger)]">{problem}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={busy || !shapeOk || draft === current || !canRetry} onClick={() => { void submit(); }}>{needsSudo ? 'Try again' : 'Change username'}</Button>
        </div>
      </div>
    </Modal>
  );
};

export const PasswordModal: React.FC<{ hasPassword: boolean; onSaved: () => void; onClose: () => void }> = ({ hasPassword, onSaved, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const toast = useToastStore((state) => state.push);
  const strength = Math.min(4, [nextPassword.length >= 10, /[A-Z]/.test(nextPassword), /\d/.test(nextPassword), /[^A-Za-z0-9]/.test(nextPassword)].filter(Boolean).length);
  const canSave = nextPassword.length >= 8 && nextPassword === confirmPassword && (!hasPassword || currentPassword.length > 0);
  return (
    <Modal open onClose={onClose} title={hasPassword ? 'Update password' : 'Add password'} size="sm">
      <div className="space-y-3 p-6">
        {hasPassword && <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />}
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="New password" />
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" />
        <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((index) => <span key={index} className={`h-1 rounded-xs ${index < strength ? 'bg-[var(--osio-accent)]' : 'bg-[var(--osio-bg-muted)]'}`} />)}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSave} onClick={() => {
            runAsync(runAccountAction('/api/account/password', { currentPassword, nextPassword })
              .then((outcome) => {
                const notice = accountActionNotice(outcome, 'Password change');
                if (notice) toast(notice);
                if (outcome.ok) { onSaved(); onClose(); }
              }));
          }}>Save password</Button>
        </div>
      </div>
    </Modal>
  );
};

export const PasskeyManagerModal: React.FC<{ passkeys: Array<{ _id: string; nickname?: string | null; createdAt: string; lastUsedAt?: string | null }>; onRename: (id: string, nickname: string) => void; onRemove: (id: string) => void; onClose: () => void }> = ({ passkeys, onRename, onRemove, onClose }) => (
  <Modal open onClose={onClose} title="Passkeys" size="md">
    <div className="space-y-4 p-6">
      <p className="text-sm text-[var(--osio-fg-muted)]">You can rename or remove passkeys here; new passkeys are added when you sign in on a device that offers one.</p>
      {passkeys.length === 0 && <p className="text-sm text-[var(--osio-fg-muted)]">No passkeys yet.</p>}
      {passkeys.length > 0 && <div className="overflow-x-auto"><DataTable headers={['Name', 'Created', 'Last used', '']} rows={passkeys.map((passkey) => [
        <input key={`${passkey._id}-name`} aria-label="Passkey name" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={passkey.nickname ?? 'Passkey'} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== (passkey.nickname ?? 'Passkey')) onRename(passkey._id, next); }} />,
        new Date(passkey.createdAt).toLocaleDateString(),
        passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleDateString() : 'Never',
        <Button key={`${passkey._id}-remove`} tone="danger-subtle" onClick={() => onRemove(passkey._id)}>Remove</Button>,
      ])} /></div>}
      <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
    </div>
  </Modal>
);

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

import React, { useEffect, useState } from 'react';

// jszip / i18next / pdf-lib / qrcode are click-path only (export, language
// change, invoice PDF, 2FA QR): they are imported dynamically at their call
// sites so the settings chunk stays lean (~280KB of deps off its parse path).
import { changeUsername } from '@/shared/api/accountSecurityApi';
import { Button, Modal, useToastStore } from '@/shared/ui';
import { useAccountEmailsStore, useAccountProfileStore } from '@/store/settings';
import { useSudoPromptStore } from '../ui/sudo/sudoPromptModel';
import { DataTable } from '../ui/settingsKit';
import { accountActionNotice, runAccountAction, runAsync } from '../model/settingsCalls';

export const EmailManagerModal: React.FC<{ userId: string; fallbackEmail?: string; onClose: () => void }> = ({ userId, fallbackEmail, onClose }) => {
  const emails = useAccountEmailsStore((state) => state.data);
  const addEmail = useAccountEmailsStore((state) => state.add);
  const verifyEmail = useAccountEmailsStore((state) => state.verify);
  const removeEmail = useAccountEmailsStore((state) => state.remove);
  const makePrimaryEmail = useAccountEmailsStore((state) => state.makePrimary);
  const [emailDraft, setEmailDraft] = useState('');
  const displayedEmails = emails.length ? emails : [];
  if (!displayedEmails.length && fallbackEmail) {
    displayedEmails.push({ _id: 'fallback-email', userId, email: fallbackEmail, isPrimary: true, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), removedAt: null });
  }
  const rows = displayedEmails.map((email) => [
    <span key={`${email._id}-email`} className="font-medium">{email.email}</span>,
    email.isPrimary ? 'Primary' : 'Secondary',
    email.verifiedAt ? 'Verified' : <Button key={`${email._id}-verify`} onClick={() => runAsync(verifyEmail(email._id))}>Verify</Button>,
    <div key={`${email._id}-actions`} className="flex gap-2">
      {!email.isPrimary && <Button onClick={() => runAsync(makePrimaryEmail(email._id))}>Make primary</Button>}
      {!email.isPrimary && <Button tone="danger-subtle" onClick={() => runAsync(removeEmail(email._id))}>Remove</Button>}
    </div>,
  ]);
  return (
    <Modal open onClose={onClose} title="Manage emails" size="md">
      <div className="space-y-4">
        <DataTable headers={['Email', 'Role', 'Status', '']} rows={rows} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="name@example.com" />
          <Button tone="primary" onClick={() => { if (emailDraft.includes('@')) { runAsync(addEmail(emailDraft, userId)); setEmailDraft(''); } }}>Add email</Button>
        </div>
      </div>
    </Modal>
  );
};

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
      <div className="space-y-3">
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
      <div className="space-y-3">
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

export const TwoFactorModal: React.FC<{ enabled: boolean; onEnabled: (enabled: boolean) => void; onClose: () => void }> = ({ enabled, onEnabled, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const toast = useToastStore((state) => state.push);
  useEffect(() => {
    if (enabled) return;
    runAsync(runAccountAction<{ otpauthUrl?: string }>('/api/account/2fa/enroll', {})
      .then((outcome) => {
        const notice = accountActionNotice(outcome, 'Two-step verification enrolment');
        if (notice) { toast(notice); return; }
        const url = outcome.ok ? outcome.data?.otpauthUrl : undefined;
        if (url) {
          return import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(url)).then(setQrDataUrl);
        }
      }));
  }, [enabled, toast]);
  return (
    <Modal open onClose={onClose} title="Two-step verification" size="sm">
      <div className="space-y-4">
        {enabled ? <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification is enabled.</p> : <>{qrDataUrl && <img alt="Two-step verification QR code" className="h-40 w-40 rounded-md border border-[var(--osio-border-default)]" src={qrDataUrl} />}<input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={code} onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))} placeholder="6-digit code" /></>}
        {recoveryCodes.length > 0 && <div className="grid grid-cols-2 gap-2 rounded-md bg-[var(--osio-bg-subtle)] p-3 text-xs font-mono">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>}
        <div className="flex justify-end gap-2">
          {enabled && <Button tone="danger-subtle" onClick={() => {
            runAsync(runAccountAction('/api/account/2fa/disable', {})
              .then((outcome) => {
                const notice = accountActionNotice(outcome, 'Two-step verification disable');
                if (notice) toast(notice);
                if (outcome.ok) { onEnabled(false); onClose(); }
              }));
          }}>Disable</Button>}
          {!enabled && <Button tone="primary" disabled={code.length !== 6} onClick={() => {
            runAsync(runAccountAction<{ recoveryCodes?: string[] }>('/api/account/2fa/verify', { code })
              .then((outcome) => {
                const notice = accountActionNotice(outcome, 'Two-step verification enable');
                if (notice) { toast(notice); return; }
                if (outcome.ok) {
                  // Recovery codes come from the server only — never a local fallback.
                  setRecoveryCodes(outcome.data?.recoveryCodes ?? []);
                  onEnabled(true);
                  toast({ kind: 'success', title: 'Two-step verification enabled' });
                }
              }));
          }}>Verify</Button>}
        </div>
      </div>
    </Modal>
  );
};

export const PasskeyManagerModal: React.FC<{ passkeys: Array<{ _id: string; nickname?: string | null; createdAt: string }>; onAdd: () => void; onRename: (id: string, nickname: string) => void; onRemove: (id: string) => void; onClose: () => void }> = ({ passkeys, onAdd, onRename, onRemove, onClose }) => (
  <Modal open onClose={onClose} title="Passkeys" size="md">
    <div className="space-y-4">
      <DataTable headers={['Name', 'Created', '']} rows={passkeys.map((passkey) => [
        <input key={`${passkey._id}-name`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={passkey.nickname ?? 'Passkey'} onBlur={(event) => onRename(passkey._id, event.target.value)} />,
        new Date(passkey.createdAt).toLocaleDateString(),
        <Button key={`${passkey._id}-remove`} tone="danger-subtle" onClick={() => onRemove(passkey._id)}>Remove</Button>,
      ])} />
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Done</Button><Button tone="primary" onClick={onAdd}>Add passkey</Button></div>
    </div>
  </Modal>
);

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfilePanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:44:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:44:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Check,
  Copy,
  FileDown,
  KeyRound,
} from 'lucide-react';
import { EmojiPicker, Modal, useToastStore } from '@/shared/ui';
import { useUserStore, type StaticPersona } from '@/features/auth';
import { ImageAvatarUpload } from '@/features/settings/profile/ImageAvatarUpload';
import { API_BASE, api, getActiveJwt } from '@/shared/api/client';
import {
  recordSettingsAction,
  useAccountDevicesStore,
  useAccountEmailsStore,
  useAccountPasskeysStore,
  useAccountSettingsStore,
} from '@/store/settings';
import {
  Avatar,
  Button,
  DataTable,
  runAsync,
  Section,
  SettingRow,
  Switch,
} from './settingsUiComponents';

async function postAccountAction<T>(path: string, body: unknown): Promise<T | null> {
  const jwt = getActiveJwt();
  if (!jwt || !API_BASE) return null;
  return api.post<T>(path, body, jwt);
}

function flashSavedIndicator(setSaved: React.Dispatch<React.SetStateAction<boolean>>) {
  setSaved(true);
  globalThis.setTimeout(() => setSaved(false), 1400);
}

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
      {!email.isPrimary && <Button tone="danger" onClick={() => runAsync(removeEmail(email._id))}>Remove</Button>}
    </div>,
  ]);
  return (
    <Modal open onClose={onClose} title="Manage emails" size="md">
      <div className="space-y-4">
        <DataTable headers={['Email', 'Role', 'Status', '']} rows={rows} />
        <div className="flex gap-2">
          <input className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="name@example.com" />
          <Button tone="primary" onClick={() => { if (emailDraft.includes('@')) { runAsync(addEmail(emailDraft, userId)); setEmailDraft(''); } }}>Add email</Button>
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
        {hasPassword && <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />}
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="New password" />
        <input type="password" className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" />
        <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((index) => <span key={index} className={`h-1 rounded ${index < strength ? 'bg-[var(--osio-accent)]' : 'bg-[var(--osio-bg-muted)]'}`} />)}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSave} onClick={() => { runAsync(postAccountAction('/api/account/password', { currentPassword, nextPassword }).then(() => { onSaved(); toast({ kind: 'success', title: 'Password saved' }); onClose(); })); }}>Save password</Button>
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
    runAsync(Promise.all([import('qrcode'), postAccountAction<{ otpauthUrl?: string }>('/api/account/2fa/enroll', {})])
      .then(([{ default: QRCode }, response]) => QRCode.toDataURL(response?.otpauthUrl ?? `otpauth://totp/osionos:${Date.now()}?secret=LOCALDEV&issuer=osionos`).then(setQrDataUrl)));
  }, [enabled]);
  return (
    <Modal open onClose={onClose} title="Two-step verification" size="sm">
      <div className="space-y-4">
        {enabled ? <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification is enabled.</p> : <>{qrDataUrl && <img alt="Two-step verification QR code" className="h-40 w-40 rounded-md border border-[var(--osio-border-default)]" src={qrDataUrl} />}<input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={code} onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))} placeholder="6-digit code" /></>}
        {recoveryCodes.length > 0 && <div className="grid grid-cols-2 gap-2 rounded-md bg-[var(--osio-bg-subtle)] p-3 text-xs font-mono">{recoveryCodes.map((item) => <span key={item}>{item}</span>)}</div>}
        <div className="flex justify-end gap-2">
          {enabled && <Button tone="danger" onClick={() => { runAsync(postAccountAction('/api/account/2fa/disable', {}).then(() => { onEnabled(false); toast({ kind: 'success', title: 'Two-step verification disabled' }); onClose(); })); }}>Disable</Button>}
          {!enabled && <Button tone="primary" disabled={code.length !== 6} onClick={() => { runAsync(postAccountAction<{ recoveryCodes?: string[] }>('/api/account/2fa/verify', { code }).then((response) => { onEnabled(true); setRecoveryCodes(response?.recoveryCodes ?? ['A12B-C34D', 'E56F-G78H', 'J90K-L12M', 'N34P-Q56R']); toast({ kind: 'success', title: 'Two-step verification enabled' }); })); }}>Verify</Button>}
        </div>
      </div>
    </Modal>
  );
};

export const PasskeyManagerModal: React.FC<{ passkeys: Array<{ _id: string; nickname?: string | null; createdAt: string }>; onAdd: () => void; onRename: (id: string, nickname: string) => void; onRemove: (id: string) => void; onClose: () => void }> = ({ passkeys, onAdd, onRename, onRemove, onClose }) => (
  <Modal open onClose={onClose} title="Passkeys" size="md">
    <div className="space-y-4">
      <DataTable headers={['Name', 'Created', '']} rows={passkeys.map((passkey) => [
        <input key={`${passkey._id}-name`} className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" defaultValue={passkey.nickname ?? 'Passkey'} onBlur={(event) => onRename(passkey._id, event.target.value)} />,
        new Date(passkey.createdAt).toLocaleDateString(),
        <Button key={`${passkey._id}-remove`} tone="danger" onClick={() => onRemove(passkey._id)}>Remove</Button>,
      ])} />
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Done</Button><Button tone="primary" onClick={onAdd}>Add passkey</Button></div>
    </div>
  </Modal>
);

export const SupportDurationModal: React.FC<{ onSelect: (days: number) => void; onClose: () => void }> = ({ onSelect, onClose }) => (
  <Modal open onClose={onClose} title="Support access duration" size="sm">
    <div className="grid gap-2">
      {[1, 7, 30].map((days) => <Button key={days} onClick={() => onSelect(days)}>{days === 1 ? '1 day' : `${days} days`}</Button>)}
    </div>
  </Modal>
);

export const ConfirmModal: React.FC<{ title: string; message: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, actionLabel, danger, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{actionLabel}</Button></div>
    </div>
  </Modal>
);

export const TypedConfirmModal: React.FC<{ title: string; message: string; confirmText: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, confirmText, actionLabel, danger, onConfirm, onClose }) => {
  const [draft, setDraft] = useState('');
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={confirmText} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} disabled={draft !== confirmText} onClick={onConfirm}>{actionLabel}</Button></div>
      </div>
    </Modal>
  );
};

export const ProfilePanel: React.FC<{ persona: StaticPersona | null }> = ({ persona }) => {
  const userId = persona?.id || 'anonymous';
  const toast = useToastStore((state) => state.push);
  const logoutUser = useUserStore((state) => state.logoutUser);
  const account = useAccountSettingsStore((state) => state.data);
  const hydrateAccount = useAccountSettingsStore((state) => state.hydrate);
  const updateAccount = useAccountSettingsStore((state) => state.update);
  const devices = useAccountDevicesStore((state) => state.data);
  const hydrateDevices = useAccountDevicesStore((state) => state.hydrate);
  const revokeDevice = useAccountDevicesStore((state) => state.revoke);
  const revokeAllExceptCurrent = useAccountDevicesStore((state) => state.revokeAllExceptCurrent);
  const passkeys = useAccountPasskeysStore((state) => state.data);
  const hydratePasskeys = useAccountPasskeysStore((state) => state.hydrate);
  const registerPasskeyOptions = useAccountPasskeysStore((state) => state.registerOptions);
  const verifyPasskeyRegistration = useAccountPasskeysStore((state) => state.verifyRegistration);
  const renamePasskey = useAccountPasskeysStore((state) => state.rename);
  const removePasskey = useAccountPasskeysStore((state) => state.remove);
  const emails = useAccountEmailsStore((state) => state.data);
  const hydrateEmails = useAccountEmailsStore((state) => state.hydrate);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [passkeysModalOpen, setPasskeysModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [preferredNameDraft, setPreferredNameDraft] = useState(persona?.name ?? '');
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    runAsync(hydrateAccount(userId, persona?.name));
    runAsync(hydrateDevices(userId));
    runAsync(hydratePasskeys());
    runAsync(hydrateEmails(userId, persona?.email));
  }, [hydrateAccount, hydrateDevices, hydrateEmails, hydratePasskeys, persona?.email, persona?.name, userId]);

  useEffect(() => {
    const currentName = account?.profile.preferredName ?? persona?.name ?? '';
    if (!preferredNameDraft.trim() || preferredNameDraft === currentName) return;
    const timer = globalThis.setTimeout(() => {
      updateAccount({ profile: { ...account?.profile, preferredName: preferredNameDraft.trim() } });
      flashSavedIndicator(setNameSaved);
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [account?.profile, persona?.name, preferredNameDraft, updateAccount]);

  const preferredName = account?.profile.preferredName ?? persona?.name ?? '';
  const primaryEmail = emails.find((email) => email.isPrimary)?.email ?? persona?.email ?? 'dev.pro.photo@gmail.com';
  const security = account?.security ?? {};
  const visibleDevices = devices.filter((device) => !device.revokedAt);
  const activePasskeys = passkeys.filter((passkey) => !passkey.removedAt);
  const deviceRows = visibleDevices.map((device, index) => [
    <span key={`${device._id}-name`}>{index === 0 ? 'Ubuntu · This Device' : device.userAgent?.split(')')[0]?.replace('(', '') || 'Linux'}{device._id === 'current-device' ? <span className="ml-2 rounded bg-[var(--osio-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--osio-accent-text)]">Current</span> : null}</span>,
    device._id === 'current-device' ? 'Now' : new Date(device.lastActiveAt).toLocaleString(),
    device.location ?? 'Unknown location',
    device._id === 'current-device' ? '' : <Button key={`${device._id}-logout`} onClick={() => { runAsync(revokeDevice(device._id)); }}>Log out</Button>,
  ]);

  async function handleRegisterPasskey(nickname = 'osionos passkey') {
    const options = await registerPasskeyOptions(nickname);
    const response = options
      ? await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'] })
      : { id: `local-${Date.now()}`, response: { transports: ['internal'] } };
    await verifyPasskeyRegistration(response, nickname);
    toast({ kind: 'success', title: 'Passkey added' });
  }

  async function handleDeleteAccount() {
    await postAccountAction('/api/account/request-deletion', {});
    recordSettingsAction('account_request_deletion', { userId });
    logoutUser(userId);
    toast({ kind: 'success', title: 'Account scheduled for deletion in 30 days. Cancel anytime in Settings.' });
    globalThis.location.assign('/');
  }

  return (
    <>
      <Section title="Account">
        <div className="flex items-center gap-5 pb-3">
          <div className="relative">
            <button type="button" className="rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--osio-accent)]" onClick={() => setAvatarPickerOpen((open) => !open)} aria-label="Change avatar">
              <Avatar value={account?.profile.avatar ?? persona?.emoji} label={preferredName} size={60} />
            </button>
            {avatarPickerOpen && (
              <div className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-2">
                <EmojiPicker
                  current={account?.profile.avatar ?? persona?.emoji}
                  onSelect={(value: string) => { updateAccount({ profile: { ...account?.profile, avatar: value } }); setAvatarPickerOpen(false); }}
                  onRemove={() => { updateAccount({ profile: { ...account?.profile, avatar: undefined } }); setAvatarPickerOpen(false); }}
                  onClose={() => setAvatarPickerOpen(false)}
                />
              </div>
            )}
          </div>
          <label className="w-[260px] text-xs text-[var(--osio-fg-muted)]">
            <span>Preferred name</span>
            <span className="relative mt-1 block">
              <input
                className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 pr-8 text-sm text-[var(--osio-fg-default)] outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
                value={preferredNameDraft}
                onChange={(event) => setPreferredNameDraft(event.target.value)}
              />
              {nameSaved && <Check size={16} className="absolute right-2 top-2.5 text-[var(--osio-success)]" />}
            </span>
          </label>
          <ImageAvatarUpload onUploaded={(dataUrl) => updateAccount({ profile: { ...account?.profile, avatar: dataUrl } })} />
        </div>
        <p className="text-sm text-[var(--osio-fg-muted)]"><span className="text-[var(--osio-accent-text)]">Create a custom self-portrait</span> with osionos Faces</p>
      </Section>
      <Section title="Account security">
        <SettingRow title="Email" description={primaryEmail} action={<Button onClick={() => setEmailModalOpen(true)}>Manage emails</Button>} />
        <SettingRow title="Password" description={security.hasPassword ? 'Password sign-in is available for this account.' : 'Add a password to keep another sign-in option available.'} action={<Button onClick={() => setPasswordModalOpen(true)}>{security.hasPassword ? 'Update password' : 'Add password'}</Button>} />
        <SettingRow title="Two-step verification" description="Add another layer of security to your account" action={<Button onClick={() => setTwoFactorModalOpen(true)}>{security.twoStepEnabled ? 'Manage' : 'Add verification method'}</Button>} />
        <SettingRow title="Passkeys" description={`${activePasskeys.length} passkey${activePasskeys.length === 1 ? '' : 's'} configured`} action={<Button onClick={() => setPasskeysModalOpen(true)}><KeyRound size={14} /> Add passkey</Button>} />
      </Section>
      <Section title="Support">
        <SettingRow title="Support access" description="Grant support temporary access to troubleshoot problems. You can revoke access anytime." action={<Switch checked={Boolean(account?.supportAccessGrantedUntil)} onChange={(checked) => { if (checked) setSupportModalOpen(true); else updateAccount({ supportAccessGrantedUntil: null }); }} />} />
        <SettingRow danger title="Delete my account" description="Permanently delete your account and remove access to your pages and workspaces." action={<Button tone="danger" onClick={() => setDeleteModalOpen(true)}>Delete my account</Button>} />
      </Section>
      <Section title="Devices">
        <SettingRow danger title="Log out of all devices" description="Log out of active sessions on all your devices, other than this one" action={<Button tone="danger" onClick={() => setRevokeModalOpen(true)}>Log out of all devices</Button>} />
        <DataTable headers={['Device Name', 'Last Active', 'Location', '']} rows={deviceRows.length ? deviceRows : [['Ubuntu · This Device', 'Now', 'This device', '']]} />
        <Button tone="ghost" className="mt-2"><FileDown size={14} /> Load more devices</Button>
      </Section>
      <Section title="User ID">
        <SettingRow title="User ID" description={persona?.id ?? 'b0181a89-4ad8-476c-9657-352d6eadf49e'} action={<Button tone="ghost" aria-label="Copy user ID" onClick={() => { runAsync(navigator.clipboard.writeText(persona?.id ?? userId).then(() => toast({ kind: 'success', title: 'User ID copied' }))); }}><Copy size={16} /></Button>} />
      </Section>

      {emailModalOpen && <EmailManagerModal userId={userId} fallbackEmail={persona?.email} onClose={() => setEmailModalOpen(false)} />}
      {passwordModalOpen && <PasswordModal hasPassword={Boolean(security.hasPassword)} onSaved={() => updateAccount({ security: { ...security, hasPassword: true } })} onClose={() => setPasswordModalOpen(false)} />}
      {twoFactorModalOpen && <TwoFactorModal enabled={Boolean(security.twoStepEnabled)} onEnabled={(enabled) => updateAccount({ security: { ...security, twoStepEnabled: enabled } })} onClose={() => setTwoFactorModalOpen(false)} />}
      {passkeysModalOpen && <PasskeyManagerModal passkeys={activePasskeys} onAdd={() => runAsync(handleRegisterPasskey())} onRename={renamePasskey} onRemove={(id) => runAsync(removePasskey(id))} onClose={() => setPasskeysModalOpen(false)} />}
      {supportModalOpen && <SupportDurationModal onSelect={(days) => { updateAccount({ supportAccessGrantedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() }); setSupportModalOpen(false); }} onClose={() => setSupportModalOpen(false)} />}
      {deleteModalOpen && <TypedConfirmModal title="Delete account" message="Type DELETE to schedule this account for deletion." confirmText="DELETE" danger actionLabel="Schedule deletion" onConfirm={() => runAsync(handleDeleteAccount())} onClose={() => setDeleteModalOpen(false)} />}
      {revokeModalOpen && <ConfirmModal title="Log out all devices" message="This logs out every active session except your current device." danger actionLabel="Log out all devices" onConfirm={() => { runAsync(revokeAllExceptCurrent(userId)); setRevokeModalOpen(false); }} onClose={() => setRevokeModalOpen(false)} />}
    </>
  );
};

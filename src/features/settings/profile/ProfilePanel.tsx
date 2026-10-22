/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfilePanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Check, Copy, FileDown, KeyRound } from 'lucide-react';

import { useUserStore, type StaticPersona } from '@/features/auth';
import { useAccountDevicesStore, useAccountEmailsStore, useAccountPasskeysStore, useAccountSettingsStore, recordSettingsAction } from '@/store/settings';
import { Button, EmojiPicker, IconButton, Toggle, useToastStore } from '@/shared/ui';
import { ImageAvatarUpload } from './ImageAvatarUpload';
import { ConfirmModal, TypedConfirmModal } from '../ui/ConfirmModals';
import { Avatar, DataTable, Section, SettingRow } from '../ui/settingsKit';
import { noopHandledAction, postAccountAction, runAsync } from '../model/settingsCalls';
import { EmailManagerModal, PasskeyManagerModal, PasswordModal, SupportDurationModal, TwoFactorModal } from './ProfileSecurityModals';

type SettingsModalName =
  | 'email-manager'
  | 'password'
  | 'two-factor'
  | 'passkeys'
  | 'support-duration'
  | 'delete-account'
  | 'revoke-devices';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

function flashSavedIndicator(setSaved: React.Dispatch<React.SetStateAction<boolean>>) {
  setSaved(true);
  globalThis.setTimeout(() => setSaved(false), 1400);
}

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
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);
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
    <span key={`${device._id}-name`}>{index === 0 ? 'Ubuntu · This Device' : device.userAgent?.split(')')[0]?.replace('(', '') || 'Linux'}{device._id === 'current-device' ? <span className="ml-2 rounded-xs bg-[var(--osio-accent-subtle)] px-1.5 py-0.5 text-xs text-[var(--osio-accent-text)]">Current</span> : null}</span>,
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
    await logoutUser(userId);
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
                  onSelect={(value) => { updateAccount({ profile: { ...account?.profile, avatar: value } }); setAvatarPickerOpen(false); }}
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
                className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 pr-8 text-sm text-[var(--osio-fg-default)] outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
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
        <SettingRow title="Email" description={primaryEmail} action={<Button onClick={() => setModal({ name: 'email-manager' })}>Manage emails</Button>} />
        <SettingRow title="Password" description={security.hasPassword ? 'Password sign-in is available for this account.' : 'Add a password to keep another sign-in option available.'} action={<Button onClick={() => setModal({ name: 'password' })}>{security.hasPassword ? 'Update password' : 'Add password'}</Button>} />
        <SettingRow title="Two-step verification" description="Add another layer of security to your account" action={<Button onClick={() => setModal({ name: 'two-factor' })}>{security.twoStepEnabled ? 'Manage' : 'Add verification method'}</Button>} />
        <SettingRow title="Passkeys" description={`${activePasskeys.length} passkey${activePasskeys.length === 1 ? '' : 's'} configured`} action={<Button onClick={() => setModal({ name: 'passkeys' })}><KeyRound size={14} /> Add passkey</Button>} />
      </Section>
      <Section title="Support">
        <SettingRow title="Support access" description="Grant support temporary access to troubleshoot problems. You can revoke access anytime." action={<Toggle checked={Boolean(account?.supportAccessGrantedUntil)} onChange={(checked) => { if (checked) setModal({ name: 'support-duration' }); else updateAccount({ supportAccessGrantedUntil: null }); }} label="Support access" />} />
        <SettingRow danger title="Delete my account" description="Permanently delete your account and remove access to your pages and workspaces." action={<Button tone="danger" onClick={() => setModal({ name: 'delete-account' })}>Delete my account</Button>} />
      </Section>
      <Section title="Devices">
        <SettingRow danger title="Log out of all devices" description="Log out of active sessions on all your devices, other than this one" action={<Button tone="danger" onClick={() => setModal({ name: 'revoke-devices' })}>Log out of all devices</Button>} />
        <DataTable headers={['Device Name', 'Last Active', 'Location', '']} rows={deviceRows.length ? deviceRows : [['Ubuntu · This Device', 'Now', 'This device', '']]} />
        <Button tone="ghost" className="mt-2" onClick={() => noopHandledAction('settings_button_click', { label: 'Load more devices' })}><FileDown size={14} /> Load more devices</Button>
      </Section>
      <Section title="User ID">
        <SettingRow title="User ID" description={persona?.id ?? 'b0181a89-4ad8-476c-9657-352d6eadf49e'} action={<IconButton label="Copy user ID" onClick={() => { runAsync(navigator.clipboard.writeText(persona?.id ?? userId).then(() => toast({ kind: 'success', title: 'User ID copied' }))); }}><Copy size={16} /></IconButton>} />
      </Section>

      {modal?.name === 'email-manager' && <EmailManagerModal userId={userId} fallbackEmail={persona?.email} onClose={() => setModal(null)} />}
      {modal?.name === 'password' && <PasswordModal hasPassword={Boolean(security.hasPassword)} onSaved={() => updateAccount({ security: { ...security, hasPassword: true } })} onClose={() => setModal(null)} />}
      {modal?.name === 'two-factor' && <TwoFactorModal enabled={Boolean(security.twoStepEnabled)} onEnabled={(enabled) => updateAccount({ security: { ...security, twoStepEnabled: enabled } })} onClose={() => setModal(null)} />}
      {modal?.name === 'passkeys' && <PasskeyManagerModal passkeys={activePasskeys} onAdd={() => runAsync(handleRegisterPasskey())} onRename={renamePasskey} onRemove={(id) => runAsync(removePasskey(id))} onClose={() => setModal(null)} />}
      {modal?.name === 'support-duration' && <SupportDurationModal onSelect={(days) => { updateAccount({ supportAccessGrantedUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'delete-account' && <TypedConfirmModal title="Delete account" message="Type DELETE to schedule this account for deletion." confirmText="DELETE" danger actionLabel="Schedule deletion" onConfirm={() => runAsync(handleDeleteAccount())} onClose={() => setModal(null)} />}
      {modal?.name === 'revoke-devices' && <ConfirmModal title="Log out all devices" message="This logs out every active session except your current device." danger actionLabel="Log out all devices" onConfirm={() => { runAsync(revokeAllExceptCurrent(userId)); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

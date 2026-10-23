/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ProfilePanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Copy, KeyRound } from 'lucide-react';

import { useUserStore, type StaticPersona } from '@/features/auth';
import { useAccountEmailsStore, useAccountPasskeysStore, useAccountProfileStore, useAccountSettingsStore } from '@/store/settings';
import { isAccountDeleteEnabled } from '@/shared/config/featureFlags';
import { Button, IconButton, useToastStore } from '@/shared/ui';
import { ConfirmModal } from '../ui/ConfirmModals';
import { AccountDangerZone } from '../ui/danger/AccountDangerZone';
import { Section, SettingRow } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';
import { SessionsSettings } from './SessionsSettings';
import { PublicProfileSection } from './PublicProfileSection';
import { signInRows } from './signInMethods';
import { EmailManagerModal, PasskeyManagerModal, PasswordModal, TwoFactorModal, UsernameModal } from './ProfileSecurityModals';

type SettingsModalName =
  | 'email-manager'
  | 'password'
  | 'two-factor'
  | 'passkeys'
  | 'username'
  | 'sign-out-all';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const ProfilePanel: React.FC<{ persona: StaticPersona | null }> = ({ persona }) => {
  const userId = persona?.id || 'anonymous';
  const toast = useToastStore((state) => state.push);
  const logoutUser = useUserStore((state) => state.logoutUser);
  const account = useAccountSettingsStore((state) => state.data);
  const hydrateAccount = useAccountSettingsStore((state) => state.hydrate);
  const updateAccount = useAccountSettingsStore((state) => state.update);
  const username = useAccountProfileStore((state) => state.profile?.username ?? null);
  const passkeys = useAccountPasskeysStore((state) => state.data);
  const hydratePasskeys = useAccountPasskeysStore((state) => state.hydrate);
  const registerPasskeyOptions = useAccountPasskeysStore((state) => state.registerOptions);
  const verifyPasskeyRegistration = useAccountPasskeysStore((state) => state.verifyRegistration);
  const renamePasskey = useAccountPasskeysStore((state) => state.rename);
  const removePasskey = useAccountPasskeysStore((state) => state.remove);
  const emails = useAccountEmailsStore((state) => state.data);
  const hydrateEmails = useAccountEmailsStore((state) => state.hydrate);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrateAccount(userId));
    runAsync(hydratePasskeys());
    runAsync(hydrateEmails(userId, persona?.email));
  }, [hydrateAccount, hydrateEmails, hydratePasskeys, persona?.email, userId]);

  const primaryEmail = emails.find((email) => email.isPrimary)?.email ?? persona?.email;
  const security = account?.security ?? {};
  const activePasskeys = passkeys.filter((passkey) => !passkey.removedAt);
  const rows = signInRows(security);
  const passwordRow = rows.find((row) => row.id === 'password');
  const passkeysReported = rows.some((row) => row.id === 'passkeys');

  async function handleRegisterPasskey(nickname = 'osionos passkey') {
    const options = await registerPasskeyOptions(nickname);
    if (!options) {
      toast({ kind: 'info', title: "Passkeys aren't available on this server yet" });
      return;
    }
    const response = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'] });
    await verifyPasskeyRegistration(response, nickname);
    toast({ kind: 'success', title: 'Passkey added' });
  }

  return (
    <>
      <PublicProfileSection />
      <Section title="Account security">
        <SettingRow title="Email" description={primaryEmail} action={<Button onClick={() => setModal({ name: 'email-manager' })}>Manage emails</Button>} />
        {username && <SettingRow title="Username" description={`@${username}`} action={<Button onClick={() => setModal({ name: 'username' })}>Change</Button>} />}
        {passwordRow && <SettingRow title="Password" description={security.hasPassword ? 'Password sign-in is available for this account.' : 'Add a password to keep another sign-in option available.'} action={<Button onClick={() => setModal({ name: 'password' })}>{passwordRow.label}</Button>} />}
        <SettingRow title="Two-step verification" description="Add another layer of security to your account" action={<Button onClick={() => setModal({ name: 'two-factor' })}>{security.twoStepEnabled ? 'Manage' : 'Add verification method'}</Button>} />
        {passkeysReported
          ? <SettingRow title="Passkeys" description={`${activePasskeys.length} passkey${activePasskeys.length === 1 ? '' : 's'} configured`} action={<Button onClick={() => setModal({ name: 'passkeys' })}><KeyRound size={14} /> Add passkey</Button>} />
          : <SettingRow title="Passkeys" description="Passkeys aren't available on this server yet." />}
      </Section>
      {isAccountDeleteEnabled() && <AccountDangerZone username={username} email={primaryEmail} />}
      <SessionsSettings userId={userId} onSignOutAll={() => setModal({ name: 'sign-out-all' })} />
      <Section title="User ID">
        <SettingRow
          title="User ID"
          description={persona?.id}
          action={persona?.id ? <IconButton label="Copy user ID" onClick={() => { runAsync(navigator.clipboard.writeText(persona.id).then(() => toast({ kind: 'success', title: 'User ID copied' }))); }}><Copy size={16} /></IconButton> : undefined}
        />
      </Section>

      {modal?.name === 'email-manager' && <EmailManagerModal userId={userId} fallbackEmail={persona?.email} onClose={() => setModal(null)} />}
      {modal?.name === 'password' && <PasswordModal hasPassword={security.hasPassword === true} onSaved={() => updateAccount({ security: { ...security, hasPassword: true } })} onClose={() => setModal(null)} />}
      {modal?.name === 'two-factor' && <TwoFactorModal enabled={Boolean(security.twoStepEnabled)} onEnabled={(enabled) => updateAccount({ security: { ...security, twoStepEnabled: enabled } })} onClose={() => setModal(null)} />}
      {modal?.name === 'passkeys' && <PasskeyManagerModal passkeys={activePasskeys} onAdd={() => runAsync(handleRegisterPasskey())} onRename={renamePasskey} onRemove={(id) => runAsync(removePasskey(id))} onClose={() => setModal(null)} />}
      {modal?.name === 'username' && username && <UsernameModal current={username} onClose={() => setModal(null)} />}
      {modal?.name === 'sign-out-all' && <ConfirmModal title="Log out all devices" message="This signs you out on every device, including this one." danger actionLabel="Log out of all devices" onConfirm={() => { setModal(null); runAsync(logoutUser(userId)); }} onClose={() => setModal(null)} />}
    </>
  );
};

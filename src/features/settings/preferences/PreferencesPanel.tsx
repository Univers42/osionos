/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PreferencesPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';

// jszip / i18next / pdf-lib / qrcode are click-path only (export, language
// change, invoice PDF, 2FA QR): they are imported dynamically at their call
// sites so the settings chunk stays lean (~280KB of deps off its parse path).
import { Button, Dropdown, Modal, Toggle } from '@/shared/ui';
import { WorkspaceThemeControls } from '@/features/theme/WorkspaceThemePanel';
import { useUserPreferencesStore, recordSettingsAction } from '@/store/settings';
import { ConfirmModal } from '../ui/ConfirmModals';
import { Section, SettingRow } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';
import { AccessibilitySettings } from './AccessibilitySettings';

const FALLBACK_TIMEZONES = ['UTC', 'Europe/Madrid', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

function timezoneOptions(): string[] {
  const supportedValuesOf = Intl.supportedValuesOf as ((key: 'timeZone') => string[]) | undefined;
  return supportedValuesOf ? supportedValuesOf('timeZone') : FALLBACK_TIMEZONES;
}

function changeLanguage(language: string) {
  runAsync((async () => {
    const { default: i18n } = await import('i18next');
    if (i18n.isInitialized) {
      await i18n.changeLanguage(language);
      return;
    }
    recordSettingsAction('i18n_change_stub', { language, todo: 'Initialize react-i18next app provider.' });
  })());
}

function cookieModeLabel(mode: string | undefined) {
  if (mode === 'all') return 'Allow all';
  if (mode === 'essential') return 'Essential only';
  return 'Customize';
}

type SettingsModalName = 'cookies' | 'reset-preferences';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const PreferencesPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const preferences = useUserPreferencesStore((state) => state.data);
  const hydrate = useUserPreferencesStore((state) => state.hydrate);
  const update = useUserPreferencesStore((state) => state.update);
  const reset = useUserPreferencesStore((state) => state.reset);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  useEffect(() => {
    runAsync(hydrate(userId));
  }, [hydrate, userId]);

  const privacy = preferences?.privacy as { viewHistory?: boolean; profileDiscoverability?: boolean; textDirectionControls?: boolean } | undefined;
  const desktop = preferences?.desktop as { openOnStart?: string } | undefined;
  const cookies = preferences?.cookies as { mode?: string } | undefined;
  const cookieButtonLabel = cookieModeLabel(cookies?.mode);
  const timezones = useMemo(() => timezoneOptions().map((timezone) => ({ value: timezone, label: timezone.replaceAll('_', ' ') })), []);

  return (
    <>
      <Section title="Appearance">
        <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">
          Choose a color theme and light/dark mode for osionos on this device.
        </p>
        <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-4">
          <WorkspaceThemeControls compact />
        </div>
      </Section>
      <AccessibilitySettings />
      <Section title="Input options">
        <SettingRow title="Use Enter to add a new line" description="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send." action={<Toggle checked={Boolean(preferences?.enterAddsNewline)} onChange={(checked) => update({ enterAddsNewline: checked })} label="Use Enter to add a new line" />} />
      </Section>
      <Section title="Language & time">
        <SettingRow title="Language" description="Choose the language you want to use osionos in" action={<Dropdown label="Language" value={preferences?.language ?? 'en-US'} options={[{ value: 'en-US', label: 'English (US)' }, { value: 'fr-FR', label: 'Français' }, { value: 'es-ES', label: 'Español' }, { value: 'de-DE', label: 'Deutsch' }]} onChange={(value) => { changeLanguage(value); update({ language: value }); }} align="end" width="auto" />} />
        <SettingRow title="Number format" description="Choose how numbers and currencies are formatted." action={<Dropdown label="Number format" value={preferences?.numberFormat ?? 'default'} options={[{ value: 'default', label: 'Default' }, { value: 'dot', label: '1,000.00' }, { value: 'comma', label: '1.000,00' }, { value: 'space', label: '1 000,00' }]} onChange={(value) => update({ numberFormat: value })} align="end" width="auto" />} />
        <SettingRow title="Always show text direction controls" description="Show left-to-right and right-to-left controls in the editor." action={<Toggle checked={Boolean(preferences?.privacy?.textDirectionControls)} onChange={(checked) => update({ privacy: { ...preferences?.privacy, textDirectionControls: checked } })} label="Always show text direction controls" />} />
        <SettingRow title="Start week" description="This will affect the way your calendars appear in osionos" action={<Dropdown label="Start week" value={preferences?.weekStart ?? 'monday'} options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} onChange={(value) => update({ weekStart: value as 'sunday' | 'monday' })} align="end" width="auto" />} />
        <SettingRow title="Date format" description="Set the default format for new @date mentions" action={<Dropdown label="Date format" value={preferences?.dateFormat ?? 'relative'} options={[{ value: 'relative', label: 'Relative' }, { value: 'short', label: 'Short' }, { value: 'iso', label: 'ISO' }]} onChange={(value) => update({ dateFormat: value })} align="end" width="auto" />} />
        <SettingRow title="Set time zone automatically using your location" description="Reminders, notifications, and emails will use your time zone" action={<Toggle checked={Boolean(preferences?.autoTimezone)} onChange={(checked) => update({ autoTimezone: checked, timezone: checked ? Intl.DateTimeFormat().resolvedOptions().timeZone : preferences?.timezone })} label="Set time zone automatically using your location" />} />
        <SettingRow title="Time zone" description="Choose your time zone" action={<Dropdown label="Time zone" value={preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} options={timezones} onChange={(value) => update({ timezone: value, autoTimezone: false })} align="end" width="auto" />} />
      </Section>
      <Section title="Desktop app">
        <SettingRow title="Open on start" description="Choose what page opens when you start osionos and when you switch workspaces" action={<Dropdown label="Open on start" value={desktop?.openOnStart ?? 'last-visited-page'} options={[{ value: 'last-visited-page', label: 'Last visited page' }, { value: 'home', label: 'Home' }, { value: 'new-page', label: 'New page' }]} onChange={(value) => update({ desktop: { ...preferences?.desktop, openOnStart: value } })} align="end" width="auto" />} />
      </Section>
      <Section title="Privacy">
        <SettingRow title="Cookie settings" description="See the Cookie Notice for more information" action={<Button onClick={() => setModal({ name: 'cookies' })}>{cookieButtonLabel}</Button>} />
        <SettingRow title="Show my view history" description="People with edit or full access can see when you’ve viewed a page." action={<Toggle checked={privacy?.viewHistory ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, viewHistory: checked } })} label="Show my view history" />} />
        <SettingRow title="Profile discoverability" description="Users who know your email will see your profile when inviting you." action={<Toggle checked={privacy?.profileDiscoverability ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, profileDiscoverability: checked } })} label="Profile discoverability" />} />
        <Button className="mt-3" onClick={() => setModal({ name: 'reset-preferences' })}>Reset to defaults</Button>
      </Section>

      {modal?.name === 'cookies' && <CookieSettingsModal mode={cookies?.mode ?? 'customize'} onSave={(mode) => { update({ cookies: { ...preferences?.cookies, mode } }); setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.name === 'reset-preferences' && <ConfirmModal title="Reset preferences" message="This restores language, theme, input, privacy, and desktop preferences to their defaults." actionLabel="Reset" onConfirm={() => { runAsync(reset(userId)); setModal(null); }} onClose={() => setModal(null)} />}
    </>
  );
};

const CookieSettingsModal: React.FC<{ mode: string; onSave: (mode: string) => void; onClose: () => void }> = ({ mode, onSave, onClose }) => {
  const [analytics, setAnalytics] = useState(mode === 'all' || mode === 'customize');
  const [personalization, setPersonalization] = useState(mode === 'all');
  let nextMode = 'essential';
  if (personalization) nextMode = 'all';
  else if (analytics) nextMode = 'customize';
  return (
    <Modal open onClose={onClose} title="Cookie settings" size="sm">
      <div className="space-y-3">
        <SettingRow title="Essential cookies" description="Required for login, security, and workspace routing." action={<Toggle checked disabled label="Essential cookies" onChange={() => undefined} />} />
        <SettingRow title="Analytics cookies" description="Help us understand performance and reliability." action={<Toggle checked={analytics} onChange={setAnalytics} label="Analytics cookies" />} />
        <SettingRow title="Personalization cookies" description="Remember richer preferences across devices." action={<Toggle checked={personalization} onChange={setPersonalization} label="Personalization cookies" />} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onSave(nextMode)}>Save</Button></div>
      </div>
    </Modal>
  );
};

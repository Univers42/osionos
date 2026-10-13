/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PreferencesPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:41:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:41:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@osionos/ui/primitives';
import { WorkspaceThemeControls } from '@/features/theme/WorkspaceThemePanel';
import { recordSettingsAction, useUserPreferencesStore } from '@/store/settings';
import {
  Button,
  runAsync,
  Section,
  SelectButton,
  SettingRow,
  Switch,
} from './settingsUiComponents';

const FALLBACK_TIMEZONES = ['UTC', 'Europe/Madrid', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

function cookieModeLabel(mode: string | undefined) {
  if (mode === 'all') return 'Allow all';
  if (mode === 'essential') return 'Essential only';
  return 'Customize';
}

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

export const CookieSettingsModal: React.FC<{ mode: string; onSave: (mode: string) => void; onClose: () => void }> = ({ mode, onSave, onClose }) => {
  const [analytics, setAnalytics] = useState(mode === 'all' || mode === 'customize');
  const [personalization, setPersonalization] = useState(mode === 'all');
  let nextMode = 'essential';
  if (personalization) nextMode = 'all';
  else if (analytics) nextMode = 'customize';
  return (
    <Modal open onClose={onClose} title="Cookie settings" size="sm">
      <div className="space-y-3">
        <SettingRow title="Essential cookies" description="Required for login, security, and workspace routing." action={<Switch checked label="Always on" />} />
        <SettingRow title="Analytics cookies" description="Help us understand performance and reliability." action={<Switch checked={analytics} onChange={setAnalytics} />} />
        <SettingRow title="Personalization cookies" description="Remember richer preferences across devices." action={<Switch checked={personalization} onChange={setPersonalization} />} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={() => onSave(nextMode)}>Save</Button></div>
      </div>
    </Modal>
  );
};

export const ConfirmModal: React.FC<{ title: string; message: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, actionLabel, danger, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{actionLabel}</Button></div>
    </div>
  </Modal>
);

export const PreferencesPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const preferences = useUserPreferencesStore((state) => state.data);
  const hydrate = useUserPreferencesStore((state) => state.hydrate);
  const update = useUserPreferencesStore((state) => state.update);
  const reset = useUserPreferencesStore((state) => state.reset);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

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
      <Section title="Input options">
        <SettingRow title="Use Enter to add a new line" description="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send." action={<Switch checked={Boolean(preferences?.enterAddsNewline)} onChange={(checked) => update({ enterAddsNewline: checked })} />} />
      </Section>
      <Section title="Language & time">
        <SettingRow title="Language" description="Choose the language you want to use osionos in" action={<SelectButton value={preferences?.language ?? 'en-US'} options={[{ value: 'en-US', label: 'English (US)' }, { value: 'fr-FR', label: 'Français' }, { value: 'es-ES', label: 'Español' }, { value: 'de-DE', label: 'Deutsch' }]} onChange={(value) => { changeLanguage(value); update({ language: value }); }}>English (US)</SelectButton>} />
        <SettingRow title="Number format" description="Choose how numbers and currencies are formatted." action={<SelectButton value={preferences?.numberFormat ?? 'default'} options={[{ value: 'default', label: 'Default' }, { value: 'dot', label: '1,000.00' }, { value: 'comma', label: '1.000,00' }, { value: 'space', label: '1 000,00' }]} onChange={(value) => update({ numberFormat: value })}>Default</SelectButton>} />
        <SettingRow title="Always show text direction controls" description="Show left-to-right and right-to-left controls in the editor." action={<Switch checked={Boolean(preferences?.privacy?.textDirectionControls)} onChange={(checked) => update({ privacy: { ...preferences?.privacy, textDirectionControls: checked } })} />} />
        <SettingRow title="Start week" description="This will affect the way your calendars appear in osionos" action={<SelectButton value={preferences?.weekStart ?? 'monday'} options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} onChange={(value) => update({ weekStart: value as 'sunday' | 'monday' })}>Monday</SelectButton>} />
        <SettingRow title="Date format" description="Set the default format for new @date mentions" action={<SelectButton value={preferences?.dateFormat ?? 'relative'} options={[{ value: 'relative', label: 'Relative' }, { value: 'short', label: 'Short' }, { value: 'iso', label: 'ISO' }]} onChange={(value) => update({ dateFormat: value })}>Relative</SelectButton>} />
        <SettingRow title="Set time zone automatically using your location" description="Reminders, notifications, and emails will use your time zone" action={<Switch checked={Boolean(preferences?.autoTimezone)} onChange={(checked) => update({ autoTimezone: checked, timezone: checked ? Intl.DateTimeFormat().resolvedOptions().timeZone : preferences?.timezone })} />} />
        <SettingRow title="Time zone" description="Choose your time zone" action={<SelectButton value={preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} options={timezones} onChange={(value) => update({ timezone: value, autoTimezone: false })}>Time zone</SelectButton>} />
      </Section>
      <Section title="Desktop app">
        <SettingRow title="Open on start" description="Choose what page opens when you start osionos and when you switch workspaces" action={<SelectButton value={desktop?.openOnStart ?? 'last-visited-page'} options={[{ value: 'last-visited-page', label: 'Last visited page' }, { value: 'home', label: 'Home' }, { value: 'new-page', label: 'New page' }]} onChange={(value) => update({ desktop: { ...preferences?.desktop, openOnStart: value } })}>Last visited page</SelectButton>} />
      </Section>
      <Section title="Privacy">
        <SettingRow title="Cookie settings" description="See the Cookie Notice for more information" action={<Button onClick={() => setCookieOpen(true)}>{cookieButtonLabel}</Button>} />
        <SettingRow title="Show my view history" description="People with edit or full access can see when you’ve viewed a page." action={<Switch checked={privacy?.viewHistory ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, viewHistory: checked } })} />} />
        <SettingRow title="Profile discoverability" description="Users who know your email will see your profile when inviting you." action={<Switch checked={privacy?.profileDiscoverability ?? true} onChange={(checked) => update({ privacy: { ...preferences?.privacy, profileDiscoverability: checked } })} />} />
        <Button className="mt-3" onClick={() => setResetOpen(true)}>Reset to defaults</Button>
      </Section>

      {cookieOpen && <CookieSettingsModal mode={cookies?.mode ?? 'customize'} onSave={(mode) => { update({ cookies: { ...preferences?.cookies, mode } }); setCookieOpen(false); }} onClose={() => setCookieOpen(false)} />}
      {resetOpen && <ConfirmModal title="Reset preferences" message="This restores language, theme, input, privacy, and desktop preferences to their defaults." actionLabel="Reset" onConfirm={() => { runAsync(reset(userId)); setResetOpen(false); }} onClose={() => setResetOpen(false)} />}
    </>
  );
};

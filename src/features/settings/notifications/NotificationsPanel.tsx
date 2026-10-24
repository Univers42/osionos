/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotificationsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { usePageStore } from '@/store/usePageStore';
import { useNotificationSettingsStore } from '@/store/settings';
import { Button, Dropdown, Modal, Toggle } from '@/shared/ui';
import { FeatureCard, PanelStatus, Section, SettingRow } from '../ui/settingsKit';
import { runAsync } from '../model/settingsCalls';
import { useSettingsHydration } from '../model/settingsHydration';

type SettingsModalName = 'page-notification-overrides';

interface ActiveSettingsModal {
  name: SettingsModalName;
  payload?: Record<string, unknown>;
}

export const NotificationsPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const settings = useNotificationSettingsStore((state) => state.data);
  const hydrate = useNotificationSettingsStore((state) => state.hydrate);
  const update = useNotificationSettingsStore((state) => state.update);
  const reset = useNotificationSettingsStore((state) => state.reset);
  const [modal, setModal] = useState<ActiveSettingsModal | null>(null);

  const hydration = useSettingsHydration(async () => {
    await hydrate(userId);
    const failure = useNotificationSettingsStore.getState().error;
    if (failure) throw new Error(failure);
  }, [hydrate, userId]);

  const inApp = settings?.inApp as { liveMeetingActivity?: boolean } | undefined;
  const slack = settings?.slack as { mode?: string } | undefined;
  const discord = settings?.discord as { mode?: string } | undefined;
  const email = settings?.email as Record<string, boolean> | undefined;
  const emailRows: Array<[string, string, string | undefined]> = [
    ['Activity in my workspace', 'workspaceActivity', undefined],
    ['Always send email notifications', 'alwaysSend', undefined],
    ['Page updates', 'pageUpdates', 'Get email digests about pages you’ve turned on notifications for'],
    ['Workspace digest', 'workspaceDigest', undefined],
    ['Announcements and update emails', 'announcements', undefined],
  ];

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      <Section title="In-app notifications">
        <FeatureCard icon={<CalendarDays size={16} />} title="Live meeting activity" description="Join video conferencing and start transcribing. Meeting is being transcribed and summarized." action={<Toggle checked={inApp?.liveMeetingActivity ?? true} onChange={(checked) => update({ inApp: { ...settings?.inApp, liveMeetingActivity: checked } })} label="Live meeting activity" />} />
      </Section>
      <Section title="Slack notifications"><SettingRow title="Slack notifications" description="Get Slack notifications about activity in your osionos workspace" action={<Dropdown label="Slack notifications" value={slack?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ slack: { ...settings?.slack, mode: value } })} align="end" width="auto" />} /></Section>
      <Section title="Discord notifications"><SettingRow title="Discord notifications" description="Get Discord notifications about activity in your osionos workspace" action={<Dropdown label="Discord notifications" value={discord?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ discord: { ...settings?.discord, mode: value } })} align="end" width="auto" />} /></Section>
      <Section title="Email notifications">
        {emailRows.map(([label, key, description]) => (
          <SettingRow key={label} title={label} description={description} action={<Toggle checked={email?.[key] ?? key !== 'alwaysSend'} onChange={(checked) => update({ email: { ...settings?.email, [key]: checked } })} label={label} />} />
        ))}
        <Button className="mt-3" onClick={() => reset(userId)}>Reset to defaults</Button>
        <Button tone="ghost" className="mt-3" onClick={() => setModal({ name: 'page-notification-overrides' })}>Manage settings</Button>
      </Section>
      {modal?.name === 'page-notification-overrides' && <PageNotificationOverridesModal onClose={() => setModal(null)} />}
    </PanelStatus>
  );
};

// A page notifies by default unless it is private; an override is stored only
// when the person's choice differs from that default, so turning it back drops it.
function notifiesByDefault(page: { visibility?: string }): boolean {
  return page.visibility !== 'private';
}

const PageNotificationOverridesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const pages = usePageStore(useShallow((state) => Object.values(state.pages).flat().slice(0, 8)));
  const overrides = useNotificationSettingsStore((state) => state.data?.perPageOverrides);
  const updatePageOverride = useNotificationSettingsStore((state) => state.updatePageOverride);
  const deletePageOverride = useNotificationSettingsStore((state) => state.deletePageOverride);

  function isNotified(page: { _id: string; visibility?: string }): boolean {
    const override = overrides?.find((item) => item.pageId === page._id);
    return typeof override?.notify === 'boolean' ? override.notify : notifiesByDefault(page);
  }

  function setNotified(page: { _id: string; visibility?: string }, checked: boolean) {
    if (checked === notifiesByDefault(page)) runAsync(deletePageOverride(page._id));
    else runAsync(updatePageOverride(page._id, { notify: checked }));
  }

  return (
    <Modal open onClose={onClose} title="Page notification settings" size="md">
      <div className="space-y-2 p-6">
        {pages.length === 0 ? <p className="text-sm text-[var(--osio-fg-muted)]">No pages available yet.</p> : pages.map((page) => (
          <SettingRow key={page._id} title={page.title || 'Untitled'} description={page.updatedAt ? new Date(page.updatedAt).toLocaleString() : 'No updates yet'} action={<Toggle checked={isNotified(page)} onChange={(checked) => setNotified(page, checked)} label={`Notify me about ${page.title || 'Untitled'}`} />} />
        ))}
        <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
};

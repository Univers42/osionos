/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NotificationsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '@osionos/ui/primitives';
import { usePageStore } from '@/store/usePageStore';
import { useNotificationSettingsStore } from '@/store/settings';
import {
  Button,
  FeatureCard,
  runAsync,
  Section,
  SelectButton,
  SettingRow,
  Switch,
} from './settingsUiComponents';

export const PageNotificationOverridesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const pages = usePageStore(useShallow((state) => Object.values(state.pages).flat().slice(0, 8)));
  const [enabledIds, setEnabledIds] = useState(() => new Set(pages.filter((page) => page.visibility !== 'private').map((page) => page._id)));
  return (
    <Modal open onClose={onClose} title="Page notification settings" size="md">
      <div className="space-y-2">
        {pages.length === 0 ? <p className="text-sm text-[var(--osio-fg-muted)]">No pages available yet.</p> : pages.map((page) => (
          <SettingRow key={page._id} title={page.title || 'Untitled'} description={page.updatedAt ? new Date(page.updatedAt).toLocaleString() : 'No updates yet'} action={<Switch checked={enabledIds.has(page._id)} onChange={(checked) => setEnabledIds((current) => { const next = new Set(current); if (checked) { next.add(page._id); } else { next.delete(page._id); } return next; })} />} />
        ))}
        <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
};

export const NotificationsPanel: React.FC<{ activeUserId: string }> = ({ activeUserId }) => {
  const userId = activeUserId || 'anonymous';
  const settings = useNotificationSettingsStore((state) => state.data);
  const hydrate = useNotificationSettingsStore((state) => state.hydrate);
  const update = useNotificationSettingsStore((state) => state.update);
  const reset = useNotificationSettingsStore((state) => state.reset);
  const [overridesOpen, setOverridesOpen] = useState(false);

  useEffect(() => {
    runAsync(hydrate(userId));
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
    <>
      <Section title="In-app notifications">
        <FeatureCard icon={<CalendarDays size={16} />} title="Live meeting activity" description="Join video conferencing and start transcribing. Meeting is being transcribed and summarized." action={<Switch checked={inApp?.liveMeetingActivity ?? true} onChange={(checked) => update({ inApp: { ...settings?.inApp, liveMeetingActivity: checked } })} />} />
      </Section>
      <Section title="Slack notifications"><SettingRow title="Slack notifications" description="Get Slack notifications about activity in your osionos workspace" action={<SelectButton value={slack?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ slack: { ...settings?.slack, mode: value } })}>Off</SelectButton>} /></Section>
      <Section title="Discord notifications"><SettingRow title="Discord notifications" description="Get Discord notifications about activity in your osionos workspace" action={<SelectButton value={discord?.mode ?? 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'mentions', label: 'Mentions only' }, { value: 'all', label: 'All activity' }]} onChange={(value) => update({ discord: { ...settings?.discord, mode: value } })}>Off</SelectButton>} /></Section>
      <Section title="Email notifications">
        {emailRows.map(([label, key, description]) => (
          <SettingRow key={label} title={label} description={description} action={<Switch checked={email?.[key] ?? key !== 'alwaysSend'} onChange={(checked) => update({ email: { ...settings?.email, [key]: checked } })} />} />
        ))}
        <Button className="mt-3" onClick={() => reset(userId)}>Reset to defaults</Button>
        <Button tone="ghost" className="mt-3" onClick={() => setOverridesOpen(true)}>Manage settings</Button>
      </Section>
      {overridesOpen && <PageNotificationOverridesModal onClose={() => setOverridesOpen(false)} />}
    </>
  );
};

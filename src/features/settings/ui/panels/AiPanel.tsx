/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiPanel.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 20:35:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 20:35:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { useUserStore } from '@/features/auth';
import { recordSettingsAction, useAiSettingsStore } from '@/store/settings';
import {
  Button,
  FeatureCard,
  Section,
  SettingRow,
  Switch,
} from './settingsUiComponents';

export const AiPanel = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useAiSettingsStore((state) => state.getData(workspaceId));
  const update = useAiSettingsStore((state) => state.update);
  return (
    <Section title="osionos AI">
      <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Search everywhere, automate meeting notes, create summaries, and run agents." action={<Button tone="primary" onClick={() => { update(workspaceId, { connectors: true, searchEverywhereIndexing: true }); recordSettingsAction('ai_upgrade_click', { workspaceId }); }}>Upgrade</Button>} />
      <SettingRow title="AI connectors" description="Let AI search connected tools from this workspace." action={<Switch checked={settings.connectors} onChange={(checked) => update(workspaceId, { connectors: checked })} />} />
      <SettingRow title="Meeting notes auto-record" description="Automatically record and summarize meetings when available." action={<Switch checked={settings.meetingNotesAutoRecord} onChange={(checked) => update(workspaceId, { meetingNotesAutoRecord: checked })} />} />
      <SettingRow title="Agents" description="Enable workspace agents." action={<Switch checked={settings.agentsEnabled} onChange={(checked) => update(workspaceId, { agentsEnabled: checked })} />} />
      <SettingRow title="Custom agents" description="Allow members to create custom agents." action={<Switch checked={settings.customAgentsAllowed} onChange={(checked) => update(workspaceId, { customAgentsAllowed: checked })} />} />
      <SettingRow title="Search everywhere indexing" description="Index pages and connected content for AI answers." action={<Switch checked={settings.searchEverywhereIndexing} onChange={(checked) => update(workspaceId, { searchEverywhereIndexing: checked })} />} />
      <SettingRow title="Summaries" description="Generate page and meeting summaries." action={<Switch checked={settings.summaries} onChange={(checked) => update(workspaceId, { summaries: checked })} />} />
    </Section>
  );
};

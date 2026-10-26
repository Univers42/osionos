/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiPanel.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { Sparkles } from 'lucide-react';

import { useUserStore } from '@/features/auth';
import { useAiSettingsStore } from '@/store/settings';
import { Button, Toggle } from '@/shared/ui';
import { isAiConfigured } from '@/features/ai/api/aiClient';
import { FeatureCard, Section, SettingRow } from '../ui/settingsKit';
import { openSettings } from '../model/settingsNav';
import { SentimentSection } from './SentimentSection';

export const AiPanel = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useAiSettingsStore((state) => state.getData(workspaceId));
  const update = useAiSettingsStore((state) => state.update);
  return (
    <Section title="osionos AI">
      <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">These switches are kept on this device.</p>
      <FeatureCard className="mb-3" icon={<Sparkles size={16} />} title="osionos AI" description="Search everywhere, automate meeting notes, create summaries, and run agents." action={<Button tone="primary" onClick={() => openSettings('plans')}>Upgrade</Button>} />
      <SettingRow title="Account context" description="Lets the assistant know your name, workspace, role, what you have open (page, tabs, panel) and the titles of the pages you can read. It is sent to the AI model you chose with each message." action={<Toggle checked={settings.accountContext ?? true} onChange={(checked) => update(workspaceId, { accountContext: checked })} label="Account context" />} />
      <SettingRow title="AI connectors" description="Let AI search connected tools from this workspace." action={<Toggle checked={settings.connectors} onChange={(checked) => update(workspaceId, { connectors: checked })} label="AI connectors" />} />
      <SettingRow title="Meeting notes auto-record" description="Automatically record and summarize meetings when available." action={<Toggle checked={settings.meetingNotesAutoRecord} onChange={(checked) => update(workspaceId, { meetingNotesAutoRecord: checked })} label="Meeting notes auto-record" />} />
      <SettingRow title="Agents" description="Enable workspace agents." action={<Toggle checked={settings.agentsEnabled} onChange={(checked) => update(workspaceId, { agentsEnabled: checked })} label="Agents" />} />
      <SettingRow title="Custom agents" description="Allow members to create custom agents." action={<Toggle checked={settings.customAgentsAllowed} onChange={(checked) => update(workspaceId, { customAgentsAllowed: checked })} label="Custom agents" />} />
      <SettingRow title="Search everywhere indexing" description="Index pages and connected content for AI answers." action={<Toggle checked={settings.searchEverywhereIndexing} onChange={(checked) => update(workspaceId, { searchEverywhereIndexing: checked })} label="Search everywhere indexing" />} />
      <SettingRow title="Summaries" description="Generate page and meeting summaries." action={<Toggle checked={settings.summaries} onChange={(checked) => update(workspaceId, { summaries: checked })} label="Summaries" />} />
      {isAiConfigured() && workspaceId !== 'local-workspace' && <SentimentSection key={workspaceId} workspaceId={workspaceId} />}
    </Section>
  );
};

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

// The per-device AI switches and the sentiment section, rendered by Settings › AI. The Hub's
// "Context & privacy" section renders AccountContextToggle and SentimentSection only: the other switches change no behaviour.
import { useUserStore } from '@/features/auth';
import { useAiSettingsStore } from '@/store/settings';
import { Toggle } from '@/shared/ui';
import { isAiConfigured } from '@/features/ai/api/aiClient';
import { SettingRow } from '../ui/settingsKit';
import { AccountContextToggle } from './AccountContextToggle';
import { SentimentSection } from './SentimentSection';

export const AiSwitches = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? 'local-workspace');
  const settings = useAiSettingsStore((state) => state.getData(workspaceId));
  const update = useAiSettingsStore((state) => state.update);
  return (
    <>
      <AccountContextToggle />
      <SettingRow title="AI connectors" description="Let AI search connected tools from this workspace." action={<Toggle checked={settings.connectors} onChange={(checked) => update(workspaceId, { connectors: checked })} label="AI connectors" />} />
      <SettingRow title="Meeting notes auto-record" description="Automatically record and summarize meetings when available." action={<Toggle checked={settings.meetingNotesAutoRecord} onChange={(checked) => update(workspaceId, { meetingNotesAutoRecord: checked })} label="Meeting notes auto-record" />} />
      <SettingRow title="Agents" description="Enable workspace agents." action={<Toggle checked={settings.agentsEnabled} onChange={(checked) => update(workspaceId, { agentsEnabled: checked })} label="Agents" />} />
      <SettingRow title="Custom agents" description="Allow members to create custom agents." action={<Toggle checked={settings.customAgentsAllowed} onChange={(checked) => update(workspaceId, { customAgentsAllowed: checked })} label="Custom agents" />} />
      <SettingRow title="Search everywhere indexing" description="Index pages and connected content for AI answers." action={<Toggle checked={settings.searchEverywhereIndexing} onChange={(checked) => update(workspaceId, { searchEverywhereIndexing: checked })} label="Search everywhere indexing" />} />
      <SettingRow title="Summaries" description="Generate page and meeting summaries." action={<Toggle checked={settings.summaries} onChange={(checked) => update(workspaceId, { summaries: checked })} label="Summaries" />} />
      {isAiConfigured() && workspaceId !== 'local-workspace' && <SentimentSection key={workspaceId} workspaceId={workspaceId} />}
    </>
  );
};

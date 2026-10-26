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

import { Button } from '@/shared/ui';
import { openAiHub } from '@/features/ai/model/aiHubNav';
import { FeatureCard, Section, SettingRow } from '../ui/settingsKit';
import { openSettings } from '../model/settingsNav';
import { AiSwitches } from './AiSwitches';

export const AiPanel = () => (
  <Section title="osionos AI">
    <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">These switches are kept on this device.</p>
    <FeatureCard className="mb-3" icon={<Sparkles size={16} />} title="osionos AI" description="Search everywhere, automate meeting notes, create summaries, and run agents." action={<Button tone="primary" onClick={() => openSettings('plans')}>Upgrade</Button>} />
    <SettingRow title="AI Hub" description="Service status, the model that answers, today's spend and every AI setting in one place." action={<Button onClick={() => openAiHub("overview")}>Open the AI Hub</Button>} />
    <AiSwitches />
  </Section>
);

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

// Settings › osionos AI: status, spend, the switches, routing and what a message sends.
// Every anchor renders on first paint, whatever the service state: the view scrolls to
// an anchor once, right after the panel renders, and never retries.
import { Sparkles } from 'lucide-react';

import { Button } from '@/shared/ui';
import { FeatureCard, Section } from '../ui/settingsKit';
import { openSettings } from '../model/settingsNav';
import { AiOverview, AiUsage } from './AiOverview';
import { AiRoutingSection } from './AiRoutingSection';
import { AiSwitches } from './AiSwitches';
import { OutgoingContextSection } from './OutgoingContextSection';

export const AiPanel = () => (
  <>
    <Section title="Overview" anchor="ai-overview"><AiOverview /></Section>
    <Section title="Usage" anchor="ai-usage"><AiUsage /></Section>
    <Section title="osionos AI">
      <p className="mb-3 text-sm text-[var(--osio-fg-muted)]">These switches are kept on this device.</p>
      <FeatureCard className="mb-3" icon={<Sparkles size={16} />} title="osionos AI" description="Search everywhere, automate meeting notes, create summaries, and run agents." action={<Button tone="primary" onClick={() => openSettings('plans')}>Upgrade</Button>} />
      <AiSwitches />
    </Section>
    <Section title="Routing" anchor="ai-routing"><AiRoutingSection /></Section>
    <OutgoingContextSection />
  </>
);

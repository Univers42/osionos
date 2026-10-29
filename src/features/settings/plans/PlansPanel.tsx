/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlansPanel.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

import { useBillingStore, type BillingState } from '@/store/settings';
import { defaultBillingState } from '@/store/settings/defaults';
import { Button, Modal, useToastStore } from '@/shared/ui';
import { FeatureCard, PanelStatus, Section } from '../ui/settingsKit';
import { useSettingsHydration } from '../model/settingsHydration';

const faq = [
  ['Plans, billing & payment', 'Plans are set per workspace, and payment details live in the Billing section.'],
  ['Message support', 'Support requests are not handled inside the app yet.'],
];

export const PlansPanel: React.FC<{ workspaceId?: string }> = ({ workspaceId = 'local-workspace' }) => {
  const storedBilling = useBillingStore((state) => state.data[workspaceId]);
  const hydrate = useBillingStore((state) => state.hydrate);
  const update = useBillingStore((state) => state.update);
  const fallbackBilling = useMemo<BillingState>(() => defaultBillingState(workspaceId), [workspaceId]);
  const billing = storedBilling ?? fallbackBilling;
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const plans = [
    ['Free', 'Basic forms, basic sites, custom databases, osionos Calendar, osionos Mail'],
    ['Plus', 'Everything in Free, unlimited blocks, unlimited charts, custom forms, custom sites'],
    ['Business', 'Popular · osionos Agent, Custom Agents, AI Meeting Notes, database permissions, SAML SSO'],
    ['Enterprise', 'AI analytics, zero data retention, SCIM, audit log, domain management'],
  ];

  // The store keeps a failed read in `error` instead of rejecting, so it is turned back into a rejection here.
  const hydration = useSettingsHydration(async () => {
    await hydrate(workspaceId);
    const failure = useBillingStore.getState().error[workspaceId];
    if (failure) throw new Error(failure);
  }, [hydrate, workspaceId]);

  return (
    <PanelStatus status={hydration.status} error={hydration.error} onRetry={hydration.retry}>
      <FeatureCard title="Your current plan" description={billing.plan} action={<Check size={18} className="text-[var(--osio-accent)]" />} />
      <FeatureCard icon={<Sparkles size={16} />} title="osionos AI" description="Upgrade to search everywhere, automate meeting notes & more" action={<Button tone="primary" onClick={() => setUpgradePlan('AI')}>Upgrade</Button>} />
      <Section title="Compare all plans"><div className="grid gap-3 md:grid-cols-2">{plans.map(([name, description]) => <div key={name} className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-[var(--osio-fg-default)]">{name}</h4>{name !== 'Free' && <span className="text-xs text-[var(--osio-fg-muted)]">billed monthly</span>}</div><p className="mt-3 text-sm leading-5 text-[var(--osio-fg-muted)]">{description}</p><Button className="mt-4 w-full" onClick={() => setUpgradePlan(name)}>Upgrade</Button></div>)}</div></Section>
      <Section title="FAQ">{faq.map(([question, answer]) => <details key={question} className="border-t border-[var(--osio-border-default)] py-3"><summary className="cursor-pointer text-sm font-medium text-[var(--osio-fg-default)]">{question}</summary><p className="mt-2 text-sm leading-[18px] text-[var(--osio-fg-muted)]">{answer}</p></details>)}</Section>
      {upgradePlan && <UpgradePlanModal plan={upgradePlan} onConfirm={() => { update(workspaceId, { plan: upgradePlan }); useToastStore.getState().push({ kind: 'success', title: `Plan set to ${upgradePlan} on this device.` }); setUpgradePlan(null); }} onClose={() => setUpgradePlan(null)} />}
    </PanelStatus>
  );
};

const UpgradePlanModal: React.FC<{ plan: string; onConfirm: () => void; onClose: () => void }> = ({ plan, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title="Upgrade plan" size="sm">
    <div className="space-y-4 p-6">
      <p className="text-sm text-[var(--osio-fg-muted)]">Upgrade this workspace to {plan}.</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" onClick={onConfirm}>Upgrade</Button></div>
    </div>
  </Modal>
);

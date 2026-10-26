import React from "react";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { readAiSelection } from "@/features/ai/model/aiSelection";
import { ModelCard, ServiceCard, SpendCard } from "./HubCards";
import { useHealth, useUsage } from "./useHubData";

export const HubOverview: React.FC = () => {
  const configured = isAiConfigured();
  const health = useHealth();
  const usage = useUsage();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ServiceCard configured={configured} health={health} />
      <ModelCard selection={readAiSelection()} />
      <div className="sm:col-span-2"><SpendCard configured={configured} usage={usage} /></div>
    </div>
  );
};

export const HubUsageSection: React.FC = () => {
  const usage = useUsage();
  return (
    <div className="space-y-3">
      <SpendCard configured={isAiConfigured()} usage={usage} large />
      <p className="text-sm text-[var(--osio-fg-muted)]">Spending resets at midnight UTC</p>
    </div>
  );
};

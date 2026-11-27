// Settings › osionos AI: the service and model at a glance, and today's spend. Spend is
// shown once, in Usage: the Overview drew it too, and each copy asked the service again.
import React from "react";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { readAiSelection } from "@/features/ai/model/aiSelection";
import { ModelCard, ServiceCard, SpendCard } from "./AiStatusCards";
import { useHealth, useUsage } from "./useAiStatus";

export const AiOverview: React.FC = () => (
  <div className="grid gap-3 sm:grid-cols-2">
    <ServiceCard configured={isAiConfigured()} health={useHealth()} />
    <ModelCard selection={readAiSelection()} />
  </div>
);

export const AiUsage: React.FC = () => {
  const usage = useUsage();
  return (
    <div className="space-y-3">
      <SpendCard configured={isAiConfigured()} usage={usage} large />
      <p className="text-sm text-[var(--osio-fg-muted)]">Spending resets at midnight UTC</p>
    </div>
  );
};

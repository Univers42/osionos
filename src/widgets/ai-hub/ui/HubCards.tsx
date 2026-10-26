// Pure cards of the AI Hub Overview: props in, markup out, so each state is testable
// without a network. The data comes from useHubData.
import React from "react";
import { formatMicroUsd } from "@/features/settings/ai/aiUsageFormat";
import type { AiSelection } from "@/features/ai/model/aiSelection";

export type Loadable<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

export interface HubHealth { ok: boolean; db: boolean; redis: boolean }
export interface HubUsage { spentMicroUsd: number; limitMicroUsd: number }

const CARD = "rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4";

export const HubCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className={CARD}>
    <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">{title}</h3>
    <div className="mt-2 text-sm text-[var(--osio-fg-default)]">{children}</div>
  </div>
);

const COULD_NOT_LOAD = "Could not load";

function healthLine(health: HubHealth): string {
  if (health.ok) return "Working";
  const failing = [!health.db && "database", !health.redis && "cache"].filter(Boolean).join(" and ");
  return failing ? `Not reachable (${failing})` : "Not reachable";
}

export const ServiceCard: React.FC<{ configured: boolean; health: Loadable<HubHealth> }> = ({ configured, health }) => {
  let line: string;
  if (!configured) line = "The AI service is not configured on this build";
  else if (health.state === "loading") line = "Checking…";
  else if (health.state === "failed") line = COULD_NOT_LOAD;
  else line = healthLine(health.value);
  return <HubCard title="Service"><span data-testid="hub-service">{line}</span></HubCard>;
};

export const ModelCard: React.FC<{ selection: AiSelection | null }> = ({ selection }) => (
  <HubCard title="Model">
    <div>{selection?.model ? selection.model : "Automatic"}</div>
    <div className="text-xs text-[var(--osio-fg-muted)]">
      {selection ? `Connection: ${selection.connectionId}` : "Connection: platform default"}
    </div>
  </HubCard>
);

export const SpendMeter: React.FC<{ usage: HubUsage; large?: boolean }> = ({ usage, large = false }) => (
  <div className="space-y-1.5">
    <div className={large ? "text-2xl font-semibold" : "text-base font-medium"}>
      {formatMicroUsd(usage.spentMicroUsd, "en-US")} of {formatMicroUsd(usage.limitMicroUsd, "en-US")} today
    </div>
    <meter
      className={`w-full ${large ? "h-4" : "h-2"}`}
      min={0}
      max={usage.limitMicroUsd}
      value={Math.min(usage.spentMicroUsd, usage.limitMicroUsd)}
      aria-label="Spent today"
    />
  </div>
);

export const SpendCard: React.FC<{ configured: boolean; usage: Loadable<HubUsage>; large?: boolean }> = ({ configured, usage, large }) => {
  let body: React.ReactNode;
  if (!configured) body = "The AI service is not configured on this build";
  else if (usage.state === "loading") body = "Loading…";
  else if (usage.state === "failed") body = COULD_NOT_LOAD;
  else body = <SpendMeter usage={usage.value} large={large} />;
  return <HubCard title="Spent today">{body}</HubCard>;
};

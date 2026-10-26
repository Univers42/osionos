import React, { useEffect, useState } from "react";
import { isAiConfigured, listConnections, listProviders } from "@/features/ai/api/aiClient";
import type { AiConnection, AiProvider } from "@/features/ai/api/aiContract";
import { readAiSelection } from "@/features/ai/model/aiSelection";
import { outgoingContext, recipientOf, type OutgoingRow } from "@/features/ai/model/outgoingContext";
import { useUserStore } from "@/features/auth";
import { AccountContextToggle, useAccountContext } from "@/features/settings/ai/AccountContextToggle";
import { WebAccessRow } from "@/features/settings/ai/WebAccessRow";
import { SentimentSection } from "@/features/settings/ai/SentimentSection";
import { Section, SettingRow } from "@/features/settings/ui/settingsKit";

function marker(row: OutgoingRow): string {
  if (!row.sent) return "Not sent";
  return row.conditional ? "When used" : "Sent";
}

const Row: React.FC<{ row: OutgoingRow }> = ({ row }) => (
  <SettingRow
    title={row.label}
    description={row.detail}
    action={
      <span
        data-testid={`outgoing-${row.id}`}
        className={`text-xs font-medium ${row.sent ? "text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]"}`}
      >
        {marker(row)}
      </span>
    }
  />
);

// The connection names come from the service; without it the platform is the only recipient.
function useRecipientData(): { connections: AiConnection[]; providers: AiProvider[] } {
  const [data, setData] = useState<{ connections: AiConnection[]; providers: AiProvider[] }>({ connections: [], providers: [] });
  useEffect(() => {
    if (!isAiConfigured()) return;
    let live = true;
    Promise.all([listConnections(), listProviders()])
      .then(([connections, providers]) => { if (live) setData({ connections, providers }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  return data;
}

export const HubPrivacySection: React.FC = () => {
  const [accountContext] = useAccountContext();
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "local-workspace");
  const { connections, providers } = useRecipientData();
  const selection = readAiSelection();
  const recipient = recipientOf(selection, connections, providers);
  return (
    <div className="space-y-8">
      <Section title="What your next message sends">
        <p data-testid="outgoing-recipient" className="text-sm font-medium text-[var(--osio-fg-default)]">{recipient.text}</p>
        {outgoingContext({ accountContext, selection }).map((row) => <Row key={row.id} row={row} />)}
      </Section>
      <Section title="Controls">
        <AccountContextToggle />
        {isAiConfigured() && workspaceId !== "local-workspace" && <WebAccessRow key={workspaceId} workspaceId={workspaceId} />}
      </Section>
      {/* The sentiment opt-in is a real server-side switch, unlike the other device switches. */}
      {isAiConfigured() && workspaceId !== "local-workspace" && <SentimentSection key={workspaceId} workspaceId={workspaceId} />}
    </div>
  );
};

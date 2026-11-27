// Settings › osionos AI: what the next message carries, and to whom. The switches that
// change it (account context, web access, sentiment) are AiSwitches' rows, drawn once.
import React, { useEffect, useState } from "react";
import { isAiConfigured, listConnections, listProviders } from "@/features/ai/api/aiClient";
import type { AiConnection, AiProvider } from "@/features/ai/api/aiContract";
import { readAiSelection } from "@/features/ai/model/aiSelection";
import { outgoingContext, recipientOf, type OutgoingRow } from "@/features/ai/model/outgoingContext";
import { Section, SettingRow } from "../ui/settingsKit";
import { useAccountContext } from "./AccountContextToggle";

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

export const OutgoingContextSection: React.FC = () => {
  const [accountContext] = useAccountContext();
  const { connections, providers } = useRecipientData();
  const selection = readAiSelection();
  const recipient = recipientOf(selection, connections, providers);
  return (
    <Section title="What your next message sends" anchor="ai-privacy">
      <p data-testid="outgoing-recipient" className="text-sm font-medium text-[var(--osio-fg-default)]">{recipient.text}</p>
      {outgoingContext({ accountContext, selection }).map((row) => <Row key={row.id} row={row} />)}
    </Section>
  );
};

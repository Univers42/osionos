/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DeveloperPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Developer: the owner's personal access tokens. Listing, creating and
// revoking go through patApi (the bridge's /api/account/tokens routes); the vocabulary
// the create dialog offers is the catalog that list call returns.

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/shared/ui";
import { ConfirmModal } from "@/features/settings/ui/ConfirmModals";
import { DataTable, EmptyState, PanelStatus, Section, SettingRow, type PanelStatusState } from "@/features/settings/ui/settingsKit";

import { CreateTokenModal } from "./CreateTokenModal";
import { listTokens, revokeAllTokens, revokeToken } from "./patApi";
import { dateLabel, expiryLabel, kindLabel, patErrorMessage, permissionSummary, type PatCatalog, type PatToken } from "./patModel";

const HEADERS = ["Name", "Kind", "Permissions", "Created", "Expires", "Actions"];
const NO_CATALOG: PatCatalog = { resources: {}, permissions: [] };

function failureOf(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  return patErrorMessage(code, error instanceof Error ? error.message : "");
}

export const DeveloperPanel: React.FC = () => {
  const [status, setStatus] = useState<PanelStatusState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<PatToken[]>([]);
  const [catalog, setCatalog] = useState<PatCatalog>(NO_CATALOG);
  const [creating, setCreating] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<PatToken | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const loaded = await listTokens();
      setTokens(loaded.tokens.filter((token) => token.revokedAt === null));
      setCatalog(loaded.catalog);
      setStatus("ready");
    } catch (failure) {
      setError(failureOf(failure));
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The row keeps the message after the dialog closes; the dialog rethrows so it stays open.
  async function revokeAndForget(token: PatToken, revoke: () => Promise<void>) {
    try {
      await revoke();
    } catch (failure) {
      const message = failureOf(failure);
      setRowErrors((current) => ({ ...current, [token.id]: message }));
      throw new Error(message);
    }
    setRowErrors(({ [token.id]: _gone, ...rest }) => rest);
    setTokens((current) => current.filter((item) => item.id !== token.id));
  }

  const rows = tokens.map((token) => [
    <span key={token.id} className="block truncate font-medium">
      {token.name}
      {rowErrors[token.id] && <span role="alert" className="mt-0.5 block text-xs font-normal text-[var(--osio-danger)]">{rowErrors[token.id]}</span>}
    </span>,
    kindLabel(token.kind),
    <span key="permissions" className="block break-words">{permissionSummary(token)}</span>,
    dateLabel(token.createdAt),
    <span key="expires" title={dateLabel(token.expiresAt)}>{expiryLabel(token.expiresAt)}</span>,
    <IconButton key="revoke" label={`Revoke ${token.name}`} tone="danger" onClick={() => setPendingRevoke(token)}><Trash2 size={16} /></IconButton>,
  ]);

  return (
    <div className="space-y-6">
      <Section title="Personal access tokens" anchor="personal-access-tokens">
        <SettingRow
          title="Tokens act as you"
          description="Use one in a script or an app instead of your password. You see a token only once, when you create it."
          action={<Button tone="primary" onClick={() => setCreating(true)} disabled={status !== "ready"}><Plus size={16} />New token</Button>}
        />
        <PanelStatus status={status} error={error} onRetry={() => void load()}>
          {tokens.length === 0 ? (
            <EmptyState icon={<KeyRound size={16} />} title="No personal access tokens yet." hint="A token lets a script or an app call osionos as you, with only the permissions you give it." />
          ) : (
            <>
              <DataTable headers={HEADERS} rows={rows} />
              <div className="mt-3 flex justify-end">
                <Button tone="danger" onClick={() => setConfirmingAll(true)}>Revoke all tokens</Button>
              </div>
            </>
          )}
        </PanelStatus>
      </Section>
      {creating && <CreateTokenModal catalog={catalog} onClose={() => setCreating(false)} onCreated={(token) => setTokens((current) => [token, ...current])} />}
      {pendingRevoke && (
        <ConfirmModal
          title="Revoke token"
          message={`Revoke ${pendingRevoke.name}? Apps using it will stop working immediately.`}
          actionLabel="Revoke"
          danger
          onConfirm={() => revokeAndForget(pendingRevoke, () => revokeToken(pendingRevoke.id))}
          onClose={() => setPendingRevoke(null)}
        />
      )}
      {confirmingAll && (
        <ConfirmModal
          title="Revoke all tokens"
          message="Revoke every personal access token? Every app using one will stop working immediately."
          actionLabel="Revoke all"
          danger
          onConfirm={async () => { await revokeAllTokens(); await load(); }}
          onClose={() => setConfirmingAll(false)}
        />
      )}
    </div>
  );
};

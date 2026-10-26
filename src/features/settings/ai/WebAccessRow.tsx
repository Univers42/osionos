/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WebAccessRow.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * "Allow web access": the switch of a workspace for the assistant's web tools.
 *
 * It is drawn from what the SERVER says. A 404 (the feature is off on this
 * deployment, or the caller is no member) draws nothing. Changing the switch
 * never writes: it opens a confirm step that shows the disclosure, and only
 * the confirm button sends the PUT, with `acknowledged: true`. The confirm is
 * in the page, not `window.confirm`.
 */

import React, { useState } from "react";

import { useWebSettings } from "@/features/ai/model/useWebSettings";
import { saveWebAccess, WEB_DISCLOSURE, type WebSettingsView } from "@/features/ai/model/webSettings";
import { Button, Toggle } from "@/shared/ui";
import { SettingRow } from "../ui/settingsKit";
import { MCP_TEXT_DANGER_XS, SWITCH_NOTE } from "./aiPanelClasses";

export interface WebAccessRowProps {
  view: WebSettingsView;
  /** The value the reader asked for and has not confirmed yet, or null. */
  asking: boolean | null;
  busy: boolean;
  /** The refusal of the last save, in words. */
  error: string;
  onToggle: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The row. Pure: the view goes in, markup comes out. */
export const WebAccessRowView: React.FC<WebAccessRowProps> = ({ view, asking, busy, error, onToggle, onConfirm, onCancel }) => {
  if (view.status === "off") return null;
  const ready = view.status === "ready";
  const confirm =
    asking === null ? null : (
      <div role="group" aria-label="Confirm web access" data-testid="web-access-confirm" className="w-full space-y-2 pb-3">
        <p className={SWITCH_NOTE}>{asking ? WEB_DISCLOSURE : "Turn web access off for this workspace?"}</p>
        <div className="flex gap-2">
          <Button tone="primary" disabled={busy} onClick={onConfirm}>
            {asking ? "Allow web access" : "Turn off"}
          </Button>
          <Button tone="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    );
  return (
    <>
      <SettingRow
        title="Allow web access"
        description="Let the assistant search the web and read pages, when a member turns it on for a message"
        action={
          <>
            {view.status === "failed" ? <span role="status" className={SWITCH_NOTE}>Could not load</span> : null}
            <Toggle checked={ready && view.enabled} disabled={!ready || busy} onChange={onToggle} label="Allow web access" />
          </>
        }
      />
      {confirm}
      {error ? <p role="alert" data-testid="web-access-error" className={MCP_TEXT_DANGER_XS}>{error}</p> : null}
    </>
  );
};

/** The row of a workspace, wired to the server. */
export const WebAccessRow: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { view, set } = useWebSettings(workspaceId);
  const [asking, setAsking] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (asking === null) return;
    setBusy(true);
    const result = await saveWebAccess(workspaceId, asking);
    setBusy(false);
    if (result.ok) {
      set({ status: "ready", enabled: result.enabled });
      setError("");
    } else {
      setError(result.words);
    }
    setAsking(null);
  };

  return (
    <WebAccessRowView
      view={view}
      asking={asking}
      busy={busy}
      error={error}
      onToggle={(next) => { setError(""); setAsking(next); }}
      onConfirm={() => void confirm()}
      onCancel={() => setAsking(null)}
    />
  );
};

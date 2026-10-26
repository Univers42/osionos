/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpServersSection.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI — "Your MCP servers": register a server, discover its tools,
 * switch them on one by one.
 *
 * Nothing here gives a tool to a run on its own: a tool is off until the user
 * turns it on, and every call still waits for an approval. When the list
 * answers 404 the feature is off on this deployment and the part renders
 * nothing (C288).
 */

import React, { useCallback, useEffect, useState } from "react";

import {
  createMcpServer,
  deleteMcpServer,
  discoverMcpServer,
  isAiConfigured,
  listMcpServers,
  setMcpToolEnabled,
  updateMcpServer,
  type AiMcpServer,
} from "@/features/ai/api/aiClient";
import {
  BREAKER_MS,
  isMcpOff,
  mcpFailureMessage,
  type McpFormInput,
} from "@/features/ai/model/mcpServerForm";
import { createBodyOf, McpServerForm, patchBodyOf } from "./McpServerForm";
import { McpServerList, type McpRowActions } from "./McpServerRows";
import { MCP_TEXT_DANGER_SM, MCP_TEXT_MUTED_SM, MCP_TITLE } from "./aiPanelClasses";
import { Button } from "@/shared/ui";

type Editing = { kind: "add" } | { kind: "edit"; id: string } | null;

/** Your MCP servers: the list, and the form that adds or edits one. */
export const McpServersSection: React.FC = () => {
  const [servers, setServers] = useState<AiMcpServer[]>([]);
  const [off, setOff] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [changed, setChanged] = useState<Record<string, string[]>>({});
  const [retryAt, setRetryAt] = useState<Record<string, Date>>({});

  const refresh = useCallback(async () => {
    try {
      setServers(await listMcpServers());
    } catch (failure) {
      if (isMcpOff(failure)) setOff(true);
      else setError(mcpFailureMessage(failure));
    }
  }, []);

  useEffect(() => {
    if (!isAiConfigured()) return;
    void refresh();
  }, [refresh]);

  /** Runs one action: its busy key, its failure sentence, its follow-up. */
  const run = async (key: string, work: () => Promise<void>, onFail?: (failure: unknown) => void) => {
    setBusy(key);
    setError("");
    try {
      await work();
    } catch (failure) {
      onFail?.(failure);
      setError(mcpFailureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const submit = async (input: McpFormInput) => {
    setFormError("");
    setBusy("form");
    try {
      if (editing?.kind === "edit") {
        const current = servers.find((server) => server.id === editing.id);
        if (current) await updateMcpServer(current.id, patchBodyOf(input, current));
      } else {
        await createMcpServer(createBodyOf(input));
      }
      setEditing(null);
      await refresh();
    } catch (failure) {
      setFormError(mcpFailureMessage(failure));
    } finally {
      setBusy("");
    }
  };

  const actions: McpRowActions = {
    onDiscover: (server) =>
      void run(
        `discover:${server.id}`,
        async () => {
          const found = await discoverMcpServer(server.id);
          const wasOn = server.tools.filter((tool) => tool.enabled).map((tool) => tool.name);
          const nowOff = found.tools.filter((tool) => !tool.enabled).map((tool) => tool.name);
          setChanged((now) => ({ ...now, [server.id]: wasOn.filter((name) => nowOff.includes(name)) }));
          await refresh();
        },
        (failure) => {
          if ((failure as { code?: string } | null)?.code === "mcp_broken") {
            setRetryAt((now) => ({ ...now, [server.id]: new Date(Date.now() + BREAKER_MS) }));
          }
          void refresh();
        },
      ),
    onEdit: (server) => {
      setFormError("");
      setEditing({ kind: "edit", id: server.id });
    },
    onAskDelete: setConfirming,
    onDelete: (server) =>
      void run(`delete:${server.id}`, async () => {
        await deleteMcpServer(server.id);
        setConfirming(null);
        await refresh();
      }),
    onToggle: (server, tool, enabled) =>
      void run(`tool:${server.id}:${tool}`, async () => {
        await setMcpToolEnabled(server.id, tool, enabled);
        await refresh();
      }),
  };

  if (!isAiConfigured() || off) return null;

  const target = editing?.kind === "edit" ? servers.find((server) => server.id === editing.id) : undefined;

  return (
    <section className="space-y-3" data-testid="mcp-servers-section">
      <div className="space-y-1">
        <h4 className={MCP_TITLE}>Your MCP servers</h4>
        <p className={`leading-[18px] ${MCP_TEXT_MUTED_SM}`}>
          A server lends tools to the assistant. Every tool starts off, and every call waits for
          your approval.
        </p>
      </div>
      {error ? (
        <p role="alert" data-testid="mcp-error" className={MCP_TEXT_DANGER_SM}>
          {error}
        </p>
      ) : null}
      <McpServerList servers={servers} state={{ changed, retryAt, busy, confirming }} actions={actions} />
      {editing ? (
        <McpServerForm
          key={editing.kind === "edit" ? editing.id : "add"}
          server={target}
          busy={busy === "form"}
          error={formError}
          onSubmit={(input) => void submit(input)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button
          tone="primary"
          onClick={() => {
            setFormError("");
            setEditing({ kind: "add" });
          }}
        >
          Add a server
        </Button>
      )}
    </section>
  );
};

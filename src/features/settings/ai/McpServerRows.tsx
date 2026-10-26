/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpServerRows.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI — the list of the user's MCP servers.
 *
 * The list shows the host and the last four characters of the header, never
 * the address path or the secret (C271). A tool is off until the user turns
 * it on; a tool whose description changed after it was enabled comes back off
 * and says so (C272).
 */

import React from "react";
import { Trash2 } from "lucide-react";

import type { AiMcpServer } from "@/features/ai/api/aiContract";
import { statusWords } from "@/features/ai/model/mcpServerForm";
import { CHIP, MCP_BOX, MCP_STATUS_CHIP, MCP_TEXT_DANGER_XS, MCP_TEXT_MUTED_SM, MCP_TEXT_MUTED_XS, MCP_TITLE, MCP_TOOL_LIST } from "./aiPanelClasses";
import { Button } from "@/shared/ui";
import { Toggle } from "@osionos/ui/primitives/Toggle";

export interface McpRowActions {
  onDiscover: (server: AiMcpServer) => void;
  onEdit: (server: AiMcpServer) => void;
  onAskDelete: (id: string | null) => void;
  onDelete: (server: AiMcpServer) => void;
  onToggle: (server: AiMcpServer, tool: string, enabled: boolean) => void;
}

export interface McpRowState {
  /** Tool names that were on and came back off after a discovery, per server. */
  changed: Record<string, string[]>;
  busy: string;
  confirming: string | null;
}

/** The header line of a server: its name and the last four characters of the secret. */
export function headerWords(server: Pick<AiMcpServer, "headerName" | "headerLast4">): string {
  if (!server.headerName) return "No header";
  return `${server.headerName} ••••${server.headerLast4 ?? ""}`;
}

const ToolRows: React.FC<{
  server: AiMcpServer;
  changed: string[];
  busy: string;
  onToggle: McpRowActions["onToggle"];
}> = ({ server, changed, busy, onToggle }) => (
  <ul className={MCP_TOOL_LIST}>
    {server.tools.map((tool) => (
      <li key={tool.name} className="flex items-start gap-3 px-3 py-2" data-testid="mcp-tool">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs">{tool.name}</div>
          {tool.description ? (
            <div className={`line-clamp-2 ${MCP_TEXT_MUTED_XS}`}>{tool.description}</div>
          ) : null}
          {changed.includes(tool.name) && !tool.enabled ? (
            <div className={MCP_TEXT_DANGER_XS} data-testid="mcp-tool-changed">
              changed since you enabled it
            </div>
          ) : null}
        </div>
        <Toggle
          size="sm"
          label={`${tool.name} ${tool.enabled ? "on" : "off"}`}
          checked={tool.enabled}
          disabled={busy === `tool:${server.id}:${tool.name}`}
          onChange={(next) => onToggle(server, tool.name, next)}
        />
      </li>
    ))}
  </ul>
);

const DeleteControl: React.FC<{ server: AiMcpServer; state: McpRowState; actions: McpRowActions }> = ({
  server,
  state,
  actions,
}) =>
  state.confirming === server.id ? (
    <span className="flex items-center gap-2" role="group" aria-label={`Delete ${server.label}`}>
      <span className={MCP_TEXT_MUTED_XS}>Delete this server?</span>
      <Button size="sm" tone="danger" onClick={() => actions.onDelete(server)} disabled={state.busy === `delete:${server.id}`}>
        Delete
      </Button>
      <Button size="sm" onClick={() => actions.onAskDelete(null)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="sm" tone="danger" onClick={() => actions.onAskDelete(server.id)}>
      <Trash2 size={12} aria-hidden /> Delete
    </Button>
  );

/** The servers of the user, each with its tools. */
export const McpServerList: React.FC<{
  servers: AiMcpServer[];
  state: McpRowState;
  actions: McpRowActions;
}> = ({ servers, state, actions }) => {
  if (servers.length === 0) {
    return <p className={MCP_TEXT_MUTED_SM}>No server of yours yet.</p>;
  }
  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <div
          key={server.id}
          data-testid="mcp-server"
          className={MCP_BOX}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`min-w-0 truncate ${MCP_TITLE}`}>
              {server.label}
            </span>
            <span className={`${CHIP} ${MCP_STATUS_CHIP}`}>{server.status}</span>
          </div>
          <div className={`mt-0.5 truncate ${MCP_TEXT_MUTED_XS}`} data-testid="mcp-host">
            {server.host} · {headerWords(server)}
          </div>
          <div className={`mt-0.5 ${MCP_TEXT_MUTED_XS}`} data-testid="mcp-status">
            {statusWords(server)}
          </div>
          {server.tools.length > 0 ? (
            <ToolRows
              server={server}
              changed={state.changed[server.id] ?? []}
              busy={state.busy}
              onToggle={actions.onToggle}
            />
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => actions.onDiscover(server)} disabled={state.busy === `discover:${server.id}`}>
              {state.busy === `discover:${server.id}` ? "Discovering…" : "Discover tools"}
            </Button>
            <Button size="sm" onClick={() => actions.onEdit(server)}>
              Edit
            </Button>
            <DeleteControl server={server} state={state} actions={actions} />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpServerForm.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Settings › AI — the form that adds an MCP server or changes one.
 *
 * Bad input never leaves the form (C268). The header value is a password
 * field and is never filled back from the server (C271). A new address needs
 * the header again and turns every tool off (C270). Page text the user
 * approves goes to the server, and the box says so before anything is sent
 * (C282): the button stays off until it is ticked.
 */

import React, { useState } from "react";

import type { AiMcpServer, CreateMcpServerInput, UpdateMcpServerInput } from "@/features/ai/api/aiContract";
import {
  canAddMcp,
  disclosureWords,
  hostOf,
  validateMcpEdit,
  validateMcpForm,
  type McpFormInput,
  type McpFormProblems,
} from "@/features/ai/model/mcpServerForm";
import { FIELD_LABEL, MCP_BOX, MCP_TEXT_DANGER_SM, MCP_TEXT_DANGER_XS, MCP_TITLE } from "./aiPanelClasses";
import { Button, Input } from "@/shared/ui";
import { Checkbox } from "@osionos/ui/primitives/Checkbox";

/** The body of a create: the header fields travel only when filled. */
export function createBodyOf(input: McpFormInput): CreateMcpServerInput {
  return {
    label: input.label.trim(),
    url: input.url.trim(),
    ...(input.headerName ? { headerName: input.headerName } : {}),
    ...(input.headerValue ? { headerValue: input.headerValue } : {}),
  };
}

/** The body of a patch: the label, and the address with its header when the address changes. */
export function patchBodyOf(input: McpFormInput, current: Pick<AiMcpServer, "label">): UpdateMcpServerInput {
  const body: UpdateMcpServerInput = {};
  if (input.label.trim() !== current.label) body.label = input.label.trim();
  if (input.url.trim()) {
    body.url = input.url.trim();
    body.headerValue = input.headerValue;
    if (input.headerName) body.headerName = input.headerName;
  }
  return body;
}

const Field: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  problem?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}> = ({ id, label, value, onChange, problem, type = "text", placeholder, autoComplete = "off" }) => (
  <div>
    <label htmlFor={id} className={FIELD_LABEL}>
      {label}
    </label>
    <Input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      spellCheck={false}
      aria-invalid={problem ? true : undefined}
      aria-describedby={problem ? `${id}-problem` : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1"
    />
    {problem ? (
      <p id={`${id}-problem`} data-testid={`${id}-problem`} className={`mt-1 ${MCP_TEXT_DANGER_XS}`}>
        {problem}
      </p>
    ) : null}
  </div>
);

/** Only the fields the user has started are criticised; the others just keep the button off. */
function visible(problems: McpFormProblems, input: McpFormInput): McpFormProblems {
  const shown: McpFormProblems = {};
  for (const key of Object.keys(problems) as (keyof McpFormInput)[]) {
    if (input[key].length > 0) shown[key] = problems[key];
  }
  return shown;
}

/** The add form, or the edit form of one server. */
export const McpServerForm: React.FC<{
  server?: AiMcpServer;
  busy: boolean;
  error: string;
  onSubmit: (input: McpFormInput) => void;
  onCancel: () => void;
}> = ({ server, busy, error, onSubmit, onCancel }) => {
  const [input, setInput] = useState<McpFormInput>({
    label: server?.label ?? "",
    url: "",
    headerName: "",
    headerValue: "",
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const set = (key: keyof McpFormInput) => (value: string) => setInput((now) => ({ ...now, [key]: value }));

  const editing = server !== undefined;
  const problems = editing ? validateMcpEdit(input) : validateMcpForm(input);
  const changesUrl = editing && input.url.trim().length > 0;
  const needsDisclosure = !editing || changesUrl;
  const host = hostOf(input.url) || server?.host || "";
  const shown = visible(problems, input);
  const ready = editing
    ? Object.keys(problems).length === 0 &&
      (changesUrl ? acknowledged : input.label.trim() !== server.label)
    : canAddMcp(input, acknowledged);

  return (
    <form
      data-testid="mcp-server-form"
      className={`space-y-3 ${MCP_BOX}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(input);
      }}
    >
      <h6 className={MCP_TITLE}>
        {editing ? `Edit ${server.label}` : "Add a server"}
      </h6>
      <Field id="mcp-label" label="Name" value={input.label} onChange={set("label")} problem={shown.label} />
      <Field
        id="mcp-url"
        label={editing ? "New address (leave empty to keep it)" : "Address"}
        value={input.url}
        onChange={set("url")}
        problem={shown.url}
        placeholder="https://mcp.example.com/mcp"
      />
      {changesUrl ? (
        <p role="note" data-testid="mcp-url-warning" className={MCP_TEXT_DANGER_XS}>
          A new address turns every tool of this server off, and asks for the header again.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="mcp-header-name"
          label="Header name (optional)"
          value={input.headerName}
          onChange={set("headerName")}
          problem={shown.headerName}
          placeholder="Authorization"
        />
        <Field
          id="mcp-header-value"
          label={editing ? "Header value (asked again)" : "Header value (optional)"}
          value={input.headerValue}
          onChange={set("headerValue")}
          problem={shown.headerValue}
          type="password"
          autoComplete="new-password"
        />
      </div>
      {needsDisclosure ? (
        <Checkbox
          checked={acknowledged}
          onChange={setAcknowledged}
          label={<span data-testid="mcp-disclosure">{disclosureWords(host)}</span>}
        />
      ) : null}
      {error ? (
        <p role="alert" data-testid="mcp-form-error" className={MCP_TEXT_DANGER_SM}>
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" tone="primary" disabled={!ready || busy} data-testid="mcp-submit">
          {busy ? "Saving…" : editing ? "Save" : "Add server"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

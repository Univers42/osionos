/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcpServerForm.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the MCP server form checks before anything is sent (C268), and the
 * sentences of the service's refusals.
 *
 * These mirror the service's rules so a bad input never travels. They are
 * hints, not the law: the service checks again, and also refuses private and
 * local addresses, which this module does not try to list.
 */

import type { AiMcpServer } from "@/features/ai/api/aiContract";
import { AiError } from "@/features/ai/api/aiContract";
import { errorWords } from "@/widgets/chat-shell/ui/errorWords";

export interface McpFormInput {
  label: string;
  url: string;
  headerName: string;
  headerValue: string;
}

/** The first problem of each field; a missing key means the field is fine. */
export type McpFormProblems = Partial<Record<keyof McpFormInput, string>>;

/** The fewest characters of a header value: a shorter one would show whole as its last four. */
export const MIN_HEADER_VALUE = 8;

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const HEADER_NAME = /^(authorization|x-[a-z0-9-]{1,40})$/i;
const HEADER_VALUE = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/;

/** The sentence under the URL field. */
function urlProblem(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Enter the https:// address of the server.";
  if (CONTROL_OR_FORMAT.test(raw)) return "The address has a line break or a hidden character.";
  if (value.length > 2048) return "The address is too long.";
  if (value.includes("?")) return "Remove the query (everything after ?): a token in it would be shown in the list.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That is not a URL. Use the https://<host>/<path> form.";
  }
  if (url.protocol !== "https:") return "Only https:// addresses are accepted.";
  if (url.username || url.password) return "Remove the user name and password from the address; use the header field.";
  if (url.hash) return "Remove the # fragment from the address.";
  return undefined;
}

/** The sentences under the header fields. `valueNeeded` is true when a changed address asks for the header again (C270). */
function headerProblems(input: McpFormInput, valueNeeded: boolean): McpFormProblems {
  const name = input.headerName;
  const value = input.headerValue;
  const out: McpFormProblems = {};
  if (CONTROL_OR_FORMAT.test(name)) out.headerName = "The header name has a line break or a hidden character.";
  else if (name && !HEADER_NAME.test(name)) out.headerName = "The header name must be Authorization or start with x-.";
  if (CONTROL_OR_FORMAT.test(value)) out.headerValue = "The header value has a line break or a hidden character.";
  else if (value && (value.length < MIN_HEADER_VALUE || !HEADER_VALUE.test(value))) {
    out.headerValue = `The header value needs ${MIN_HEADER_VALUE} or more printable characters, with no line break.`;
  } else if (name && !value) out.headerValue = "Enter the header value.";
  else if (valueNeeded && !value) out.headerValue = "A new address needs the header again.";
  return out;
}

/**
 * Checks the add form: a label, an https address, and an optional header.
 *
 * Caveat: the label rule is the service's (1 to 80 characters, no control or
 * format character); a rule the service adds later is only caught by the
 * service, as a refusal.
 */
export function validateMcpForm(input: McpFormInput): McpFormProblems {
  const problems = headerProblems(input, false);
  const label = input.label.trim();
  if (!label) problems.label = "Give the server a name.";
  else if (label.length > 80) problems.label = "The name is at most 80 characters.";
  else if (CONTROL_OR_FORMAT.test(input.label)) problems.label = "The name has a line break or a hidden character.";
  const url = urlProblem(input.url);
  if (url) problems.url = url;
  return problems;
}

/** True when the add form may be sent: no problem, and the disclosure is ticked (C282). */
export function canAddMcp(input: McpFormInput, acknowledged: boolean): boolean {
  return acknowledged && Object.keys(validateMcpForm(input)).length === 0;
}

/**
 * Checks the edit form. An empty address means "keep it"; a filled one needs
 * the header value again (C270) and turns every tool off.
 */
export function validateMcpEdit(input: McpFormInput): McpFormProblems {
  const changesUrl = input.url.trim().length > 0;
  const problems = headerProblems(input, changesUrl);
  if (!input.label.trim()) problems.label = "Give the server a name.";
  else if (input.label.trim().length > 80) problems.label = "The name is at most 80 characters.";
  else if (CONTROL_OR_FORMAT.test(input.label)) problems.label = "The name has a line break or a hidden character.";
  if (changesUrl) {
    const url = urlProblem(input.url);
    if (url) problems.url = url;
  } else if (input.headerValue || input.headerName) {
    problems.url = "A header is only changed together with the address.";
  }
  return problems;
}

/** The disclosure the user ticks before a server is added (C282). */
export function disclosureWords(host: string): string {
  return `Page text you approve is sent to ${host || "this server"}`;
}

/** The host of an address the user typed, for the disclosure; empty while it cannot be read. */
export function hostOf(raw: string): string {
  try {
    return new URL(raw.trim()).host;
  } catch {
    return "";
  }
}

/** The sentences of the refusals; every code the MCP routes answer has one. */
export const MCP_REFUSALS: Record<string, string> = {
  mcp_unreachable: "The server could not be reached. Check the address and try again.",
  mcp_timeout: "The server took too long to answer.",
  mcp_too_large: "The server answered with more than we accept: too many tools, or a reply that is too large.",
  mcp_protocol: "The server did not answer like an MCP server.",
  mcp_broken: "This server is paused after 3 failures. Try again later.",
  reauth_required: "Sign in again to change a server.",
  rate_limited: "Too many discoveries in a minute. Wait a moment and try again.",
  endpoint_not_allowed: "That address is not allowed: use a public https:// address with no query.",
  invalid_header: "The header is not accepted: use Authorization or an x- name and a value of 8 or more printable characters.",
  invalid_request: "The request was rejected. Check the fields.",
  too_many_servers: "You already have 10 servers. Delete one to make room.",
  connections_unavailable: "Servers that keep a secret are unavailable right now.",
  not_found: "That server is gone.",
};

/** The sentence of a failure: the code's words, the 429 words, or the generic ones. */
export function mcpFailureMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return errorWords("network_error");
  const known = MCP_REFUSALS[code];
  if (known) return known;
  if (error instanceof AiError && error.status === 429) return MCP_REFUSALS["rate_limited"] ?? "";
  return errorWords(code);
}

/** True when the list answered 404: the feature is off on this deployment (C288). */
export function isMcpOff(failure: unknown): boolean {
  return failure instanceof AiError && failure.status === 404;
}

/** `HH:MM` of a moment, for the "retry after" line. */
export function clockTime(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** The words under a server's name when it is not healthy. A pause that has run out keeps `broken` until the next discovery. */
export function statusWords(server: Pick<AiMcpServer, "status" | "brokenUntil">): string {
  if (server.status === "broken") {
    return server.brokenUntil
      ? `Paused after 3 failures, retry after ${clockTime(new Date(server.brokenUntil))}`
      : "Paused after 3 failures, you can retry now";
  }
  if (server.status === "failing") return "The last discovery failed";
  if (server.status === "new") return "No tools discovered yet";
  return "Working";
}

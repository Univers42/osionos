/**
 * What the NEXT message sends, and to whom: the rows the AI Hub shows.
 *
 * Every row mirrors the service (services/osionos-ai/src/runs) or, for a
 * "This device" run, the device port (deviceInferencePort.ts). The citations
 * live in tests/canvas/ai-privacy.test.ts, one per claim; a row the code does
 * not support is not here.
 *
 * Caveat: the client cannot see the server's side of a row. "Conditional" rows
 * depend on what the reader adds to the message or on what the workspace holds,
 * so they say "when ..." instead of promising; a connection list that has not
 * loaded yet is read as the platform, as resolveAiSelection does.
 */

import type { AiConnection, AiProvider } from "../api/aiContract";
import { DEVICE_CONNECTION_ID } from "./deviceEngine";
import { PLATFORM_CONNECTION_ID, type AiSelection } from "./aiSelection";

/** One thing a message can carry out of the browser. */
export interface OutgoingRow {
  id: "message" | "account" | "pages" | "search" | "memories" | "files";
  label: string;
  detail: string;
  /** False: this never leaves for the next message. */
  sent: boolean;
  /** True: it leaves only when the reader or the workspace supplies it. */
  conditional: boolean;
}

/** What the rows depend on. */
export interface OutgoingInput {
  accountContext: boolean;
  selection: AiSelection | null;
}

/** Who receives the message. */
export interface Recipient {
  kind: "platform" | "connection" | "device";
  text: string;
}

const DEVICE_SKIPPED = "Not used when the model runs on this device.";

function isDevice(selection: AiSelection | null): boolean {
  return selection?.connectionId === DEVICE_CONNECTION_ID;
}

function messageRow(device: boolean): OutgoingRow {
  return {
    id: "message",
    label: "Your message and this conversation",
    detail: device
      ? "Your latest message only. Earlier messages of the conversation are not sent."
      : "Your message and the earlier messages of this conversation, up to about 24,000 characters.",
    sent: true,
    conditional: false,
  };
}

function accountRow(on: boolean, device: boolean): OutgoingRow {
  if (device) return { id: "account", label: "Account context", detail: DEVICE_SKIPPED, sent: false, conditional: false };
  return {
    id: "account",
    label: "Account context",
    detail: on
      ? "Your name, username, pronouns, timezone, workspace, role, the page, tabs and panel you have open, and the titles of the pages you can read."
      : "Turned off: the assistant is not told who you are or what you have open.",
    sent: on,
    conditional: false,
  };
}

function searchRow(device: boolean): OutgoingRow {
  return {
    id: "search",
    label: "Search results from your workspace",
    detail: device
      ? "Snippets of pages you can read, found by osionos for your question and handed to the model on this device."
      : "Snippets of pages you can read, when you add the workspace with @ or the assistant searches while it answers.",
    sent: true,
    conditional: !device,
  };
}

function optionalRow(id: OutgoingRow["id"], label: string, detail: string, device: boolean): OutgoingRow {
  return { id, label, detail: device ? DEVICE_SKIPPED : detail, sent: !device, conditional: !device };
}

/** The rows of the next message, in the order the service puts them in the prompt. */
export function outgoingContext(input: OutgoingInput): OutgoingRow[] {
  const device = isDevice(input.selection);
  return [
    messageRow(device),
    accountRow(input.accountContext, device),
    optionalRow("pages", "Pages you add with @", "The text of each page, quoted, when you add one.", device),
    searchRow(device),
    optionalRow("memories", "Approved memories", "Only the memories you approved, when you have any.", device),
    optionalRow("files", "Attached files and images", "The text of an attached file, or the image itself, when you attach one.", device),
  ];
}

function connectionRecipient(connection: AiConnection, providers: readonly AiProvider[]): string {
  if (connection.kind === "endpoint") {
    return `Sent to your endpoint ${connection.baseUrl ?? connection.label} with your key`;
  }
  const name = providers.find((provider) => provider.id === connection.provider)?.name ?? connection.provider;
  return `Sent to ${name} with your key`;
}

/** The recipient line for the current selection. */
export function recipientOf(
  selection: AiSelection | null,
  connections: readonly AiConnection[],
  providers: readonly AiProvider[],
): Recipient {
  if (isDevice(selection)) {
    return { kind: "device", text: "Stays on this device. Only your question goes to osionos, to find matching pages." };
  }
  const own = selection && selection.connectionId !== PLATFORM_CONNECTION_ID
    ? connections.find((connection) => connection.id === selection.connectionId)
    : undefined;
  if (own) return { kind: "connection", text: connectionRecipient(own, providers) };
  return { kind: "platform", text: "osionos sends this to OpenRouter, which routes it to the model's provider" };
}

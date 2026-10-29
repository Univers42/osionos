/* ************************************************************************** */
/*  ai-mcp-hub.test.ts — the AI Hub manages a user's MCP servers (E1c):      */
/*  the list shows host and last4 only, the form validates before it sends   */
/*  (C268), the disclosure gates the add (C282), 404 hides the part (C288),  */
/*  the refusals are sentences, a tool switch calls its route.               */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  AiError,
  createMcpServer,
  deleteMcpServer,
  discoverMcpServer,
  listMcpServers,
  setAiTransport,
  setMcpToolEnabled,
  updateMcpServer,
  type AiMcpServer,
} from "../../src/features/ai/api/aiClient";
import {
  MCP_REFUSALS,
  canAddMcp,
  isMcpOff,
  mcpFailureMessage,
  statusWords,
  validateMcpEdit,
  validateMcpForm,
  type McpFormInput,
} from "../../src/features/ai/model/mcpServerForm";
import { McpServerForm, createBodyOf, patchBodyOf } from "../../src/features/settings/ai/McpServerForm";
import { McpServerList, type McpRowActions } from "../../src/features/settings/ai/McpServerRows";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function stub(answer: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  setAiTransport(async (input, init) => {
    const call = { method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return answer(call);
  });
  return calls;
}

const OK_SERVER: AiMcpServer = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Docs search",
  host: "mcp.example.com",
  status: "ok",
  headerName: "Authorization",
  headerLast4: "wxyz",
  brokenUntil: null,
  tools: [
    { name: "search", description: "Search the docs", enabled: true },
    { name: "fetch_page", description: "Fetch one page", enabled: false },
  ],
};

const BROKEN_SERVER: AiMcpServer = { ...OK_SERVER, id: "22222222-2222-4222-8222-222222222222", label: "Flaky", status: "broken", brokenUntil: new Date(2026, 9, 26, 14, 5).toISOString(), tools: [] };

const NO_ACTIONS: McpRowActions = {
  onDiscover: () => undefined,
  onEdit: () => undefined,
  onAskDelete: () => undefined,
  onDelete: () => undefined,
  onToggle: () => undefined,
};

const STATE = { changed: {}, busy: "", confirming: null };

const GOOD: McpFormInput = { label: "Docs", url: "https://mcp.example.com/mcp", headerName: "", headerValue: "" };

const render = (servers: AiMcpServer[], state = STATE): string =>
  renderToString(React.createElement(McpServerList, { servers, state, actions: NO_ACTIONS }));

test("the list shows host and last4, never a URL path or query", () => {
  // The service never sends a url; a regression that adds one must not reach the page.
  const leaky = { ...OK_SERVER, url: "https://mcp.example.com/secret/path?token=abc" } as AiMcpServer;
  const html = render([leaky]);
  assert.match(html, /mcp\.example\.com/);
  assert.match(html, /Authorization ••••wxyz/);
  assert.equal(html.includes("/secret/path"), false);
  assert.equal(html.includes("token=abc"), false);
});

test("validation refuses http, credentials, fragment, query", () => {
  const url = (value: string) => validateMcpForm({ ...GOOD, url: value }).url;
  assert.equal(url("https://mcp.example.com/mcp"), undefined);
  assert.ok(url("http://mcp.example.com/mcp"));
  assert.ok(url("https://user:pw@mcp.example.com/mcp"));
  assert.ok(url("https://mcp.example.com/mcp#frag"));
  assert.ok(url("https://mcp.example.com/mcp?token=abc"));
  assert.ok(url(""));
  assert.ok(url("not a url"));
});

test("validation refuses a header name outside Authorization and x-*", () => {
  const name = (value: string) => validateMcpForm({ ...GOOD, headerName: value, headerValue: "secret-value-1" }).headerName;
  assert.equal(name("Authorization"), undefined);
  assert.equal(name("x-api-key"), undefined);
  for (const bad of ["Host", "Cookie", "Content-Length", "mcp-session", "x-"]) assert.ok(name(bad), bad);
});

test("validation refuses CR/LF in every field", () => {
  for (const key of ["label", "url", "headerName", "headerValue"] as const) {
    const input: McpFormInput = { ...GOOD, headerName: "Authorization", headerValue: "secret-value-1" };
    for (const bad of ["a\r\nb", "a\nb", "a\rb"]) {
      assert.ok(validateMcpForm({ ...input, [key]: `${input[key]}${bad}` })[key], `${key} ${JSON.stringify(bad)}`);
    }
  }
});

test("a header value that is short or has no name is refused", () => {
  assert.ok(validateMcpForm({ ...GOOD, headerValue: "short" }).headerValue);
  assert.ok(validateMcpForm({ ...GOOD, headerName: "Authorization" }).headerValue);
  assert.deepEqual(validateMcpForm({ ...GOOD, headerValue: "secret-value-1" }), {});
});

test("a changed address needs the header again, an unchanged one does not (C270)", () => {
  assert.deepEqual(validateMcpEdit({ ...GOOD, url: "" }), {});
  assert.ok(validateMcpEdit({ ...GOOD, url: "https://other.example.com/mcp" }).headerValue);
  assert.deepEqual(validateMcpEdit({ ...GOOD, url: "https://other.example.com/mcp", headerValue: "secret-value-1" }), {});
  assert.ok(validateMcpEdit({ ...GOOD, url: "", headerValue: "secret-value-1" }).url);
});

test("C282 the add is off until the disclosure is ticked, and its body carries acknowledged: true", () => {
  assert.equal(canAddMcp(GOOD, false), false);
  assert.equal(canAddMcp(GOOD, true), true);
  assert.equal(canAddMcp({ ...GOOD, url: "http://x.example.com" }, true), false);
  // The service refuses a create without it (validate.ts createBodySchema).
  assert.deepEqual(createBodyOf(GOOD), { label: "Docs", url: "https://mcp.example.com/mcp", acknowledged: true });
  const html = renderToString(React.createElement(McpServerForm, { busy: false, error: "", onSubmit: () => undefined, onCancel: () => undefined }));
  assert.match(html, /Page text you approve is sent to this server/);
  assert.match(html, /type="password"/);
  assert.match(html, /<button type="submit"[^>]* disabled=""/);
});

test("the edit body sends the address with its header, and only the label otherwise", () => {
  assert.deepEqual(patchBodyOf({ ...GOOD, url: "", label: "New" }, OK_SERVER), { label: "New" });
  assert.deepEqual(
    patchBodyOf({ ...GOOD, label: "Docs search", url: "https://o.example.com/mcp", headerValue: "secret-value-1" }, OK_SERVER),
    { url: "https://o.example.com/mcp", headerValue: "secret-value-1" },
  );
});

test("a 404 on the list means the feature is off", async () => {
  stub(() => json({ error: { code: "not_found" } }, 404));
  await assert.rejects(listMcpServers(), (failure) => isMcpOff(failure));
  assert.equal(isMcpOff(new AiError(500, "internal")), false);
});

test("each failure code becomes its sentence", () => {
  const codes = ["mcp_unreachable", "mcp_timeout", "mcp_too_large", "mcp_protocol", "mcp_broken", "reauth_required"];
  for (const code of codes) {
    const words = mcpFailureMessage(new AiError(502, code));
    assert.equal(words, MCP_REFUSALS[code]);
    assert.equal(words.includes(code), false);
  }
  assert.equal(mcpFailureMessage(new AiError(403, "reauth_required")), "Sign in again to change a server.");
  assert.match(mcpFailureMessage(new AiError(429, "something_new")), /Too many/);
});

test("the routes: list, create, patch, delete, discover, tool switch", async () => {
  const calls = stub((call) => {
    if (call.method === "DELETE") return new Response(null, { status: 204 });
    if (call.url.endsWith("/discover")) return json({ tools: [], refused: 0 });
    if (call.url.includes("/tools/")) return json({ name: "search", enabled: true });
    if (call.method === "GET") return json({ servers: [OK_SERVER] });
    return json(OK_SERVER, call.method === "POST" ? 201 : 200);
  });
  const id = OK_SERVER.id;
  assert.equal((await listMcpServers()).length, 1);
  await createMcpServer({ label: "x", url: "https://a.example.com", acknowledged: true });
  await updateMcpServer(id, { label: "y" });
  await discoverMcpServer(id);
  assert.equal(await setMcpToolEnabled(id, "search", true), true);
  await setMcpToolEnabled(id, "a/b c", false);
  await deleteMcpServer(id);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url.replace(/^.*\/api\/ai/, "")}`),
    [
      "GET /mcp-servers",
      "POST /mcp-servers",
      `PATCH /mcp-servers/${id}`,
      `POST /mcp-servers/${id}/discover`,
      `PATCH /mcp-servers/${id}/tools/search`,
      `PATCH /mcp-servers/${id}/tools/a%2Fb%20c`,
      `DELETE /mcp-servers/${id}`,
    ],
  );
  assert.deepEqual(calls[4]?.body, { enabled: true });
  assert.deepEqual(calls[5]?.body, { enabled: false });
});

test("a changed tool is off and says so; a broken server says when to retry", () => {
  const changed = { ...OK_SERVER, tools: [{ name: "search", description: "New words", enabled: false }] };
  const html = render([changed], { ...STATE, changed: { [OK_SERVER.id]: ["search"] } });
  assert.match(html, /changed since you enabled it/);
  assert.match(html, /aria-checked="false"/);
  assert.equal(render([changed]).includes("changed since you enabled it"), false);

  assert.equal(statusWords(BROKEN_SERVER), "Paused after 3 failures, retry after 14:05");
  assert.match(render([BROKEN_SERVER]), /retry after 14:05/);
  assert.equal(statusWords({ ...BROKEN_SERVER, brokenUntil: null }), "Paused after 3 failures, you can retry now");
});

test("delete asks inline, with no confirm()", () => {
  const html = render([OK_SERVER], { ...STATE, confirming: OK_SERVER.id });
  assert.match(html, /Delete this server\?/);
});

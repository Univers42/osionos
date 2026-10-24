/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-security.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P1-6-b: the account security client, the one sudo prompt's model, the sign-in rows
 * and the danger zone.
 *
 * What matters: a sign-in method the server did not report has no row, the sudo prompt
 * listens to the shared `sudo_required` event, every server code has a sentence, the
 * deletion gesture needs the typed name, and the `danger` anchor exists only with
 * `osio.account.delete` on.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const api = await import("../../src/shared/api/accountSecurityApi.ts");
const { onSudoRequired } = await import("../../src/shared/api/sudoRequired.ts");
const { sudoSentence, startSudoListener, useSudoPromptStore } = await import("../../src/features/settings/ui/sudo/sudoPromptModel.ts");
const { signInRows } = await import("../../src/features/settings/profile/signInMethods.ts");
const { deleteConfirmText } = await import("../../src/features/settings/ui/danger/dangerModel.ts");
const { SETTINGS_SECTIONS } = await import("../../src/features/settings/model/sections.ts");

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function useSession(pageJwt: string | null) {
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeJwt: () => (pageJwt ? "gotrue.jwt" : null), activePageJwt: () => pageJwt, handleSessionRevoked: () => undefined }),
    subscribe: () => () => undefined,
  });
}

interface Call { url: string; init: RequestInit | undefined }

async function withFetch<T>(answer: (call: Call) => Response, run: () => Promise<T>): Promise<{ result: T; calls: Call[] }> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return answer(call).clone();
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

// --- the client ---------------------------------------------------------------

test("requestSudoCode: 202 -> the masked address", async () => {
  useSession("osionos_v1.tok");
  const { result, calls } = await withFetch(() => json(202, { method: "email", sentTo: "a***@example.com" }), () => api.requestSudoCode());
  assert.deepEqual(result, { ok: true, data: { sentTo: "a***@example.com" } });
  assert.equal(calls[0].url, "https://bridge.test/api/account/sudo/email");
  assert.equal(calls[0].init?.method, "POST");
});

test("verifySudoCode: 204 -> ok; a bad code keeps its server code", async () => {
  useSession("osionos_v1.tok");
  const ok = await withFetch(() => new Response(null, { status: 204 }), () => api.verifySudoCode("123456"));
  assert.equal(ok.result.ok, true);
  assert.equal(ok.calls[0].init?.body, JSON.stringify({ code: "123456" }));
  const bad = await withFetch(() => json(422, { code: "code_invalid", message: "x" }), () => api.verifySudoCode("000000"));
  assert.deepEqual(bad.result.ok === false && [bad.result.reason, bad.result.code], ["refused", "code_invalid"]);
});

test("a 429 says when to retry", async () => {
  useSession("osionos_v1.tok");
  const { result } = await withFetch(() => json(429, { code: "rate_limited", retryAfterSeconds: 90 }), () => api.requestSudoCode());
  assert.equal(result.ok === false && result.reason, "rate_limited");
  assert.equal(result.ok === false && result.retryAfterSeconds, 90);
});

test("changeUsername: a sudo refusal reaches the shared listener and is typed", async () => {
  useSession("osionos_v1.tok");
  const events: Array<{ method: string; path: string }> = [];
  const off = onSudoRequired((event) => events.push(event));
  const { result } = await withFetch(() => json(403, { code: "sudo_required" }), () => api.changeUsername("ada_l"));
  off();
  assert.equal(result.ok === false && result.reason, "sudo_required");
  assert.deepEqual(events, [{ method: "POST", path: "/api/account/username" }]);
});

test("changeUsername: 409 and 422 keep their codes", async () => {
  useSession("osionos_v1.tok");
  const taken = await withFetch(() => json(409, { code: "username_unavailable" }), () => api.changeUsername("ada"));
  assert.equal(taken.result.ok === false && taken.result.code, "username_unavailable");
  const bad = await withFetch(() => json(422, { code: "invalid_username" }), () => api.changeUsername("a"));
  assert.equal(bad.result.ok === false && bad.result.code, "invalid_username");
});

test("deletion: status 404 is 'no request', 201 carries the date, cancel is 204", async () => {
  useSession("osionos_v1.tok");
  const none = await withFetch(() => json(404, { code: "deletion_not_found" }), () => api.deletionStatus());
  assert.deepEqual(none.result, { ok: true, data: null });
  const open = await withFetch(() => json(200, { requestedAt: "2026-10-23T00:00:00Z", scheduledFor: "2026-11-06T00:00:00Z", successorUserId: null }), () => api.deletionStatus());
  assert.equal(open.result.ok && open.result.data?.scheduledFor, "2026-11-06T00:00:00Z");
  const made = await withFetch(() => json(201, { requestedAt: "a", scheduledFor: "b" }), () => api.requestDeletion());
  assert.equal(made.calls[0].init?.method, "POST");
  assert.equal(made.result.ok && made.result.data.scheduledFor, "b");
  const cancelled = await withFetch(() => new Response(null, { status: 204 }), () => api.cancelDeletion());
  assert.equal(cancelled.calls[0].init?.method, "DELETE");
  assert.equal(cancelled.result.ok, true);
});

test("a codeless 404 is a missing route; a 404 with a server code is a refusal with its message", async () => {
  useSession("osionos_v1.tok");
  const missing = await withFetch(() => json(404, { ok: false, message: "Not found." }), () => api.requestSudoCode());
  assert.equal(missing.result.ok === false && missing.result.reason, "unavailable");
  const answered = await withFetch(() => json(404, { code: "key_not_found", message: "No such key." }), () => api.requestSudoCode());
  assert.equal(answered.result.ok === false && answered.result.reason, "refused");
  assert.equal(answered.result.ok === false && answered.result.code, "key_not_found");
  assert.equal(answered.result.ok === false && answered.result.reason === "refused" && answered.result.message, "No such key.");
});

test("without a session or a bridge the client says unavailable", async () => {
  useSession(null);
  const { result, calls } = await withFetch(() => json(200, {}), () => api.deletionStatus());
  assert.equal(result.ok === false && result.reason, "unavailable");
  assert.equal(calls.length, 0);
});

// --- the sudo prompt ----------------------------------------------------------

test("the prompt opens when the shared sudo event fires, and stops when unsubscribed", async () => {
  const stop = startSudoListener();
  useSudoPromptStore.setState({ open: false });
  useSession("osionos_v1.tok");
  await withFetch(() => json(403, { code: "sudo_required" }), () => api.changeUsername("ada_l"));
  assert.equal(useSudoPromptStore.getState().open, true);
  stop();
  useSudoPromptStore.setState({ open: false });
  await withFetch(() => json(403, { code: "sudo_required" }), () => api.changeUsername("ada_l"));
  assert.equal(useSudoPromptStore.getState().open, false);
});

test("every server code has one sentence, and a 429 names the wait", () => {
  for (const code of ["code_invalid", "code_expired", "code_locked", "sudo_unavailable"]) {
    const sentence = sudoSentence({ code });
    assert.match(sentence, /\.$/, code);
    assert.notEqual(sentence, sudoSentence({ code: "other" }), code);
  }
  assert.match(sudoSentence({ code: "rate_limited", retryAfterSeconds: 90 }), /2 minutes/);
  assert.match(sudoSentence({ code: "rate_limited", retryAfterSeconds: 20 }), /20 seconds/);
});

test("granting sudo closes the prompt and bumps the retry signal", () => {
  useSudoPromptStore.setState({ open: true, grants: 0 });
  useSudoPromptStore.getState().granted();
  assert.equal(useSudoPromptStore.getState().open, false);
  assert.equal(useSudoPromptStore.getState().grants, 1);
});

// --- honest sign-in rows ------------------------------------------------------

test("signInRows: nothing the server did not report", () => {
  assert.deepEqual(signInRows({}), []);
  assert.deepEqual(signInRows({ hasPassword: undefined, passkeysEnabled: undefined }), []);
});

test("signInRows: a reported password, true or false, and a reported passkey", () => {
  assert.deepEqual(signInRows({ hasPassword: true }).map((row) => row.id), ["password"]);
  assert.equal(signInRows({ hasPassword: false })[0].label, "Add password");
  assert.equal(signInRows({ hasPassword: true })[0].label, "Update password");
  assert.deepEqual(signInRows({ hasPassword: true, passkeysEnabled: true }).map((row) => row.id), ["password", "passkeys"]);
});

// --- the danger zone ----------------------------------------------------------

test("deleteConfirmText: the username, else the email, else DELETE; never empty", () => {
  assert.equal(deleteConfirmText("ada", "a@b.c"), "ada");
  assert.equal(deleteConfirmText(null, "a@b.c"), "a@b.c");
  assert.equal(deleteConfirmText("", ""), "DELETE");
  assert.equal(deleteConfirmText(undefined, undefined), "DELETE");
});

test("the danger anchor is registered only with osio.account.delete on", () => {
  const profile = () => SETTINGS_SECTIONS.find((section) => section.id === "profile");
  assert.equal(profile()?.anchors.some((anchor) => anchor.id === "danger"), false);
  const storage = new Map<string, string>([["osio.account.delete", "1"]]);
  Reflect.set(globalThis, "window", {
    location: { search: "", hash: "" },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
  });
  try {
    assert.equal(profile()?.anchors.some((anchor) => anchor.id === "danger"), true);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

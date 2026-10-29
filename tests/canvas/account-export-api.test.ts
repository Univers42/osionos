/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-export-api.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P5-6-d: the export client and the `inProgress` flag of the deletion read.
 *
 * What matters: each bridge answer (202, 409, 403, 410, a network failure) has one typed
 * outcome, a 410 never hands back a Blob, a job of an unknown shape is not listed, and
 * `deletionOf` carries `inProgress` only when the bridge said so.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return nextResolve(specifier, context);
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeJwt: () => "gotrue.jwt", activePageJwt: () => "osionos_v1.tok", handleSessionRevoked: () => undefined }),
  subscribe: () => () => undefined,
});

async function withFetch<T>(answer: () => Response, run: () => Promise<T>): Promise<{ result: T; calls: Array<{ url: string; init?: RequestInit }> }> {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return answer();
  }) as typeof fetch;
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

const JOB = { id: "11111111-1111-4111-8111-111111111111", format: "zip", status: "done", requestedAt: "2026-10-23T08:00:00Z", expiresAt: "2026-10-30T08:00:00Z", bytes: 1200, errorCode: null };

test("requestExport: 202 sends the format and answers the job id", async () => {
  const { result, calls } = await withFetch(() => json(202, { id: JOB.id, status: "queued" }), () => api.requestExport("csv"));
  assert.deepEqual(result, { ok: true, data: { id: JOB.id } });
  assert.equal(calls[0].url, "https://bridge.test/api/account/export");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, JSON.stringify({ format: "csv" }));
});

const REFUSALS: Array<[string, number, Record<string, unknown>, string, string]> = [
  ["409 keeps export_in_progress", 409, { code: "export_in_progress", message: "busy" }, "refused", "export_in_progress"],
  ["403 without a sudo body is a plain refusal", 403, { code: "forbidden", message: "no" }, "refused", "forbidden"],
  ["500 is a failure", 500, { code: "boom", message: "x" }, "failed", "boom"],
];
for (const [label, status, body, reason, code] of REFUSALS) {
  test(`requestExport: ${label}`, async () => {
    const { result } = await withFetch(() => json(status, body), () => api.requestExport("zip"));
    assert.deepEqual(result.ok === false && "code" in result && [result.reason, result.code], [reason, code]);
  });
}

test("requestExport: sudo_required and a network failure are typed", async () => {
  const sudo = await withFetch(() => json(403, { code: "sudo_required" }), () => api.requestExport("zip"));
  assert.equal(sudo.result.ok === false && sudo.result.reason, "sudo_required");
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  try {
    const down = await api.requestExport("zip");
    assert.deepEqual(down.ok === false && "code" in down && [down.reason, down.code], ["failed", "network"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("listExports: reads the jobs and drops a row of an unknown shape", async () => {
  const { result } = await withFetch(() => json(200, { exports: [JOB, { id: 7 }, { ...JOB, id: "x", status: "weird" }] }), () => api.listExports());
  assert.deepEqual(result.ok && result.data.map((job) => job.id), [JOB.id]);
  const empty = await withFetch(() => json(200, {}), () => api.listExports());
  assert.deepEqual(empty.result, { ok: true, data: [] });
});

test("downloadExport: 200 is a Blob fetched with the session token", async () => {
  const { result, calls } = await withFetch(() => new Response("PK", { status: 200 }), () => api.downloadExport(JOB.id));
  assert.equal(result.ok && (await result.data.text()), "PK");
  assert.equal(calls[0].url, `https://bridge.test/api/account/export/${JOB.id}/download`);
  assert.deepEqual(calls[0].init?.headers, { Authorization: "Bearer osionos_v1.tok" });
});

test("downloadExport: a 410 says it expired and never returns a Blob", async () => {
  const { result } = await withFetch(() => json(410, { code: "export_expired", message: "server words" }), () => api.downloadExport(JOB.id));
  assert.equal(result.ok, false);
  assert.deepEqual(!result.ok && "message" in result && [result.code, result.message], ["export_expired", api.EXPIRED_EXPORT_MESSAGE]);
  assert.equal(api.EXPIRED_EXPORT_MESSAGE, "This export expired; request a new one");
});

test("downloadExport: 409 not ready is a refusal and 404 is not a blob either", async () => {
  const notReady = await withFetch(() => json(409, { code: "export_not_ready", message: "wait" }), () => api.downloadExport(JOB.id));
  assert.equal(notReady.result.ok === false && "code" in notReady.result && notReady.result.code, "export_not_ready");
  const gone = await withFetch(() => json(404, { code: "export_not_found" }), () => api.downloadExport(JOB.id));
  assert.equal(gone.result.ok, false);
});

test("deletionStatus: inProgress is true only when the bridge says true", async () => {
  const base = { requestedAt: "2026-10-23T00:00:00Z", scheduledFor: "2026-11-06T00:00:00Z" };
  const running = await withFetch(() => json(200, { ...base, inProgress: true }), () => api.deletionStatus());
  assert.equal(running.result.ok && running.result.data?.inProgress, true);
  for (const body of [base, { ...base, inProgress: false }, { ...base, inProgress: "true" }]) {
    const idle = await withFetch(() => json(200, body), () => api.deletionStatus());
    assert.equal(idle.result.ok && idle.result.data?.inProgress, false);
  }
});

test("cancelDeletion: 409 deletion_in_progress keeps its code", async () => {
  const { result } = await withFetch(() => json(409, { code: "deletion_in_progress", message: "running" }), () => api.cancelDeletion());
  assert.deepEqual(result.ok === false && "code" in result && [result.reason, result.code], ["refused", "deletion_in_progress"]);
});

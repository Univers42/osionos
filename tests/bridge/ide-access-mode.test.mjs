// **************************************************************************** //
//                                                                              //
//    ide-access-mode.test.mjs                                                  //
//                                                                              //
// **************************************************************************** //

// OSIONOS_IDE_ACCESS (verdict B1): allowlist (default) | approved | verified | off. The real modules
// run end to end: the host mint (createIdeTokenHandler), the token verifier, and the plane's gates.
// `verified` ships dark and stays BLOCKED in public (B1.L1-L7); these tests only prove the code.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { configFromEnv, signAppSessionToken, verifyAppSessionToken } from "../../scripts/bridge-api.mjs";
import { createIdeTokenHandler } from "../../scripts/bridge-ide-token.mjs";
import { createIdeSandboxHandler } from "../../scripts/bridge-ide-sandbox.mjs";
import { createIdeExecUpgradeHandler } from "../../scripts/bridge-ide-exec.mjs";
import { requireIdeSubject, requireSandboxIdentity } from "../../scripts/ide-sandbox-spec.mjs";
import { verifyIdeToken } from "../../scripts/ide-token.mjs";
import { resolveAccessMode, requireIdeApproval } from "../../scripts/ide-access.mjs";

const APP_SECRET = "a".repeat(40);
const IDE_SECRET = "k".repeat(32);
const WS = "cccccccc-3333-4333-8333-cccccccccccc";
const CONFIG = configFromEnv({
  OSIONOS_APP_URL: "http://localhost:3001", OSIONOS_APP_SESSION_SECRET: APP_SECRET,
  OSIONOS_BAAS_URL: "http://baas.test", SERVICE_ROLE_KEY: "svc",
});
const PLANE_BASE = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "127.0.0.1:1" };

let counter = 0;
const freshUser = () => `eeeeeeee-6666-4666-8666-${String(++counter).padStart(12, "0")}`;
const appToken = (user) => signAppSessionToken({ payload: { subject: user, provider: "test" }, workspace: { _id: WS }, config: CONFIG }).token;
const codeOf = (fn) => { try { fn(); } catch (error) { return error.code ?? error.message; } return null; };

/** A BaaS stub: `access` rows for osionos_ide_access, `confirmedAt` for the GoTrue admin user. */
function baas({ access = [], confirmedAt = null, fail = false, hang = false } = {}) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (hang) return new Promise(() => {});
    if (fail) throw new Error("baas down");
    const body = String(url).includes("osionos_ide_access") ? access
      : String(url).includes("/auth/v1/admin/users/") ? { email_confirmed_at: confirmedAt }
        : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, urls };
}

function fakeRes() {
  return { statusCode: 0, headers: null, body: "", writeHead(s, h) { this.statusCode = s; this.headers = h; }, end(b) { this.body = String(b ?? ""); } };
}
function fakeReq(method, { body, auth } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.headers = auth ? { authorization: `Bearer ${auth}` } : {};
  return req;
}
async function mint(hostEnv, user, stub) {
  const env = { OSIONOS_IDE_TOKEN_SECRET: IDE_SECRET, OSIONOS_APP_SESSION_SECRET: APP_SECRET, ...hostEnv };
  const handler = createIdeTokenHandler({ config: CONFIG, verifySession: verifyAppSessionToken, env, fetchImpl: stub.fetchImpl });
  const res = fakeRes();
  await handler(new URL("http://x/api/ide/token"), fakeReq("POST", { auth: appToken(user), body: { workspaceId: WS } }), res);
  return { status: res.statusCode, json: JSON.parse(res.body) };
}
function upgradeRefusal(planeEnv, token) {
  const handler = createIdeExecUpgradeHandler({
    config: CONFIG, verifySession: (t) => verifyIdeToken(t, { secret: IDE_SECRET }), env: { ...PLANE_BASE, ...planeEnv }, allowOrigin: () => true,
  });
  let written = "";
  const socket = { destroyed: false, write(c) { written += c; }, destroy() { this.destroyed = true; }, on() {}, once() {}, end() {}, setKeepAlive() {} };
  handler({ url: `/api/ide/pty?workspaceId=${WS}`, headers: { origin: "x", "sec-websocket-protocol": `osio-ide.v1, osio-token.${token}` } }, socket);
  return /^HTTP\/1\.1 (\d+)/.exec(written)?.[1] ?? null;
}

test("resolveAccessMode: unset and empty are allowlist; the four names are exact; anything else is allowlist with no list", () => {
  assert.deepEqual(resolveAccessMode({}), { mode: "allowlist", refuseAll: false });
  assert.deepEqual(resolveAccessMode({ OSIONOS_IDE_ACCESS: "" }), { mode: "allowlist", refuseAll: false });
  for (const mode of ["allowlist", "approved", "verified", "off"]) assert.equal(resolveAccessMode({ OSIONOS_IDE_ACCESS: mode }).mode, mode);
  const quiet = mock.method(console, "warn", () => {});
  for (const bad of ["Verified", "everyone", "approved,off", "1"]) {
    const got = resolveAccessMode({ OSIONOS_IDE_ACCESS: bad });
    assert.deepEqual(got, { mode: "allowlist", refuseAll: true }, bad);
  }
  quiet.mock.restore();
});

test("an unknown value refuses even a listed account, and logs one line per distinct value", () => {
  const user = freshUser();
  const warn = mock.method(console, "warn", () => {});
  const env = { OSIONOS_IDE_ACCESS: "evrybody", OSIONOS_IDE_ALLOWED_SUBJECTS: user };
  for (let i = 0; i < 3; i += 1) assert.equal(codeOf(() => requireIdeSubject(user, env)), "not-allowed");
  assert.equal(warn.mock.callCount(), 1);
  assert.doesNotMatch(String(warn.mock.calls[0].arguments.join(" ")), new RegExp(user));
  warn.mock.restore();
});

test("allowlist mode is today's behaviour: only the env list passes, the denylist is not consulted", () => {
  const user = freshUser();
  assert.equal(codeOf(() => requireIdeSubject(user, { OSIONOS_IDE_ALLOWED_SUBJECTS: user })), null);
  assert.equal(codeOf(() => requireIdeSubject(user, {})), "not-allowed");
  assert.equal(codeOf(() => requireIdeSubject(user, { OSIONOS_IDE_ACCESS: "allowlist", OSIONOS_IDE_ALLOWED_SUBJECTS: "x" })), "not-allowed");
});

test("approved and verified: the sync gate admits any account that is not denied; off refuses everyone", () => {
  const user = freshUser();
  for (const mode of ["approved", "verified"]) {
    assert.equal(codeOf(() => requireIdeSubject(user, { OSIONOS_IDE_ACCESS: mode })), null, mode);
    assert.equal(codeOf(() => requireIdeSubject(user, { OSIONOS_IDE_ACCESS: mode, OSIONOS_IDE_DENIED_SUBJECTS: `x, ${user.toUpperCase()}` })), "not-allowed", `${mode} denied`);
  }
  assert.equal(codeOf(() => requireIdeSubject(user, { OSIONOS_IDE_ACCESS: "off", OSIONOS_IDE_ALLOWED_SUBJECTS: user })), "not-allowed");
});

test("allowlist mode never queries the BaaS for approval (page load stays DB-free)", async () => {
  const stub = baas();
  await requireIdeApproval(CONFIG, stub.fetchImpl, freshUser(), { OSIONOS_IDE_ACCESS: "allowlist" });
  await requireIdeApproval(CONFIG, stub.fetchImpl, freshUser(), {});
  assert.deepEqual(stub.urls, []);
});

test("approved: needs a row with approved_at set and disabled_at null; any error or timeout is not-allowed", async () => {
  const env = { OSIONOS_IDE_ACCESS: "approved" };
  const ask = (stub, timeoutMs) => requireIdeApproval(CONFIG, stub.fetchImpl, freshUser(), env, timeoutMs).then(() => "ok", (e) => e.code);
  assert.equal(await ask(baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: null }] })), "ok");
  assert.equal(await ask(baas({ access: [] })), "not-allowed");
  assert.equal(await ask(baas({ access: [{ approved_at: null, disabled_at: null }] })), "not-allowed");
  assert.equal(await ask(baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: "2026-10-17T11:00:00Z" }] })), "not-allowed");
  assert.equal(await ask(baas({ fail: true })), "not-allowed");
  assert.equal(await ask(baas({ hang: true }), 30), "not-allowed");
});

test("approved does not ask GoTrue; verified needs email_confirmed_at AND no disabled_at", async () => {
  const env = { OSIONOS_IDE_ACCESS: "verified" };
  const ask = (stub, timeoutMs) => requireIdeApproval(CONFIG, stub.fetchImpl, freshUser(), env, timeoutMs).then(() => "ok", (e) => e.code);
  const approvedOnly = baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: null }] });
  await requireIdeApproval(CONFIG, approvedOnly.fetchImpl, freshUser(), { OSIONOS_IDE_ACCESS: "approved" });
  assert.equal(approvedOnly.urls.some((u) => u.includes("/auth/v1/")), false);

  assert.equal(await ask(baas({ confirmedAt: "2026-10-01T00:00:00Z" })), "ok", "confirmed, no row");
  assert.equal(await ask(baas({ confirmedAt: null })), "not-allowed", "unconfirmed");
  assert.equal(await ask(baas({ confirmedAt: "2026-10-01T00:00:00Z", access: [{ approved_at: null, disabled_at: "2026-10-17T11:00:00Z" }] })), "not-allowed", "confirmed but disabled");
  assert.equal(await ask(baas({ fail: true })), "not-allowed");
  assert.equal(await ask(baas({ hang: true }), 30), "not-allowed");
});

test("host mint in approved mode: an approved account gets a token, an unapproved one gets the 200 not-allowed", async () => {
  const hostEnv = { OSIONOS_IDE_ACCESS: "approved" };
  const ok = await mint(hostEnv, freshUser(), baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: null }] }));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  const no = await mint(hostEnv, freshUser(), baas());
  assert.deepEqual([no.status, no.json.ok, no.json.reason], [200, false, "not-allowed"]);
});

test("B1.4 kill switch: host approved + plane off, a valid token is refused on every plane route; restoring the value restores access", async () => {
  const user = freshUser();
  const { json } = await mint({ OSIONOS_IDE_ACCESS: "approved" }, user, baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: null }] }));
  assert.equal(json.ok, true);
  const verify = (token) => verifyIdeToken(token, { secret: IDE_SECRET });

  const off = { ...PLANE_BASE, OSIONOS_IDE_ACCESS: "off", OSIONOS_IDE_ALLOWED_SUBJECTS: user };
  const sandbox = createIdeSandboxHandler({ config: CONFIG, verifySession: verify, env: off });
  const res = fakeRes();
  await sandbox(new URL("http://x/api/ide/session"), fakeReq("POST", { auth: json.token, body: { workspaceId: WS } }), res, CONFIG);
  assert.equal(res.statusCode, 403, "session POST");
  assert.equal(upgradeRefusal(off, json.token), "403", "PTY attach");

  const session = verify(json.token);
  assert.equal(codeOf(() => requireSandboxIdentity(session, WS, { ...PLANE_BASE, OSIONOS_IDE_ACCESS: "approved" })), null, "restored");
});

test("B4.4 disable: the host stops minting within one token TTL, and the plane denylist refuses a still-valid token at once", async () => {
  const user = freshUser();
  const hostEnv = { OSIONOS_IDE_ACCESS: "approved" };
  const { json } = await mint(hostEnv, user, baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: null }] }));
  assert.equal(json.ok, true);

  const disabledAtHost = await mint(hostEnv, user, baas({ access: [{ approved_at: "2026-10-17T10:00:00Z", disabled_at: "2026-10-17T12:00:00Z" }] }));
  assert.equal(disabledAtHost.json.reason, "not-allowed");

  const plane = { ...PLANE_BASE, OSIONOS_IDE_ACCESS: "approved" };
  assert.notEqual(upgradeRefusal(plane, json.token), "403", "before the denylist the attach is not refused as forbidden");
  assert.equal(upgradeRefusal({ ...plane, OSIONOS_IDE_DENIED_SUBJECTS: user }, json.token), "403", "denied at the plane");
});

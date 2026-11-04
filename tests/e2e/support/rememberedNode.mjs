// This computer's osionos-node for the "remember this computer" spec (devil verdict 2026-11-01,
// Amendment 1, R12): the real IDE origin on 127.0.0.1:4100 serving the built terminal page, a
// paired machine that remembers the test app's origin, and a stubbed bridge that signs real machine
// tokens and resume assertions for it. The pty socket is routed by Playwright into the node's real
// /api/pty service; the shells are fakes that print a prompt. Nothing leaves the container.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createIdeOriginServer } from "../../../packages/osionos-node/ide-origin.mjs";
import { createMachineSession } from "../../../packages/osionos-node/machine-identity.mjs";
import { createRememberedComputers } from "../../../packages/osionos-node/remembered-computers.mjs";
import { createClientHandler } from "../../../packages/osionos-node/static-client.mjs";
import { bridgeKeyFromSeed, signMachineToken, signResumeAssertion } from "../../../scripts/ide-machine-protocol.mjs";
import { FakeConn } from "../../bridge/support/pty-fakes.mjs";
import { MACHINE, OWNER, pairedMachine } from "../../bridge/support/paired-node.mjs";
import { stubBridge } from "./bridgeStub.mjs";

export const NODE_ORIGIN = "http://127.0.0.1:4100";
const TERMINAL_BUILD = fileURLToPath(new URL("../../../build/terminal", import.meta.url));

export const terminalPageBuilt = () => existsSync(join(TERMINAL_BUILD, "index.html"));

/** A pty host whose shells print one prompt and record what is typed. */
function promptingHost() {
  const host = { spawned: 0, async spawn(_size, events) {
    host.spawned += 1;
    setTimeout(() => events.data("remembered$ "), 10);
    return { write() {}, resize() {}, ack() {}, kill() {} };
  } };
  return host;
}

/** Starts the node; `stop()` closes it and deletes its state. */
export async function startRememberingNode(appOrigin) {
  const seed = randomBytes(32).toString("base64url");
  const dir = mkdtempSync(join(tmpdir(), "remembered-node-"));
  chmodSync(dir, 0o700);
  const devices = createRememberedComputers({ file: join(dir, "remembered-computers.json"), owner: OWNER, machine: MACHINE, origins: [appOrigin] });
  const host = promptingHost();
  const origin = createIdeOriginServer({
    ...createMachineSession({ machine: pairedMachine(bridgeKeyFromSeed(seed)), home: dir }).originOptions,
    ownerId: OWNER, ideOrigin: NODE_ORIGIN, commit: "c".repeat(40),
    nodes: { [MACHINE]: { socketPath: join(dir, "none.sock"), extensionRoots: [] } },
    client: createClientHandler({ root: TERMINAL_BUILD, terminalRoot: TERMINAL_BUILD, appOrigins: [appOrigin] }),
    // Never called: Playwright routes the frame's socket to `attach` below.
    pty: { host, accept: async () => null },
    devices,
  });
  await new Promise((resolve, reject) => origin.server.once("error", reject).listen(4100, "127.0.0.1", resolve));
  const stop = () => {
    origin.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { seed, host, devices, origin, stop };
}

/** Every /api/pty socket of `context` goes to the node's real pty service, unchanged. */
export async function routePtyToNode(context, node) {
  await context.routeWebSocket(`${NODE_ORIGIN.replace("http", "ws")}/api/pty`, (socket) => {
    const conn = new FakeConn();
    conn.send = (text) => { if (conn.closeCode === null) socket.send(text); };
    const close = conn.close.bind(conn);
    conn.close = (code = 1005) => { if (conn.closeCode === null) socket.close({ code }); close(code); };
    socket.onMessage((message) => conn.receive(String(message)));
    socket.onClose(() => close(1006));
    node.origin.pty.attach(conn);
  });
}

const json = (status, body) => ({ status, json: body });

/** The account's bridge: the machine list, the identity check, the step-up and both mints. `calls` counts each. */
export async function stubMachineBridge(context, node) {
  const calls = { sudoEmail: 0, sudoVerify: 0, tokenRefused: 0, token: 0, rememberedTokens: 0, resume: 0 };
  let sudo = false;
  const row = { id: MACHINE, name: "laptop", platform: "linux-x64", fingerprint: "ABCD", isDefault: true, online: true, ideOrigin: NODE_ORIGIN, lastSeenAt: null };
  await stubBridge(context, (url, request) => {
    const path = url.pathname;
    if (path === "/api/machines" && request.method() === "GET") return json(200, { machines: [row] });
    if (path === `/api/machines/${MACHINE}/identity`) return json(200, { ok: true });
    if (path === "/api/account/sudo" && request.method() === "GET") return json(200, { active: sudo });
    if (path === "/api/account/sudo/email") { calls.sudoEmail += 1; return json(200, { sentTo: "owner@example.test" }); }
    if (path === "/api/account/sudo/verify") { calls.sudoVerify += 1; sudo = true; return json(200, { ok: true }); }
    if (path === `/api/machines/${MACHINE}/token`) {
      if (!sudo) { calls.tokenRefused += 1; return json(403, { ok: false, message: "sudo", code: "sudo_required" }); }
      calls.token += 1;
      const remember = request.postDataJSON()?.remember === true;
      if (remember) calls.rememberedTokens += 1;
      return json(200, signMachineToken({ sub: OWNER, machine: MACHINE, aud: NODE_ORIGIN, seed: node.seed, remember }));
    }
    if (path === `/api/machines/${MACHINE}/resume`) {
      calls.resume += 1;
      return json(200, signResumeAssertion({ sub: OWNER, machine: MACHINE, aud: NODE_ORIGIN, seed: node.seed }));
    }
    return undefined;
  });
  return calls;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-dap.test.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { DapSession } from "../../src/features/ide/model/dapSession.ts";
import { useDebugStore } from "../../src/features/ide/model/debugStore.ts";
import { continueRun, startPythonDebug, stopDebug } from "../../src/features/ide/model/debugController.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { lspServerFor, lspSocketCloseHandler } from "../../src/features/ide/model/lspClient.ts";
import type { Transport } from "../../src/features/ide/model/lspProtocol.ts";

// The browser half of Python debugging: the DAP client over the same framed
// transport as the LSP client, plus the controller driving one debugpy run. The
// adapter is a fake here — it answers what it is told to, never more.

interface Frame { type: string; seq?: number; command?: string; request_seq?: number; success?: boolean; message?: string; arguments?: unknown }
interface Answer { body?: unknown; message?: string; silent?: boolean }
interface Adapter { transport: Transport; frames: Frame[]; push(message: string): void; event(name: string, body?: unknown): void; reverse(command: string): void; requests(): Frame[] }

// A command with no entry here is never answered, which is how a request is made to time out.
const ANSWERS: Record<string, Answer> = { initialize: {}, launch: {}, setBreakpoints: {}, configurationDone: {}, disconnect: {}, continue: {} };

function createAdapter(answers: Record<string, Answer> = {}): Adapter {
  const table = { ...ANSWERS, ...answers };
  const subs = new Set<(message: string) => void>();
  const frames: Frame[] = [];
  let seq = 0;
  const push = (message: string): void => { for (const h of subs) h(message); };
  const send = (frame: Record<string, unknown>): void => push(JSON.stringify(frame));
  const transport: Transport = {
    send(raw) {
      const frame = JSON.parse(raw) as Frame;
      frames.push(frame);
      const answer = table[frame.command ?? ""];
      if (frame.type !== "request" || !answer || answer.silent) return;
      const ok = answer.message === undefined;
      send({ seq: ++seq, type: "response", request_seq: frame.seq, command: frame.command, success: ok, message: answer.message, body: answer.body ?? {} });
    },
    subscribe(h) { subs.add(h); },
    unsubscribe(h) { subs.delete(h); },
  };
  return {
    transport, frames, push,
    requests: () => frames.filter((f) => f.type === "request"),
    event: (name, body) => send({ seq: ++seq, type: "event", event: name, body }),
    reverse: (command) => send({ seq: ++seq, type: "request", command, arguments: { cwd: "/workspace" } }),
  };
}

/** A socket with no browser behind it: only the transport is ever used. */
function fakeSocket(transport: Transport): { transport: Transport; closed: Promise<void>; close: () => void } {
  let drop: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => { drop = resolve; });
  return { transport, closed, close: drop };
}

/** Let the controller's await chain run out. */
const tick = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setTimeout(r, 0); }); };

test("a request resolves on success, rejects on a refusal and times out unanswered", async () => {
  const adapter = createAdapter({ boom: { message: "adapter exploded" }, neverAnswered: { silent: true } });
  const session = new DapSession(adapter.transport, { timeoutMs: 30 });
  assert.deepEqual(await session.request("initialize", { adapterID: "python" }), {});
  await assert.rejects(session.request("boom", {}), /adapter exploded/);
  await assert.rejects(session.request("neverAnswered"), /timed out/);
});

test("dispose fails pending work; a torn frame, an unknown type and a throwing subscriber are survived", async () => {
  const adapter = createAdapter({ neverAnswered: { silent: true } });
  const session = new DapSession(adapter.transport, { timeoutMs: 5_000 });
  let seen = 0;
  session.onEvent(() => { throw new Error("panel exploded"); });
  session.onEvent(() => { seen += 1; });
  adapter.push("{not json");
  adapter.push("null");
  adapter.push(JSON.stringify({ type: "telemetry" }));
  adapter.event("output", { output: "hello" });
  assert.equal(seen, 1);
  const pending = session.request("neverAnswered");
  session.dispose();
  await assert.rejects(pending, /disposed/);
  await assert.rejects(session.request("neverAnswered"), /disposed/);
  assert.equal(adapter.requests().length, 1);
});

test("runInTerminal and startDebugging reverse requests are refused, never delegated", () => {
  const adapter = createAdapter();
  const session = new DapSession(adapter.transport, { timeoutMs: 200 });
  let events = 0;
  const off = session.onEvent(() => { events += 1; });
  adapter.reverse("runInTerminal");
  adapter.reverse("startDebugging");
  const replies = adapter.frames.filter((f) => f.type === "response");
  assert.deepEqual(replies.map((f) => f.command), ["runInTerminal", "startDebugging"]);
  for (const reply of replies) { assert.equal(typeof reply.seq, "number"); assert.equal(reply.success, false); assert.equal(reply.message, "not supported"); assert.equal(typeof reply.request_seq, "number"); }
  assert.equal(events, 0);
  off();
});

test("the controller runs initialize, launch, setBreakpoints and configurationDone", async () => {
  const adapter = createAdapter();
  useDebugStore.setState({ breakpoints: { "app.py": [3] } });
  await startPythonDebug("w1", "app.py", { connect: () => fakeSocket(adapter.transport) });
  assert.deepEqual(adapter.requests().map((f) => f.command), ["initialize", "launch"]);
  adapter.event("initialized");
  await tick();
  assert.deepEqual(adapter.requests().map((f) => f.command), ["initialize", "launch", "setBreakpoints", "configurationDone"]);
  assert.deepEqual(adapter.requests()[2].arguments, { source: { path: "/workspace/app.py" }, breakpoints: [{ line: 3 }], lines: [3] });
  assert.equal(useDebugStore.getState().status, "running");
  continueRun();
  assert.equal(adapter.requests().at(-1)?.command, "configurationDone", "continue is a no-op unless stopped");
  await stopDebug();
  assert.equal(useDebugStore.getState().status, "ended");
  assert.deepEqual(adapter.requests().at(-1)?.arguments, { terminateDebuggee: true });
});

test("a stop fills frames and variables, a terminate ends the run", async () => {
  const stack = [{ id: 11, name: "<module>", source: { path: "/workspace/app.py" }, line: 5 }, { id: 12, name: "helper", source: { path: "/usr/lib/python3/json.py" }, line: 3 }];
  const adapter = createAdapter({
    stackTrace: { body: { stackFrames: stack } },
    scopes: { body: { scopes: [{ name: "Locals", variablesReference: 42 }] } },
    variables: { body: { variables: [{ name: "x", value: "7", type: "int" }, { name: "y", value: "None" }] } },
  });
  useDebugStore.setState({ breakpoints: { "app.py": [3] } });
  await startPythonDebug("w1", "app.py", { connect: () => fakeSocket(adapter.transport) });
  adapter.event("stopped", { reason: "breakpoint", threadId: 9 });
  await tick();
  const store = useDebugStore.getState();
  assert.equal(store.status, "stopped");
  assert.equal(store.stoppedReason, "breakpoint");
  assert.deepEqual(store.frames, [{ id: 11, name: "<module>", path: "app.py", line: 5 }, { id: 12, name: "helper", path: null, line: 3 }]);
  assert.deepEqual(store.variables, [{ name: "x", value: "7", type: "int" }, { name: "y", value: "None" }]);
  adapter.event("output", { category: "telemetry", output: "debugpy usage" });
  adapter.event("output", { output: "traceback line\nsecond line\n" });
  assert.deepEqual(useDebugStore.getState().output, ["traceback line", "second line"]);
  continueRun();
  assert.equal(adapter.requests().at(-1)?.command, "continue");
  assert.equal(useDebugStore.getState().status, "running");
  adapter.event("terminated");
  assert.equal(useDebugStore.getState().status, "ended");
});

test("a failed request ends the run and stores the error instead of throwing", async () => {
  const adapter = createAdapter({ initialize: { message: "no debugpy in this sandbox" } });
  useDebugStore.setState({ breakpoints: {} });
  await startPythonDebug("w1", "app.py", { connect: () => fakeSocket(adapter.transport) });
  assert.equal(useDebugStore.getState().status, "ended");
  assert.match(useDebugStore.getState().error ?? "", /no debugpy/);
  assert.deepEqual(adapter.requests().map((f) => f.command), ["initialize"]);
});

test("a second start stops the first and both lifecycle lines reach the debug channel", async () => {
  useIdeOutputBus.getState().clear();
  const first = createAdapter();
  const second = createAdapter();
  await startPythonDebug("w1", "a.py", { connect: () => fakeSocket(first.transport) });
  await startPythonDebug("w1", "b.py", { connect: () => fakeSocket(second.transport) });
  assert.deepEqual(useIdeOutputBus.getState().lines.map((l) => l.text), ["Debugging a.py", "Debug session ended", "Debugging b.py"]);
  assert.equal(useDebugStore.getState().status, "starting");
  await stopDebug();
});

test("lspClient still exports its language map and logs the 4137 out-of-memory close", () => {
  useIdeOutputBus.getState().clear();
  assert.equal(lspServerFor("python"), "python");
  lspSocketCloseHandler("python")(4137);
  lspSocketCloseHandler("python")(1000);
  const lines = useIdeOutputBus.getState().lines;
  assert.equal(lines.length, 1);
  assert.equal(lines[0].channel, "lsp");
  assert.match(lines[0].text, /Python language server stopped \(out of memory\)/);
});
/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   debugController.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { connectFramedIdeSocket } from "./framedIdeSocket";
import { DapSession } from "./dapSession";
import { useDebugStore, type DebugFrame } from "./debugStore";
import { ideOutput } from "./ideOutputBus";
import type { Transport } from "./lspProtocol";

// The Python debug run end to end: one socket to the sandbox's debugpy, the DAP
// handshake, the store's breakpoints, and the adapter event → store mapping.

const WORKSPACE_ROOT = "/workspace";
const DEBUG_PATH = "/api/ide/debug";
// Ponytail: 20 frames is what the panel shows; a deeper recursion (or a stack longer
// than this) is cut off at the top of the stack, where the reader is anyway.
const STACK_LEVELS = 20;

const INITIALIZE_ARGS = {
  clientID: "osionos", adapterID: "python", linesStartAt1: true, columnsStartAt1: true, pathFormat: "path",
  supportsRunInTerminalRequest: false, supportsStartDebuggingRequest: false,
};

/** One IDE debug socket: the fake connector's shape and the real one. */
export type DebugSocket = { transport: Transport; closed: Promise<void>; close: () => void };
export type DebugConnector = (path: string, params: Record<string, string>, workspaceId: string) => DebugSocket;
export interface DebugDeps { connect?: DebugConnector }

interface ActiveRun {
  session: DapSession;
  close(): void;
  threadId: number;
}

let active: ActiveRun | null = null;

/** Untrusted adapter payload → a record to read fields off. O(1). */
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const number = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const text = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

/** `/workspace/a/b.py` → `a/b.py`; a stdlib frame has no workspace file to open. */
function workspacePath(value: unknown): string | null {
  const path = text(value, "");
  return path.startsWith(`${WORKSPACE_ROOT}/`) ? path.slice(WORKSPACE_ROOT.length + 1) : null;
}

function launchArgs(path: string): Record<string, unknown> {
  return {
    type: "python", request: "launch", name: path,
    program: `${WORKSPACE_ROOT}/${path}`, cwd: WORKSPACE_ROOT,
    console: "internalConsole", justMyCode: true,
  };
}

/** Tear the run down exactly once: fail its requests, close the socket, mark it ended. */
function endRun(run: ActiveRun): void {
  if (active === run) active = null;
  run.session.dispose();
  run.close();
  useDebugStore.getState().setStatus("ended");
  ideOutput("debug", "Debug session ended");
}

/** A failed request ends the run instead of reaching the caller. */
function failRun(run: ActiveRun, error: unknown): void {
  if (active !== run) return;
  useDebugStore.getState().setError(error instanceof Error ? error.message : String(error));
  endRun(run);
}

/** O(1) per request, and it never rejects. */
function guarded(run: ActiveRun, command: Promise<unknown>): void {
  void command.catch((error: unknown) => failRun(run, error));
}

/** O(files with breakpoints + lines per file): one request each, in file order. */
async function sendBreakpoints(run: ActiveRun): Promise<void> {
  const store = useDebugStore.getState();
  for (const file of Object.keys(store.breakpoints).sort()) {
    const lines = store.breakpoints[file];
    await run.session.request("setBreakpoints", {
      source: { path: `${WORKSPACE_ROOT}/${file}` },
      breakpoints: lines.map((line) => ({ line })),
      lines,
    });
  }
  await run.session.request("configurationDone", {});
  if (active === run) useDebugStore.getState().setStatus("running");
}

/** O(frames): the adapter already returns the top of the stack first. */
async function loadFrames(run: ActiveRun, threadId: number): Promise<DebugFrame[]> {
  const body = record(await run.session.request("stackTrace", { threadId, levels: STACK_LEVELS }));
  const frames = Array.isArray(body.stackFrames) ? body.stackFrames : [];
  return frames.slice(0, STACK_LEVELS).map((raw) => {
    const frame = record(raw);
    return { id: number(frame.id, 0), name: text(frame.name, ""), path: workspacePath(record(frame.source).path), line: number(frame.line, 0) };
  });
}

/** O(variables of the top frame's first scope); O(1) for a frame with no scope. */
async function loadVariables(run: ActiveRun, frame: DebugFrame | undefined): Promise<void> {
  const scopes = record(await run.session.request("scopes", { frameId: frame?.id ?? 0 }));
  const list = Array.isArray(scopes.scopes) ? scopes.scopes : [];
  const reference = number(record(list[0]).variablesReference, 0);
  const body = reference === 0 ? {} : record(await run.session.request("variables", { variablesReference: reference }));
  const items = Array.isArray(body.variables) ? body.variables : [];
  const variables = items.map((raw) => {
    const item = record(raw);
    const type = text(item.type, "");
    const shown = { name: text(item.name, ""), value: text(item.value, "") };
    return type === "" ? shown : { ...shown, type };
  });
  useDebugStore.getState().setVariables(variables);
}

/** Stack, scopes and variables of a stop, then the stopped status. */
async function onStopped(run: ActiveRun, body: unknown): Promise<void> {
  const params = record(body);
  run.threadId = number(params.threadId, 0);
  const store = useDebugStore.getState();
  store.setStoppedReason(text(params.reason, "stopped"));
  try {
    const frames = await loadFrames(run, run.threadId);
    if (active !== run) return;
    store.setFrames(frames);
    await loadVariables(run, frames[0]);
  } catch (error) {
    failRun(run, error);
    return;
  }
  if (active === run) useDebugStore.getState().setStatus("stopped");
}

/** O(1) per event, except `stopped`, which walks the stack. */
async function handleEvent(run: ActiveRun, event: string, body: unknown): Promise<void> {
  if (active !== run) return;
  if (event === "initialized") { guarded(run, sendBreakpoints(run)); return; }
  if (event === "stopped") { await onStopped(run, body); return; }
  // debugpy also reports usage through `output` events in the "telemetry" category: not program output.
  if (event === "output") { const out = record(body); if (out.category !== "telemetry") useDebugStore.getState().appendOutput(text(out.output, "")); return; }
  if (event === "continued") { useDebugStore.getState().setStatus("running"); return; }
  if (event === "terminated" || event === "exited") endRun(run);
}

/** Debug a workspace file. O(1) besides the adapter's answers; resolves once `launch`
 *  is on the wire and never rejects — a failure lands in the store's `error`. */
export async function startPythonDebug(workspaceId: string, path: string, deps: DebugDeps = {}): Promise<void> {
  if (active) endRun(active);
  useDebugStore.getState().reset();
  ideOutput("debug", `Debugging ${path}`);
  const socket = (deps.connect ?? connectFramedIdeSocket)(DEBUG_PATH, { lang: "python" }, workspaceId);
  const run: ActiveRun = { session: new DapSession(socket.transport), close: socket.close, threadId: 0 };
  active = run;
  useDebugStore.getState().setStatus("starting");
  void socket.closed.then(() => { if (active === run) endRun(run); });
  run.session.onEvent((event, body) => { void handleEvent(run, event, body); });
  try {
    await run.session.request("initialize", INITIALIZE_ARGS);
  } catch (error) {
    failRun(run, error);
    return;
  }
  // debugpy answers `launch` only after configurationDone, so its response is not awaited here.
  guarded(run, run.session.request("launch", launchArgs(path)));
}

/** Resume the stopped thread with `command`. A no-op unless a run is stopped: debugpy
 *  refuses a step on a running thread, and that refusal would end the whole run. */
function resume(command: "continue" | "next" | "stepIn" | "stepOut"): void {
  const run = active;
  if (!run || useDebugStore.getState().status !== "stopped") return;
  useDebugStore.getState().setStatus("running");
  guarded(run, run.session.request(command, { threadId: run.threadId }));
}
export function continueRun(): void { resume("continue"); }
export function stepOver(): void { resume("next"); }
export function stepIn(): void { resume("stepIn"); }
export function stepOut(): void { resume("stepOut"); }

/** Terminate the program through the adapter, then drop the socket. No-op without a run. */
export async function stopDebug(): Promise<void> {
  const run = active;
  if (!run) return;
  try { await run.session.request("disconnect", { terminateDebuggee: true }); }
  catch { /* the adapter is already gone; the socket closes either way */ }
  if (active === run) endRun(run);
}
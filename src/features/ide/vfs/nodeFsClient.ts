// The editor page's socket to this computer's node (devil verdict 2026-11-01 editor on disk, F7,
// F13): one `ws://<node>/api/fs`, numbered requests, chunked reads and writes, and the node's watch
// events. It runs only on the node's own page. Its errors are the VFS taxonomy, so the tree and the
// editor read them as they read any other filesystem.
import { fsError, type FsErrorCode } from "./errors";

const CLOSE_AUTH = 4401;
const WIRE_ERRORS = new Set<FsErrorCode>([
  "NotFound", "PermissionDenied", "NotADirectory", "IsADirectory", "NotEmpty", "AlreadyExists",
  "Loop", "NoSpace", "ReadOnly", "TooLarge", "Interrupted", "Unsupported", "Io",
]);

/** The node's own word for a save over a file that changed: not an error, a choice for the person. */
export class DiskConflict extends Error {}

export type NodeFsCredential = { token: string } | { secret: string };

export interface NodeFsSocket {
  send(text: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
}

export type NodeFsState = "connecting" | "open" | "closed";
export type WatchMessage = { op: "changed"; names: string[] } | { op: "rescan" };

export interface NodeFsDeps {
  open(): NodeFsSocket;
  credential(): Promise<NodeFsCredential>;
  keepSecret(secret: string): void;
  dropSecret(): void;
  appOrigin: string;
  onState(state: NodeFsState): void;
  /** Waits before a reconnect; injected so tests do not sleep. */
  later?: (run: () => void) => void;
}

type Pending = { resolve(value: Record<string, unknown>): void; reject(error: unknown): void };

export interface NodeFsClient {
  request(op: string, fields: Record<string, unknown>): Promise<Record<string, unknown>>;
  onWatch(id: number, listener: (message: WatchMessage) => void): () => void;
  onRootsChanged(listener: () => void): () => void;
  close(): void;
}

function wireError(code: unknown): Error {
  if (code === "Conflict") return new DiskConflict();
  return fsError(WIRE_ERRORS.has(code as FsErrorCode) ? (code as FsErrorCode) : "Io");
}

export function createNodeFsClient(deps: NodeFsDeps): NodeFsClient {
  const later = deps.later ?? ((run) => { setTimeout(run, 2000); });
  const pending = new Map<number, Pending>();
  const watchers = new Map<number, (message: WatchMessage) => void>();
  const rootListeners = new Set<() => void>();
  let socket: NodeFsSocket | null = null;
  let opened = false;
  let closed = false;
  let nextId = 1;
  let waitingForOpen: Array<() => void> = [];

  function failAll(): void {
    for (const { reject } of pending.values()) reject(fsError("Interrupted", undefined, "the connection closed"));
    pending.clear();
    watchers.clear();
  }

  function onMessage(text: string): void {
    const message = JSON.parse(text) as Record<string, unknown>;
    if (!opened) {
      if (message.op !== "opened") return;
      opened = true;
      if (typeof message.secret === "string") deps.keepSecret(message.secret);
      deps.onState("open");
      for (const run of waitingForOpen) run();
      waitingForOpen = [];
      return;
    }
    if (message.op === "rootsChanged") {
      for (const listener of rootListeners) listener();
      return;
    }
    if (message.op === "changed" || message.op === "rescan") {
      const names = Array.isArray(message.names) ? (message.names as string[]) : [];
      watchers.get(message.watch as number)?.(message.op === "changed" ? { op: "changed", names } : { op: "rescan" });
      return;
    }
    const waiter = pending.get(message.id as number);
    if (!waiter) return;
    pending.delete(message.id as number);
    if (message.ok === true) waiter.resolve(message);
    else waiter.reject(wireError(message.error));
  }

  function connect(): void {
    deps.onState("connecting");
    const next = deps.open();
    socket = next;
    next.onopen = () => {
      void deps.credential().then((credential) => next.send(JSON.stringify({ ...credential, appOrigin: deps.appOrigin })));
    };
    next.onmessage = (event) => onMessage(String(event.data));
    next.onclose = (event) => {
      if (socket !== next) return;
      socket = null;
      opened = false;
      if (event.code === CLOSE_AUTH) deps.dropSecret();
      failAll();
      deps.onState("closed");
      // A node restart or a laptop waking: the page stays and comes back on its own.
      if (!closed) later(connect);
    };
  }

  connect();

  return {
    request(op, fields) {
      return new Promise((resolve, reject) => {
        const send = () => {
          const id = nextId;
          nextId += 1;
          pending.set(id, { resolve, reject });
          socket?.send(JSON.stringify({ id, op, ...fields }));
        };
        if (opened) send();
        else waitingForOpen.push(send);
      });
    },
    onRootsChanged(listener) {
      rootListeners.add(listener);
      return () => { rootListeners.delete(listener); };
    },
    onWatch(id, listener) {
      watchers.set(id, listener);
      return () => { watchers.delete(id); };
    },
    close() {
      closed = true;
      socket?.close();
    },
  };
}

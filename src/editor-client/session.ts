// The editor page's link and socket. It links to the app exactly as the terminal page does, so the
// machine token, the step-up, the node's exact Origin and a remembered computer are the same door
// (F4, F5, D1): the device secret is the terminal page's, under the same key in this node origin's
// storage, and opens the editor beside a resume assertion. No /api/fs opening leaves before the app
// that frames it has spoken: the opening names that app's origin, and nothing else can (TB4). Frames
// of this page share a channel; a later frame takes the session secret from one already open, so a
// file opens without a second emailed code, but only from a frame pinned to the same app origin.
import { EDITOR_CHANNEL } from "../features/machines/model/editorFrameProtocol";
import { whoami } from "../features/ide/vscode/machineWhoami";
import { linkTerminalToApp, type TerminalAppLink, type TerminalAppLinkDeps } from "../features/ide/model/terminalAppLink";
import { createNodeFsClient, type NodeFsClient, type NodeFsCredential, type NodeFsSocket, type NodeFsState } from "../features/ide/vfs/nodeFsClient";
import { rememberedStoreOver } from "../features/ide/model/terminalCredentials";
import { forgetOnNode, pageAppOrigins, selfNode } from "../features/ide/model/nodePage";

// Caveat: a frame busier than this does not answer in time; the asker then opens with a token from
// the app (one more mint, possibly a step-up), never with a wrong secret.
const PEER_WAIT_MS = 250;
const FS_SOCKET_PATH = "/api/fs";

type PeerListener = (event: { data: unknown }) => void;

/** Same-origin talk between this page's frames (a BroadcastChannel): never reaches the app. */
export interface PeerChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: PeerListener): void;
  removeEventListener(type: "message", listener: PeerListener): void;
}

export type EditorSession<Peers extends PeerChannel = BroadcastChannel> = {
  client: NodeFsClient;
  link: TerminalAppLink;
  peers: Peers;
};

export type EditorSessionDeps<Peers extends PeerChannel> = Omit<TerminalAppLinkDeps, "readyAsks"> & {
  peers: Peers;
  openSocket(): NodeFsSocket;
  onState(state: NodeFsState): void;
  later?: (run: () => void) => void;
  peerWaitMs?: number;
};

type SecretAnswer = { type: "secret"; secret: string; appOrigin: string };

const isAnswerFor = (data: unknown, appOrigin: string): data is SecretAnswer => {
  const answer = data as Partial<SecretAnswer> | null;
  return answer?.type === "secret" && typeof answer.secret === "string" && answer.appOrigin === appOrigin;
};

function peerSecret(peers: PeerChannel, appOrigin: string, waitMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const onAnswer: PeerListener = ({ data }) => { if (isAnswerFor(data, appOrigin)) finish(data.secret); };
    const finish = (secret: string | null) => {
      clearTimeout(timer);
      peers.removeEventListener("message", onAnswer);
      resolve(secret);
    };
    const timer = setTimeout(() => finish(null), waitMs);
    peers.addEventListener("message", onAnswer);
    peers.postMessage({ type: "secret?", appOrigin });
  });
}

/** Resolves once the app has spoken, with the socket open from then on; null when not framed by it. */
export function createEditorSession<Peers extends PeerChannel>(deps: EditorSessionDeps<Peers>): Promise<EditorSession<Peers>> | null {
  const { peers, openSocket, onState, later, peerWaitMs = PEER_WAIT_MS, listen, ...linkDeps } = deps;
  let pin: (origin: string) => void = () => {};
  const pinned = new Promise<string>((resolve) => { pin = resolve; });
  let linked: TerminalAppLink | null = null;
  const link = linkTerminalToApp({
    ...linkDeps,
    // The app answers `ready` with the first grant (#304): asking again would mint twice.
    readyAsks: true,
    listen: (handler) => listen((event) => {
      handler(event);
      const origin = linked?.appOrigin();
      if (origin) pin(origin);
    }),
  });
  if (!link) return null;
  linked = link;
  return pinned.then((appOrigin) => ({ client: openFs(link, appOrigin), link, peers }));

  function openFs(app: TerminalAppLink, appOrigin: string): NodeFsClient {
    let secret: string | null = null;
    let peerTried = false;
    peers.addEventListener("message", ({ data }) => {
      const question = data as { type?: unknown; appOrigin?: unknown } | null;
      if (question?.type !== "secret?" || question.appOrigin !== appOrigin || !secret) return;
      peers.postMessage({ type: "secret", secret, appOrigin } satisfies SecretAnswer);
    });

    async function credential(): Promise<NodeFsCredential> {
      if (secret) return { secret, appOrigin };
      if (!peerTried) {
        peerTried = true;
        const shared = await peerSecret(peers, appOrigin, peerWaitMs);
        if (shared) return { secret: shared, appOrigin };
      }
      const taken = await app.credentials.take();
      if ("secret" in taken) return { secret: taken.secret, appOrigin };
      if ("device" in taken) return { device: taken.device, assertion: taken.assertion, appOrigin };
      return { token: taken.token, appOrigin };
    }

    return createNodeFsClient({
      open: openSocket,
      credential,
      keepSecret: (value) => { secret = value; },
      dropSecret: () => { secret = null; app.credentials.dropSecret(); },
      keepDevice: (device) => app.credentials.keepDevice(device),
      dropDevice: () => app.credentials.dropDevice(),
      onState: (state) => {
        if (state === "open") app.report("connected");
        onState(state);
      },
      later,
    });
  }
}

export async function startEditorSession(onAppMessage: (data: unknown) => boolean, onState: (state: NodeFsState) => void): Promise<EditorSession | null> {
  const self = await selfNode();
  if (!self) return null;
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${FS_SOCKET_PATH}`;
  return createEditorSession({
    page: { parent: window.parent, top: window.top, self: window },
    appOrigins: pageAppOrigins(),
    node: self.node,
    remembers: self.remembers,
    store: rememberedStoreOver(() => window.localStorage),
    forgetOnNode,
    post: (message, origin) => window.parent.postMessage(message, origin),
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },
    whoami,
    onAppMessage,
    peers: new BroadcastChannel(EDITOR_CHANNEL),
    openSocket: () => new WebSocket(url) as never,
    onState,
  });
}

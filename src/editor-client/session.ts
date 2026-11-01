// The editor page's link and socket. It links to the app exactly as the terminal page does, so the
// machine token, the step-up and the node's exact Origin are the same door (F4, F5). Every frame of
// this page shares the node origin, and with it a session: a later frame takes the secret from one
// already open, so opening a file does not ask for another emailed code.
import { EDITOR_CHANNEL } from "../features/machines/model/editorFrameProtocol";
import { readSelf } from "../features/ide/vscode/machineSession";
import { whoami } from "../features/ide/vscode/machineWhoami";
import { linkTerminalToApp, type TerminalAppLink } from "../features/ide/model/terminalAppLink";
import { createNodeFsClient, type NodeFsClient, type NodeFsCredential, type NodeFsState } from "../features/ide/vfs/nodeFsClient";

const PEER_WAIT_MS = 250;
const FS_SOCKET_PATH = "/api/fs";

const appOrigins = (): string[] =>
  (document.querySelector<HTMLMetaElement>('meta[name="osionos-app-origin"]')?.content ?? "").split(" ").filter(Boolean);

async function selfNode(): Promise<string | null> {
  const res = await fetch("/api/machine/self", { credentials: "same-origin" });
  return res.status === 200 ? readSelf(await res.json().catch(() => null)) : null;
}

export type EditorSession = {
  client: NodeFsClient;
  link: TerminalAppLink;
  /** Same-origin talk between this page's frames: never reaches the app. */
  peers: BroadcastChannel;
};

function peerSecret(peers: BroadcastChannel): Promise<string | null> {
  return new Promise((resolve) => {
    const onAnswer = (event: MessageEvent) => {
      if (event.data?.type !== "secret") return;
      finish(typeof event.data.secret === "string" ? event.data.secret : null);
    };
    const finish = (secret: string | null) => {
      clearTimeout(timer);
      peers.removeEventListener("message", onAnswer);
      resolve(secret);
    };
    const timer = setTimeout(() => finish(null), PEER_WAIT_MS);
    peers.addEventListener("message", onAnswer);
    peers.postMessage({ type: "secret?" });
  });
}

export async function startEditorSession(onAppMessage: (data: unknown) => boolean, onState: (state: NodeFsState) => void): Promise<EditorSession | null> {
  const node = await selfNode();
  if (!node) return null;
  const peers = new BroadcastChannel(EDITOR_CHANNEL);
  const link = linkTerminalToApp({
    page: { parent: window.parent, top: window.top, self: window },
    appOrigins: appOrigins(),
    node,
    post: (message, origin) => window.parent.postMessage(message, origin),
    listen: (handler) => {
      const onMessage = (event: MessageEvent) => handler(event);
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    },
    whoami,
    onAppMessage,
  });
  if (!link) return null;
  const linked = link;

  let secret: string | null = null;
  let peerTried = false;
  peers.addEventListener("message", (event) => {
    if (event.data?.type === "secret?" && secret) peers.postMessage({ type: "secret", secret });
  });

  async function credential(): Promise<NodeFsCredential> {
    if (secret) return { secret };
    if (!peerTried) {
      peerTried = true;
      const shared = await peerSecret(peers);
      if (shared) return { secret: shared };
    }
    return linked.credentials.take();
  }

  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${FS_SOCKET_PATH}`;
  const appOrigin = (): string => linked.appOrigin() ?? appOrigins()[0] ?? "";
  const client = createNodeFsClient({
    open: () => new WebSocket(url) as never,
    credential: async () => {
      const answer = await credential();
      return answer;
    },
    keepSecret: (value) => { secret = value; },
    dropSecret: () => { secret = null; linked.credentials.dropSecret(); },
    get appOrigin() { return appOrigin(); },
    onState: (state) => {
      if (state === "open") linked.report("connected");
      onState(state);
    },
  });
  return { client, link: linked, peers };
}

// The machine half of the Explorer: the folders opened on this computer, one stack section each,
// using the same tree as the cloud workspace. It runs on the node's own page, so the app sees a
// frame and a file's base name when it opens a tab, never a listing or a path (F1).
import { Folder, FolderPlus, SquareTerminal, X } from "lucide-react";
import React from "react";

import { EDITOR_OPEN_TAB, EDITOR_SHOW_TERMINAL } from "../features/machines/model/editorFrameProtocol";
import { ExplorerStack, type ExplorerStackSection } from "../features/ide/ui/ExplorerStack";
import { StateBlock } from "../features/ide/ui/ExplorerStates";
import { WorkspaceExplorer } from "../features/ide/ui/WorkspaceExplorer";
import type { ExplorerCopy, ExplorerHost } from "../features/ide/ui/explorerContext";
import { PLAIN_EXPLORER_HOST } from "../features/ide/ui/explorerContext";
import type { ExplorerMenuRequest } from "../features/ide/ui/useExplorerController";
import { Button } from "@osionos/ui/atoms/Button";
import { IconButton } from "@osionos/ui/atoms/IconButton";
import { createDiskOps } from "./diskOps";
import { keyForFile } from "./fileKeys";
import { FolderPicker } from "./FolderPicker";
import type { EditorSession } from "./session";

type Root = { id: string; label: string; path: string };
type Layout = Record<string, { collapsed?: boolean; weight?: number }>;

const LAYOUT_KEY = "osionos.machine-explorer";
const DISK_COPY: ExplorerCopy = {
  toolbar: "",
  loading: "Loading folder…",
  errorTitle: "Could not read this folder",
  emptyTitle: "This folder is empty",
  deleteQuestion: (name) => `Delete “${name}” from this computer? This cannot be undone.`,
  deleteAction: "Delete",
};

const nameOf = (label: string): string => label.split("/").filter(Boolean).at(-1) ?? label;
const baseOf = (rel: string): string => rel.split("/").at(-1) ?? rel;

function readLayout(): Layout {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Layout;
  } catch {
    return {};
  }
}

/** The file open in the editor frame, heard over the same-origin channel: the tree marks its row. */
function useActiveFile(peers: BroadcastChannel): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "active-file") setActive(event.data.id as string); };
    peers.addEventListener("message", onMessage);
    return () => peers.removeEventListener("message", onMessage);
  }, [peers]);
  return active;
}

const RowMenu: React.FC<{ request: ExplorerMenuRequest; onTerminal(): void; onClose(): void }> = ({ request, onTerminal, onClose }) => {
  const item = "flex h-7 w-full items-center rounded-[var(--osio-radius-sm)] px-2 text-left text-sm hover:bg-[var(--osio-bg-hover)]";
  const act = (run: () => void) => () => { onClose(); run(); };
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div role="menu" className="osio-surface-panel fixed z-[var(--osio-z-raised)] w-44 p-1 text-[var(--osio-fg-default)]" style={{ top: Math.min(request.y, innerHeight - 110), left: Math.min(request.x, innerWidth - 180) }}>
        {request.kind === "dir" && <button type="button" role="menuitem" className={item} onClick={act(onTerminal)}>Open in Terminal</button>}
        <button type="button" role="menuitem" className={item} onClick={act(request.rename)}>Rename</button>
        <button type="button" role="menuitem" className={`${item} text-[var(--osio-danger)]`} onClick={act(request.remove)}>Delete</button>
      </div>
    </>
  );
};

const RootTree: React.FC<{ session: EditorSession; root: Root; host: ExplorerHost }> = ({ session, root, host }) => {
  const { ops } = React.useMemo(() => createDiskOps(session.client, root.id), [session.client, root.id]);
  const [menu, setMenu] = React.useState<ExplorerMenuRequest | null>(null);

  const openFile = React.useCallback((rel: string) => {
    session.link.tell({ type: EDITOR_OPEN_TAB, key: keyForFile({ root: root.id, rel }), title: baseOf(rel) });
  }, [session.link, root.id]);

  const openTerminal = React.useCallback((rel: string) => {
    session.peers.postMessage({ type: "open-terminal", path: rel ? `${root.path}/${rel}` : root.path });
    session.link.tell({ type: EDITOR_SHOW_TERMINAL });
  }, [session, root.path]);

  const pageIdOf = React.useCallback((rel: string, kind: string) => (kind === "dir" ? undefined : `${root.id}:${rel}`), [root.id]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <WorkspaceExplorer ops={ops} plainFiles copy={DISK_COPY} host={host} onOpen={openFile} pageIdOf={pageIdOf} onRowMenu={setMenu} />
      {menu && <RowMenu request={menu} onTerminal={() => openTerminal(menu.rel)} onClose={() => setMenu(null)} />}
    </div>
  );
};

export const ExplorerView: React.FC<{ session: EditorSession; pickRequests: number; epoch: number }> = ({ session, pickRequests, epoch }) => {
  const [roots, setRoots] = React.useState<Root[] | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [layout, setLayout] = React.useState<Layout>(readLayout);
  const active = useActiveFile(session.peers);

  const loadRoots = React.useCallback(() => {
    session.client.request("roots", {}).then((answer) => setRoots(answer.roots as Root[]), () => setRoots((known) => known ?? []));
  }, [session.client]);

  React.useEffect(loadRoots, [loadRoots, epoch]);
  React.useEffect(() => { if (pickRequests > 0) setPicking(true); }, [pickRequests]);
  // `osionos <path>` adds a root from the machine's own terminal; every open frame shows it.
  React.useEffect(() => session.client.onRootsChanged(loadRoots), [session.client, loadRoots]);
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "roots-changed") loadRoots(); };
    session.peers.addEventListener("message", onMessage);
    return () => session.peers.removeEventListener("message", onMessage);
  }, [session.peers, loadRoots]);

  const host = React.useMemo<ExplorerHost>(() => ({ ...PLAIN_EXPLORER_HOST, useIsActive: (id) => id !== "" && id === active }), [active]);

  const update = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* the layout just resets */ }
  };

  if (picking) return <FolderPicker client={session.client} onCancel={() => setPicking(false)} onOpened={() => { setPicking(false); loadRoots(); session.peers.postMessage({ type: "roots-changed" }); }} />;
  if (roots === null) return null;
  if (roots.length === 0) {
    return (
      <StateBlock
        icon={Folder}
        title="No folder open"
        actions={<Button size="sm" tone="primary" onClick={() => setPicking(true)}>Open folder</Button>}
      >
        <p>Open a project from this computer to edit and run it here. Your files stay on this computer.</p>
      </StateBlock>
    );
  }

  const close = (root: Root) => {
    void session.client.request("removeRoot", { root: root.id }).then(loadRoots);
  };

  const sections: ExplorerStackSection[] = roots.map((root) => ({
    id: root.id,
    title: nameOf(root.label),
    detail: root.label,
    icon: <Folder size={14} />,
    collapsed: layout[root.id]?.collapsed === true,
    weight: layout[root.id]?.weight ?? 1,
    actions: (
      <>
        <IconButton size="xs" label="Open in terminal" onClick={() => { session.peers.postMessage({ type: "open-terminal", path: root.path }); session.link.tell({ type: EDITOR_SHOW_TERMINAL }); }}><SquareTerminal size={14} /></IconButton>
        <IconButton size="xs" label="Close folder" onClick={() => close(root)}><X size={14} /></IconButton>
      </>
    ),
    children: <RootTree key={`${root.id}:${epoch}`} session={session} root={root} host={host} />,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ExplorerStack
        sections={sections}
        onToggle={(id) => update({ ...layout, [id]: { ...layout[id], collapsed: !(layout[id]?.collapsed === true) } })}
        onResize={(upperId, upperWeight, lowerId, lowerWeight) => update({ ...layout, [upperId]: { ...layout[upperId], weight: upperWeight }, [lowerId]: { ...layout[lowerId], weight: lowerWeight } })}
      />
      <div className="flex h-7 shrink-0 items-center justify-end border-t border-[var(--osio-border-default)] px-1">
        <IconButton size="xs" label="Add a folder" onClick={() => setPicking(true)}><FolderPlus size={14} /></IconButton>
      </div>
    </div>
  );
};

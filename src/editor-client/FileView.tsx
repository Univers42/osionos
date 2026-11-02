// One file from a folder on this computer, in Monaco, on the node's own page. Nothing here reaches
// the page store, the bridge or a language server: the disk stays on the disk (F2). A save carries
// the hash of what was loaded, so a file changed by the terminal beside it is a choice for the
// person, never a silent overwrite (F13); a file changed while nothing is unsaved simply reloads.
import { FileWarning, TriangleAlert } from "lucide-react";
import React from "react";

import { languageForFileName } from "../features/ide/model/ideLanguages";
import { replaceEditorText, useMonacoEditor, type EditorStatus } from "../features/ide/ui/useMonacoEditor";
import "../features/ide/ui/monacoEditor.css";
import { decodeEditable, sha256Hex } from "../features/ide/vfs/diskBytes";
import type { DiskProvider } from "../features/ide/vfs/diskProvider";
import { isFsError } from "../features/ide/vfs/errors";
import { DiskConflict } from "../features/ide/vfs/nodeFsClient";
import { collectBytes, textToBytes } from "../features/ide/vfs/bytes";
import { buildVPath } from "../features/ide/vfs/vpath";
import { EDITOR_TITLE } from "../features/machines/model/editorFrameProtocol";
import { StateBlock } from "../features/ide/ui/ExplorerStates";
import { Button } from "@osionos/ui/atoms/Button";
import { DISK_SCHEME } from "../features/ide/vfs/diskProvider";
import { createDiskOps } from "./diskOps";
import { fileForKey, type DiskFile } from "./fileKeys";
import type { EditorSession } from "./session";

type Loaded = { text: string; hash: string };
type Load = { kind: "loading" } | { kind: "ready"; loaded: Loaded } | { kind: "missing" } | { kind: "notText" } | { kind: "tooLarge" } | { kind: "failed" };

const pathOf = (file: DiskFile) => buildVPath(DISK_SCHEME, file.root, file.rel.split("/"));
const baseOf = (rel: string): string => rel.split("/").at(-1) ?? rel;
const parentOf = (rel: string): string => rel.split("/").slice(0, -1).join("/");

async function readFile(provider: DiskProvider, file: DiskFile): Promise<Loaded | "notText"> {
  const bytes = await collectBytes(await provider.read(pathOf(file)));
  const text = decodeEditable(bytes);
  return text === null ? "notText" : { text, hash: await sha256Hex(bytes) };
}

function failureOf(error: unknown): Load {
  if (isFsError(error) && error.code === "NotFound") return { kind: "missing" };
  if (isFsError(error) && error.code === "TooLarge") return { kind: "tooLarge" };
  return { kind: "failed" };
}

const Editor: React.FC<{ session: EditorSession; provider: DiskProvider; file: DiskFile; fileKey: string; loaded: Loaded }> = ({ session, provider, file, fileKey, loaded }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const hash = React.useRef(loaded.hash);
  const savedVersion = React.useRef(0);
  const [status, setStatus] = React.useState<EditorStatus>({ line: 1, col: 1, lines: 1 });
  const [saveState, setSaveState] = React.useState<"saved" | "saving" | "conflict" | "failed">("saved");
  const language = languageForFileName(baseOf(file.rel));
  const uri = pathOf(file).uri;

  const announce = React.useCallback((dirty: boolean) => {
    session.link.tell({ type: EDITOR_TITLE, key: fileKey, title: baseOf(file.rel), dirty });
  }, [session.link, fileKey, file.rel]);

  const editorHandle = React.useRef<ReturnType<typeof useMonacoEditor> | null>(null);
  const write = React.useCallback(async (text: string, expect: string) => {
    const bytes = textToBytes(text);
    setSaveState("saving");
    try {
      await provider.saveOver(file.rel, bytes, expect);
      hash.current = await sha256Hex(bytes);
      savedVersion.current = editorHandle.current?.current?.getModel()?.getAlternativeVersionId() ?? 0;
      setSaveState("saved");
      announce(false);
    } catch (error) {
      setSaveState(error instanceof DiskConflict ? "conflict" : "failed");
    }
  }, [provider, file.rel, announce]);

  const editorRef = useMonacoEditor(hostRef, {
    pageId: fileKey,
    blockId: "file",
    monacoId: language.monacoId,
    uri,
    readInitialText: () => loaded.text,
    onSave: (text) => { void write(text, hash.current); },
    onStatus: (next) => {
      setStatus(next);
      const version = editorRef.current?.getModel()?.getAlternativeVersionId();
      if (version !== undefined && savedVersion.current === 0) savedVersion.current = version;
      else if (version !== undefined && version !== savedVersion.current) announce(true);
    },
    onRun: () => undefined,
    onFormat: () => undefined,
  });
  React.useEffect(() => { editorHandle.current = editorRef; }, [editorRef]);

  const takeDisk = React.useCallback(async () => {
    const fresh = await readFile(provider, file).catch(() => null);
    const instance = editorHandle.current?.current;
    if (!fresh || fresh === "notText" || !instance) return;
    hash.current = fresh.hash;
    replaceEditorText(instance, fresh.text);
    savedVersion.current = instance.getModel()?.getAlternativeVersionId() ?? 0;
    setSaveState("saved");
    announce(false);
  }, [provider, file, announce]);

  // A terminal beside this editor changes the file: follow it while nothing here is unsaved.
  React.useEffect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    const onChange = () => {
      void readFile(provider, file).then((fresh) => {
        if (fresh === "notText" || fresh.hash === hash.current) return;
        const model = editorRef.current?.getModel();
        const clean = model?.getAlternativeVersionId() === savedVersion.current;
        if (clean) void takeDisk();
        else setSaveState("conflict");
      }).catch(() => undefined);
    };
    void provider.follow(parentOf(file.rel), onChange).then((answer) => { if (gone) answer(); else stop = answer; }).catch(() => undefined);
    return () => { gone = true; stop?.(); };
  }, [provider, file, editorRef, takeDisk]);

  const words = { saved: "Saved", saving: "Saving…", conflict: "Changed on this computer", failed: "Could not save" }[saveState];
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)] text-[var(--osio-code-fg)]">
      {saveState === "conflict" && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-[var(--osio-code-border)] px-3 py-1.5 text-sm">
          <TriangleAlert size={14} aria-hidden="true" className="shrink-0 text-[var(--osio-warning,var(--osio-danger))]" />
          <span className="min-w-0 flex-1">This file changed on this computer after you opened it.</span>
          <Button size="sm" onClick={() => void write(editorRef.current?.getValue() ?? "", "any")}>Keep mine</Button>
          <Button size="sm" onClick={() => void takeDisk()}>Take the disk</Button>
        </div>
      )}
      <div ref={hostRef} className="min-h-0 flex-1" />
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--osio-code-border)] px-3 text-xs text-[var(--osio-code-comment,var(--osio-code-fg))]">
        <span className="min-w-0 flex-1 truncate" title={file.rel}>{file.rel}</span>
        <span role="status">{words}</span>
        <span>Ln {status.line}, Col {status.col}</span>
        <span>{language.label}</span>
      </div>
    </div>
  );
};

const Message: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="flex h-full items-center justify-center bg-[var(--osio-code-bg)]"><StateBlock icon={FileWarning} title={title} tone="code">{children}</StateBlock></div>
);

export const FileView: React.FC<{ session: EditorSession; fileKey: string | null; epoch: number }> = ({ session, fileKey, epoch }) => {
  const file = React.useMemo(() => (fileKey ? fileForKey(fileKey) : null), [fileKey]);
  const provider = React.useMemo(() => (file ? createDiskOps(session.client, file.root).provider : null), [session.client, file]);
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });

  React.useEffect(() => {
    if (!file || !provider) return undefined;
    let current = true;
    setLoad({ kind: "loading" });
    session.peers.postMessage({ type: "active-file", id: `${file.root}:${file.rel}` });
    // A socket knows only the roots it has listed, and this frame opens files without a tree.
    session.client.request("roots", {}).then(() => readFile(provider, file)).then(
      (loaded) => { if (current) setLoad(loaded === "notText" ? { kind: "notText" } : { kind: "ready", loaded }); },
      (error: unknown) => { if (current) setLoad(failureOf(error)); },
    );
    return () => { current = false; };
  }, [file, provider, session.client, session.peers, epoch]);

  if (!fileKey || !file) return <Message title="Open this file from the Explorer"><p>This tab no longer knows its file.</p></Message>;
  if (load.kind === "loading") return null;
  if (load.kind === "missing") return <Message title="This file is gone"><p>It was moved or deleted on this computer.</p></Message>;
  if (load.kind === "notText") return <Message title="Binary or not UTF-8, not opened"><p>Saving it from here could damage it.</p></Message>;
  if (load.kind === "tooLarge") return <Message title="This file is too large to open here"><p>The editor opens files up to 8 MiB. The terminal can still reach it.</p></Message>;
  if (load.kind === "failed" || !provider) return <Message title="This file could not be read" />;
  return <Editor key={`${fileKey}:${epoch}`} session={session} provider={provider} file={file} fileKey={fileKey} loaded={load.loaded} />;
};

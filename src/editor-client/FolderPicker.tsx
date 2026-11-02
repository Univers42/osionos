// The one way a folder becomes a root (F9, F10): a click here, on the node's own page. Folders
// only, under the home folder, dot-folders on request. Keyboard first: arrows move, Enter goes in,
// Backspace goes up, Ctrl+Enter opens.
import { ChevronRight, Folder, Home } from "lucide-react";
import React from "react";

import { isFsError } from "../features/ide/vfs/errors";
import type { NodeFsClient } from "../features/ide/vfs/nodeFsClient";
import { Button } from "@osionos/ui/atoms/Button";

type Listing = { path: string; dirs: string[]; truncated: boolean };
type Status = { kind: "loading" } | { kind: "ready"; listing: Listing } | { kind: "error"; message: string };

const describe = (error: unknown): string => {
  if (isFsError(error) && error.code === "PermissionDenied") return "This folder cannot be opened here: osionos opens project folders inside your home folder, not your whole home.";
  return "This folder could not be read.";
};

const join = (base: string, name: string): string => (base ? `${base}/${name}` : name);
const parent = (path: string): string => path.split("/").slice(0, -1).join("/");

export const FolderPicker: React.FC<{ client: NodeFsClient; onOpened(): void; onCancel(): void }> = ({ client, onOpened, onCancel }) => {
  const [path, setPath] = React.useState("");
  const [hidden, setHidden] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [status, setStatus] = React.useState<Status>({ kind: "loading" });
  const [cursor, setCursor] = React.useState(0);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    let current = true;
    setStatus({ kind: "loading" });
    setCursor(0);
    client.request("pick", { rel: path, hidden }).then(
      (answer) => { if (current) setStatus({ kind: "ready", listing: { path, dirs: answer.dirs as string[], truncated: answer.truncated === true } }); },
      (error: unknown) => { if (current) setStatus({ kind: "error", message: describe(error) }); },
    );
    return () => { current = false; };
  }, [client, path, hidden]);

  const dirs = status.kind === "ready" ? status.listing.dirs.filter((name) => name.toLowerCase().includes(filter.toLowerCase())) : [];
  const enter = (name: string) => { setPath(join(path, name)); setFilter(""); };
  const canOpen = path !== "" || dirs.length > 0;

  async function open(target: string) {
    setFailure(null);
    try {
      await client.request("addRoot", { rel: target });
      onOpened();
    } catch (error) {
      setFailure(describe(error));
    }
  }

  const openSelection = () => { void open(path === "" && dirs[cursor] ? join(path, dirs[cursor]) : path); };

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((at) => Math.min(at + 1, dirs.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((at) => Math.max(at - 1, 0)); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (canOpen) openSelection(); }
    else if (event.key === "Enter") { event.preventDefault(); if (dirs[cursor]) enter(dirs[cursor]); }
    else if (event.key === "Backspace" && filter === "" && path !== "") { event.preventDefault(); setPath(parent(path)); }
    else if (event.key === "Escape") { event.preventDefault(); onCancel(); }
  }

  const crumbs = path === "" ? [] : path.split("/");
  return (
    <div role="dialog" aria-label="Open folder" onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col gap-1.5 p-2 text-sm text-[var(--osio-fg-default)]">
      <nav aria-label="Location" className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs text-[var(--osio-fg-muted)]">
        <button type="button" aria-label="Home folder" className="rounded-[var(--osio-radius-sm)] p-1 hover:bg-[var(--osio-bg-hover)]" onClick={() => setPath("")}><Home size={13} /></button>
        {crumbs.map((crumb, index) => (
          <React.Fragment key={crumbs.slice(0, index + 1).join("/")}>
            <ChevronRight size={12} aria-hidden="true" />
            <button type="button" className="max-w-32 truncate rounded-[var(--osio-radius-sm)] px-1 py-0.5 hover:bg-[var(--osio-bg-hover)]" onClick={() => setPath(crumbs.slice(0, index + 1).join("/"))}>{crumb}</button>
          </React.Fragment>
        ))}
      </nav>
      <input
        autoFocus
        aria-label="Filter folders"
        placeholder="Filter folders"
        value={filter}
        onChange={(event) => { setFilter(event.target.value); setCursor(0); }}
        className="h-7 w-full rounded-[var(--osio-field-radius)] border border-[var(--osio-border-default)] bg-transparent px-2 text-sm outline-none focus:border-[var(--osio-accent)]"
      />
      <div role="listbox" aria-label="Folders" className="min-h-0 flex-1 overflow-auto">
        {status.kind === "loading" && <p role="status" className="px-1 py-2 text-xs text-[var(--osio-fg-muted)]">Loading folders…</p>}
        {status.kind === "error" && <p role="alert" className="px-1 py-2 text-xs text-[var(--osio-danger)]">{status.message}</p>}
        {status.kind === "ready" && dirs.length === 0 && <p className="px-1 py-2 text-xs text-[var(--osio-fg-muted)]">{filter ? "No folder matches." : "No folders here."}</p>}
        {dirs.map((name, index) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={index === cursor}
            onClick={() => setCursor(index)}
            onDoubleClick={() => enter(name)}
            className={`flex h-7 w-full items-center gap-1.5 rounded-[var(--osio-radius-sm)] px-1.5 text-left ${index === cursor ? "bg-[var(--osio-bg-selected,var(--osio-bg-hover))]" : "hover:bg-[var(--osio-bg-hover)]"}`}
          >
            <Folder size={14} aria-hidden="true" className="shrink-0 opacity-70" />
            <span className="truncate">{name}</span>
          </button>
        ))}
        {status.kind === "ready" && status.listing.truncated && <p className="px-1 py-1 text-xs text-[var(--osio-fg-muted)]">Showing the first 2000 folders. Filter to narrow it down.</p>}
      </div>
      {failure && <p role="alert" className="text-xs text-[var(--osio-danger)]">{failure}</p>}
      <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
        <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} /> Show hidden folders
      </label>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" tone="primary" disabled={!canOpen} onClick={openSelection}>{path ? "Open this folder" : "Open selected"}</Button>
      </div>
    </div>
  );
};

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeExplorerPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Download, FilePlus, FolderPlus, Upload } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { useIdeFileOps, type IdeCreateRequest } from "../model/useIdeFileOps";
import { IdeFileTree } from "./IdeFileTree";

/** The Explorer panel: a toolbar (new file/folder, import folder, export zip)
 *  over the interactive file tree. Owns the transient create/rename state and
 *  commits it through the bound file operations. */
export const IdeExplorerPanel: React.FC = () => {
  const ops = useIdeFileOps();
  const workspaceName = useUserStore((s) => s.activeWorkspace()?.name ?? "project");
  const [create, setCreate] = React.useState<IdeCreateRequest | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const importRef = React.useRef<HTMLInputElement | null>(null);

  // `webkitdirectory` is a non-standard input attribute with no JSX typing; set
  // it imperatively so the picker selects a whole folder (with relative paths).
  React.useEffect(() => {
    const input = importRef.current;
    if (input) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }
  }, []);

  const submitCreate = React.useCallback(
    (name: string) => {
      const request = create;
      setCreate(null);
      if (!request) return;
      const parentId = request.parentId ?? undefined;
      void (request.kind === "folder" ? ops.newFolder(name, parentId) : ops.newFile(name, parentId));
    },
    [create, ops],
  );

  const submitRename = React.useCallback(
    (id: string, name: string) => {
      setRenamingId(null);
      ops.rename(id, name);
    },
    [ops],
  );

  const onImport = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      if (files.length) void ops.importFolder(files);
    },
    [ops],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-0.5 pl-3 pr-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        <span className="flex-1 truncate">{workspaceName}</span>
        <ToolButton title="New file" onClick={() => { setRenamingId(null); setCreate({ parentId: null, kind: "code" }); }}>
          <FilePlus size={14} />
        </ToolButton>
        <ToolButton title="New folder" onClick={() => { setRenamingId(null); setCreate({ parentId: null, kind: "folder" }); }}>
          <FolderPlus size={14} />
        </ToolButton>
        <ToolButton title="Import folder" onClick={() => importRef.current?.click()}>
          <Upload size={14} />
        </ToolButton>
        <ToolButton title="Export project (.zip)" onClick={() => ops.exportProject(workspaceName)}>
          <Download size={14} />
        </ToolButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <IdeFileTree
          ops={ops}
          create={create}
          renamingId={renamingId}
          onStartCreate={(parentId, kind) => { setRenamingId(null); setCreate({ parentId, kind }); }}
          onSubmitCreate={submitCreate}
          onCancelCreate={() => setCreate(null)}
          onStartRename={(id) => { setCreate(null); setRenamingId(id); }}
          onSubmitRename={submitRename}
          onCancelRename={() => setRenamingId(null)}
        />
      </div>
      <input
        ref={importRef}
        type="file"
        multiple
        onChange={onImport}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
};

const ToolButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="flex h-6 w-6 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.16))] hover:text-[var(--osio-code-fg)]"
  >
    {children}
  </button>
);

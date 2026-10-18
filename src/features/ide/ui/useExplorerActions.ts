/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExplorerActions.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { fileKindOf } from "../model/explorerRows";
import { nameForNewFile } from "../model/newFileName";
import { describeError, type useExplorerTree } from "../model/useExplorerTree";
import type { WorkspaceFileOps } from "../model/workspaceFileOps";
import { baseName, joinRel, validateName } from "../model/workspacePath";
import type { ExplorerPending } from "./explorerContext";

type Params = {
  ops: WorkspaceFileOps;
  tree: Pick<ReturnType<typeof useExplorerTree>, "refresh" | "setOpen">;
  onOpen: (relPath: string, kind: "page" | "code") => void;
};

/** Every mutation the explorer offers. A failed op becomes `notice` (never thrown
 *  into the void) and the tree is re-listed either way, so the screen shows what
 *  the provider really holds. */
export function useExplorerActions({ ops, tree, onOpen }: Params) {
  const [pending, setPending] = React.useState<ExplorerPending | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const run = async (verb: string, name: string, work: () => Promise<unknown>): Promise<void> => {
    try {
      await work();
      setNotice(null);
    } catch (error) {
      setNotice(`Could not ${verb} "${name}": ${describeError(error)}`);
    }
    await tree.refresh();
  };

  const startCreate = (parent: string, kind: "file" | "dir"): void => {
    if (parent !== "") tree.setOpen(parent, true);
    setPending({ type: "create", parent, kind });
  };

  const submitCreate = (name: string): void => {
    if (pending?.type !== "create") return;
    const { parent, kind } = pending;
    setPending(null);
    void run("create", name, async () => {
      // Validated here, not just in ops: "a/b" would otherwise create a nested path from a name field.
      const valid = validateName(name);
      if (kind === "dir") return ops.createDir(joinRel(parent, valid));
      const rel = joinRel(parent, nameForNewFile(valid));
      await ops.createFile(rel);
      onOpen(rel, fileKindOf(rel));
    });
  };

  const submitRename = (rel: string, name: string): void => {
    setPending(null);
    if (name !== baseName(rel)) void run("rename", baseName(rel), () => ops.rename(rel, name));
  };

  const moveTo = (fromRel: string, targetDir: string): void => {
    void run("move", baseName(fromRel), () => ops.move(fromRel, targetDir));
  };

  const confirmDelete = (rel: string): void => {
    setPending(null);
    void run("delete", baseName(rel), () => ops.remove(rel));
  };

  return {
    pending, setPending, notice, dismissNotice: () => setNotice(null),
    startCreate, submitCreate, submitRename, moveTo, confirmDelete,
  };
}

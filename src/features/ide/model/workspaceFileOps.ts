/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceFileOps.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { bytesToText, collectBytes, textToBytes } from "../vfs/bytes";
import type { ListedEntry, MountTable, WatchEvent } from "../vfs/types";
import { baseName, joinRel, parentOf, validateName, validateRelPath, WorkspacePathError } from "./workspacePath";

/** Everything the explorer does to the workspace folder. Paths are relative
 *  POSIX (`""` = the folder root); the mount behind them is never named. */
export type WorkspaceFileOps = {
  list(dir: string, signal?: AbortSignal): Promise<ListedEntry[]>;
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, text: string): Promise<void>;
  /** Fails with AlreadyExists rather than clobbering. */
  createFile(rel: string, text?: string): Promise<void>;
  createDir(rel: string): Promise<void>;
  /** `newName` is a bare name; the entry stays in its folder. */
  rename(rel: string, newName: string): Promise<void>;
  /** Moves `rel` into the folder `targetDir`, keeping its name. */
  move(rel: string, targetDir: string): Promise<void>;
  remove(rel: string): Promise<void>;
  /** False when the provider cannot report changes (capabilities().watch === "none"). */
  canWatch(): boolean;
  watch(dir: string, onEvent: (event: WatchEvent) => void, signal: AbortSignal): Promise<void>;
};

/** Builds `workspace://<ws>/<rel>`; injected because workspaceMounts.ts imports
 *  the page store, which node tests cannot load. */
export type WorkspaceUriBuilder = (workspaceId: string, relPath: string) => string;

/** Pure core: each call resolves through the mount table, so swapping the
 *  provider behind `workspace://<id>/` needs no change here. */
export function createWorkspaceFileOpsWith(
  mounts: MountTable,
  workspaceId: string,
  toUri: WorkspaceUriBuilder,
): WorkspaceFileOps {
  const at = (rel: string, allowRoot = false) =>
    mounts.resolve(toUri(workspaceId, validateRelPath(rel, { allowRoot })));

  const relocate = async (from: string, to: string): Promise<void> => {
    if (from === to) return;
    const source = at(from);
    await source.provider.rename(source.path, at(to).path);
  };

  return {
    async list(dir, signal) {
      const { provider, path } = at(dir, true);
      return provider.list(path, signal);
    },
    async readFile(rel) {
      const { provider, path } = at(rel);
      return bytesToText(await collectBytes(await provider.read(path)));
    },
    async writeFile(rel, text) {
      const { provider, path } = at(rel);
      await provider.write(path, textToBytes(text));
    },
    async createFile(rel, text = "") {
      const { provider, path } = at(rel);
      await provider.write(path, textToBytes(text), { create: true, overwrite: false });
    },
    async createDir(rel) {
      const { provider, path } = at(rel);
      await provider.mkdir(path);
    },
    // async so a bad name rejects like every other op instead of throwing synchronously.
    async rename(rel, newName) {
      await relocate(validateRelPath(rel), joinRel(parentOf(rel), validateName(newName)));
    },
    async move(rel, targetDir) {
      validateRelPath(rel);
      validateRelPath(targetDir, { allowRoot: true });
      if (targetDir === rel || targetDir.startsWith(`${rel}/`)) {
        throw new WorkspacePathError("into-self", rel, "a folder cannot be moved into itself.");
      }
      await relocate(rel, joinRel(targetDir, baseName(rel)));
    },
    async remove(rel) {
      const { provider, path } = at(rel);
      await provider.delete(path, { recursive: true });
    },
    canWatch() {
      return at("", true).provider.capabilities().watch !== "none";
    },
    async watch(dir, onEvent, signal) {
      const { provider, path } = at(dir, true);
      await provider.watch(path, onEvent, signal);
    },
  };
}

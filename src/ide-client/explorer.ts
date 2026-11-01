/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The machine window's file tree, read through VS Code's own file service (the remote file system
// of the machine), so it lists exactly what the editor and the terminal see. Folders load when
// first expanded; a click on a file opens it.
import type * as monaco from "@codingame/monaco-vscode-editor-api";
import { IFileService, getService } from "@codingame/monaco-vscode-api";

import { explorerOrder } from "../features/ide/vscode/explorerOrder.ts";

type Uri = monaco.Uri;
type OpenFile = (resource: Uri) => void;

function row(name: string, depth: number, isDirectory: boolean): HTMLLIElement {
  const item = document.createElement("li");
  item.setAttribute("role", "treeitem");
  item.setAttribute("aria-label", name);
  item.tabIndex = -1;
  item.className = isDirectory ? "node folder" : "node file";
  item.style.setProperty("--depth", String(depth));
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = name;
  item.append(label);
  if (isDirectory) item.setAttribute("aria-expanded", "false");
  return item;
}

async function listInto(list: HTMLUListElement, folder: Uri, depth: number, openFile: OpenFile): Promise<void> {
  const files = await getService(IFileService);
  const stat = await files.resolve(folder);
  list.replaceChildren();
  for (const child of explorerOrder(stat.children ?? [])) {
    const item = row(child.name, depth, child.isDirectory);
    list.append(item);
    if (!child.isDirectory) {
      item.addEventListener("click", (event) => { event.stopPropagation(); openFile(child.resource); });
      continue;
    }
    const nested = document.createElement("ul");
    nested.setAttribute("role", "group");
    nested.hidden = true;
    item.append(nested);
    let loaded = false;
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = item.getAttribute("aria-expanded") !== "true";
      item.setAttribute("aria-expanded", String(open));
      nested.hidden = !open;
      if (open && !loaded) {
        loaded = true;
        listInto(nested, child.resource, depth + 1, openFile).catch(() => { loaded = false; });
      }
    });
  }
}

/** Fills `host` with the tree of `root`. A failed read leaves the reason in the tree. */
export async function mountExplorer(host: HTMLElement, root: Uri, openFile: OpenFile): Promise<void> {
  const list = document.createElement("ul");
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", "Files");
  host.replaceChildren(list);
  try {
    await listInto(list, root, 0, openFile);
  } catch (error) {
    const note = document.createElement("p");
    note.className = "explorer-error";
    note.textContent = `Could not list this folder: ${(error as Error).message}`;
    host.replaceChildren(note);
  }
}

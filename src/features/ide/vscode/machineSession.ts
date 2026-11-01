/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineSession.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the IDE page hands VS Code's client for one machine (ADR-006). The library's
// configuration is global to a page, so a page is one machine and one folder. The client reaches
// the machine through the IDE origin's /api/node/<id> proxy, which holds the only credential:
// there is no connection token to give it (A8). Free of `@/` imports for the canvas runner.

export type MachineTarget = { node: string; folder: string };

const NODE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
// eslint-disable-next-line no-control-regex -- refusing control characters is the point
const CONTROL = /[\u0000-\u001f\u007f\\]/;
const OPEN_VSX = "https://open-vsx.org/vscode";

// Absolute and already normal: the folder lands in a vscode-remote URI as is.
function isAbsoluteFolder(path: string): boolean {
  if (!path.startsWith("/") || CONTROL.test(path)) return false;
  if (path === "/") return true;
  return path.slice(1).split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function readMachineTarget(search: string): MachineTarget | null {
  const params = new URLSearchParams(search);
  const nodes = params.getAll("node");
  const folders = params.getAll("folder");
  if (nodes.length !== 1 || folders.length !== 1) return null;
  const [node] = nodes;
  const [folder] = folders;
  return NODE_ID.test(node) && isAbsoluteFolder(folder) ? { node, folder } : null;
}

export function machineOptions({ host, node, folder, commit }: MachineTarget & { host: string; commit: string }) {
  return {
    remoteAuthority: host,
    serverBasePath: `/api/node/${node}`,
    // The browser build turns workspace trust off unless asked; off, every folder is trusted (C11).
    enableWorkspaceTrust: true,
    workspaceProvider: {
      // Left undefined, VS Code asks before running anything the folder declares (C11).
      trusted: undefined,
      open: async () => false,
      workspace: { folderUri: `vscode-remote://${host}${folder}` },
    },
    productConfiguration: {
      nameShort: "osionos",
      nameLong: "osionos",
      commit,
      extensionsGallery: {
        serviceUrl: `${OPEN_VSX}/gallery`,
        resourceUrlTemplate: `${OPEN_VSX}/unpkg/{publisher}/{name}/{version}/{path}`,
        extensionUrlTemplate: `${OPEN_VSX}/gallery/{publisher}/{name}/latest`,
        controlUrl: "",
        nlsBaseUrl: "",
      },
    },
  };
}

// Caveat: the bound is wall-clock; a command that is merely slow (a cold extension host, a big
// checkout) is reported as stuck. The command itself keeps running; only the caller stops waiting.
export function boundedCommand<T>(run: () => Promise<T>, name: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} did not finish within ${ms} ms`)), ms);
  });
  return Promise.race([run(), late]).finally(() => clearTimeout(timer));
}

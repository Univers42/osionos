/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page (ADR-006): one connected machine and one folder, drawn by osionos with VS Code's
// services behind it. It is served by osionos-node on the IDE origin and framed by the app.
//
// This entry stays light: it names the machine and sends `ready` before the VS Code bundle
// (workbench.ts) is even requested, so the app's no-node timeout measures the node, not a cold
// bundle load. `/?local=1` is this computer's node, which names itself (GET /api/machine/self).
import { isLocalOpen, readHomeFolder, readMachineTarget, readSelf, type MachineTarget } from "../features/ide/vscode/machineSession.ts";
import { linkToApp, type AppLink } from "./appSession.ts";
import { REFUSAL_TEXT, report, show } from "./status.ts";
import "./ide.css";

async function readJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(path, { credentials: "same-origin" });
  return { status: res.status, body: res.status === 200 ? await res.json().catch(() => null) : null };
}

async function resolveTarget(): Promise<MachineTarget> {
  if (isLocalOpen(location.search)) {
    const { status, body } = await readJson("/api/machine/self");
    const node = readSelf(body);
    if (!node) throw new Error(`this computer's osionos-node did not name its machine (${status})`);
    return { node, folder: null };
  }
  const target = readMachineTarget(location.search);
  if (!target) throw new Error("this address names no machine folder");
  return target;
}

// A paired machine opened without a folder opens its home, which the node names once the session
// cookie is set (own-machines plan §6): the app never sends a path for it.
async function homeFolder(): Promise<string> {
  const { status, body } = await readJson("/api/machine/home");
  const folder = readHomeFolder(body);
  if (!folder) throw new Error(`the machine did not name its home folder (${status})`);
  return folder;
}

// Set once the app answers, so a failure after it (home folder, VS Code start) reaches the app's
// card too and not only this window's status line.
let appLink: AppLink | null = null;

async function main() {
  const appOrigins = (document.querySelector<HTMLMetaElement>('meta[name="osionos-app-origin"]')?.content ?? "").split(" ").filter(Boolean);
  const target = await resolveTarget();
  document.title = target.node;
  const link = linkToApp(target.node, appOrigins);
  if (!link) return report(null, "error", "open this machine from osionos");
  appLink = link;
  link.onRefused((reason) => show("error", REFUSAL_TEXT[reason]));
  const workbench = import("./workbench.ts");
  report(link, "connecting");
  await link.firstSession;
  const folder = target.folder ?? await homeFolder();
  await (await workbench).startWorkbench({ link, node: target.node, folder });
}

main().catch((error: Error) => report(appLink, "error", error.message));

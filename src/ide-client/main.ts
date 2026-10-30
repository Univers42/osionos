/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   main.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page (ADR-006): one connected machine and one folder, drawn by osionos with VS Code's
// services behind it. It is served by osionos-node on the IDE origin and framed by the app.
import * as monaco from "@codingame/monaco-vscode-editor-api";
import { ICommandService, IRemoteAgentService, ITerminalService, getService, initialize } from "@codingame/monaco-vscode-api";
import "@codingame/monaco-vscode-theme-defaults-default-extension";

import pin from "../../packages/osionos-node/server-pin.json";
import { boundedCommand, machineOptions, readMachineTarget } from "../features/ide/vscode/machineSession.ts";
import type { IdeState } from "../features/ide/vscode/ideFrameProtocol.ts";
import { linkToApp, type AppLink } from "./appSession.ts";
import { editorModeServices } from "./services.ts";
import "./ide.css";

const COMMAND_BOUND_MS = 15_000;
const ConnectionGain = 4;
const ReconnectionPermanentFailure = 3;

const statusEl = document.getElementById("status") as HTMLElement;
const editorEl = document.getElementById("editor") as HTMLElement;
const terminalEl = document.getElementById("terminal") as HTMLElement;
const STATUS_TEXT: Record<IdeState, string> = { connecting: "Connecting…", connected: "Connected", reconnecting: "Reconnecting…", error: "Not connected" };

// Vite bundles a worker only from the literal `new Worker(new URL(…))` form; a bare URL is copied
// as an asset, and a one-line re-export is inlined as a data: URL the CSP refuses.
const workers: Record<string, () => Worker> = {
  editorWorkerService: () => new Worker(new URL("@codingame/monaco-vscode-api/workers/editor.worker", import.meta.url), { type: "module" }),
  TextMateWorker: () => new Worker(new URL("@codingame/monaco-vscode-textmate-service-override/worker", import.meta.url), { type: "module" }),
};
window.MonacoEnvironment = { getWorker: (_id, label) => workers[label]?.() };

let editor: monaco.editor.IStandaloneCodeEditor | undefined;
const showEditor = () => (editor ??= monaco.editor.create(editorEl, { automaticLayout: true }));

function report(link: AppLink | null, state: IdeState, detail = "") {
  statusEl.dataset.state = state;
  statusEl.textContent = detail ? `${STATUS_TEXT[state]} · ${detail}` : STATUS_TEXT[state];
  link?.send({ type: "osionos-ide/state", state });
}

async function watchConnection(link: AppLink | null) {
  const connection = (await getService(IRemoteAgentService)).getConnection();
  connection?.onDidStateChange((event) => {
    if (event.type === ConnectionGain) report(link, "connected");
    else if (event.type === ReconnectionPermanentFailure) report(link, "error", "the machine closed the connection");
    else report(link, "reconnecting");
  });
  const environment = await (await getService(IRemoteAgentService)).getEnvironment();
  report(link, environment ? "connected" : "error", environment ? "" : "the machine did not answer");
}

async function openTerminal(cwd: monaco.Uri) {
  const terminals = await getService(ITerminalService);
  // No views means no "last active folder" to fall back on: name the folder, or the shell starts in ~.
  const terminal = await terminals.createTerminal({ cwd });
  terminalEl.hidden = false;
  terminal.attachToElement(terminalEl);
  // xterm opens only for a visible instance; without views nothing else marks it visible.
  terminal.setVisible(true);
  terminal.layout({ width: terminalEl.clientWidth, height: terminalEl.clientHeight });
  terminal.focus();
}

async function main() {
  const target = readMachineTarget(location.search);
  const appOrigin = document.querySelector<HTMLMetaElement>('meta[name="osionos-app-origin"]')?.content ?? "";
  if (!target) return report(null, "error", "this address names no machine folder");
  document.title = `${target.folder.split("/").pop() || target.folder} · ${target.node}`;
  const link = linkToApp(target.node, appOrigin);
  if (!link) return report(null, "error", "open this machine from osionos");
  report(link, "connecting");
  await link.firstSession;

  const options = machineOptions({ host: location.host, ...target, commit: pin.server.commit });
  const folderUri = monaco.Uri.parse(options.workspaceProvider.workspace.folderUri);
  await initialize(editorModeServices(async (modelRef) => {
    showEditor().setModel(modelRef.object.textEditorModel);
    // One runtime object; the editor API and the service override declare it in two type trees.
    return showEditor() as never;
  }), undefined, { ...options, workspaceProvider: { ...options.workspaceProvider, workspace: { folderUri } } } as never);
  await watchConnection(link);

  const commands = await getService(ICommandService);
  const run = (id: string) => boundedCommand(() => commands.executeCommand(id), id, COMMAND_BOUND_MS);
  document.getElementById("quick-open")?.addEventListener("click", () => void run("workbench.action.quickOpen"));
  document.getElementById("new-terminal")?.addEventListener("click", () => {
    boundedCommand(() => openTerminal(folderUri), "the terminal", COMMAND_BOUND_MS).catch((error: Error) => report(link, "connected", error.message));
  });
  link.onOpen(async (path) => {
    const ref = await monaco.editor.createModelReference(monaco.Uri.joinPath(folderUri, path));
    showEditor().setModel(ref.object.textEditorModel);
  });
}

main().catch((error: Error) => report(null, "error", error.message));

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideTasks.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Tasks v1 (the ADR-003 `project.steps` embryo): a `tasks.json` CODE PAGE at
// the workspace root — data, not code, editable inside the IDE itself. Tasks
// run in the interactive PTY at /workspace, where the WHOLE tree is
// materialized — so multi-file programs (#include "util.h", import mymodule,
// gcc *.c) build exactly like on a local machine.
//
// Heavy store/language modules are imported LAZILY inside the actions: this
// module is reachable from the top-bar menu (warm chunk) and must stay thin.

export const TASKS_FILE = "tasks.json";

export type IdeTask = {
  label: string;
  command: string;
  group?: "build" | "test";
  default?: boolean;
};

export const TASKS_TEMPLATE = `{
  "version": 1,
  "tasks": [
    { "label": "build", "command": "echo configure your build here", "group": "build", "default": true },
    { "label": "test", "command": "echo configure your tests here", "group": "test" }
  ]
}
`;

/** Tolerant parse: malformed JSON or shapes yield [], never a throw — the menu
 *  must not explode because a human is mid-edit in tasks.json. */
export function parseTasksJson(text: string): IdeTask[] {
  try {
    const parsed = JSON.parse(text) as { tasks?: unknown };
    if (!Array.isArray(parsed.tasks)) return [];
    return parsed.tasks.filter(
      (t): t is IdeTask =>
        typeof t === "object" && t !== null
        && typeof (t as IdeTask).label === "string"
        && typeof (t as IdeTask).command === "string",
    );
  } catch {
    return [];
  }
}

/** The task a group's runner picks: the group's `default`, else the group's
 *  first, else (no group filter) the overall default-or-first. */
export function findTask(tasks: IdeTask[], group?: "build" | "test"): IdeTask | null {
  const pool = group ? tasks.filter((t) => t.group === group) : tasks;
  return pool.find((t) => t.default) ?? pool[0] ?? null;
}

async function workspaceContext() {
  const [{ useUserStore }, { usePageStore }] = await Promise.all([
    import("@/features/auth"),
    import("@/store/usePageStore"),
  ]);
  const user = useUserStore.getState();
  return {
    workspaceId: user.activeWorkspace()?._id ?? "",
    jwt: user.activePageJwt() ?? "",
    store: usePageStore.getState(),
  };
}

/** Hand the command to the PTY (the workbench opens its dock on run request). */
export async function runInTerminal(command: string): Promise<void> {
  const { workspaceId } = await workspaceContext();
  if (!workspaceId) return;
  const { useTerminalRunBus } = await import("./terminalRunBus");
  useTerminalRunBus.getState().requestRun(`cd /workspace && ${command}`);
}

/** Read + parse the workspace's tasks.json (loaded content only). */
export async function loadTasks(): Promise<IdeTask[]> {
  const { workspaceId } = await workspaceContext();
  if (!workspaceId) return [];
  const { pageStoreFacade } = await import("./pageStoreFacade");
  const facade = pageStoreFacade(workspaceId);
  const entry = facade.list().find((p) => p.parentId === null && p.kind === "file" && p.title === TASKS_FILE);
  if (!entry) return [];
  return parseTasksJson(await facade.readContent(entry.id));
}

/** Open tasks.json — creating it from the template on first use. */
export async function openOrCreateTasksFile(): Promise<void> {
  const { workspaceId, jwt, store } = await workspaceContext();
  if (!workspaceId) return;
  const { pageStoreFacade } = await import("./pageStoreFacade");
  const facade = pageStoreFacade(workspaceId);
  const existing = facade.list().find((p) => p.parentId === null && p.kind === "file" && p.title === TASKS_FILE);
  if (existing) {
    store.openPage({ id: existing.id, workspaceId, kind: "page", title: TASKS_FILE });
    return;
  }
  const { createCodeFileBlock } = await import("./codeFile");
  const page = await store.addPage(workspaceId, TASKS_FILE, jwt, undefined, {
    surface: "code",
    content: [createCodeFileBlock(TASKS_FILE, TASKS_TEMPLATE)],
  });
  if (page) store.openPage({ id: page._id, workspaceId, kind: "page", title: TASKS_FILE });
}

/** Run the group's default task; none configured → open the config file. */
export async function runDefaultTask(group?: "build" | "test"): Promise<void> {
  const task = findTask(await loadTasks(), group);
  if (!task) {
    await openOrCreateTasksFile();
    return;
  }
  await runInTerminal(task.command);
}

/** The focused code file with its language, or null after an info toast
 *  titled `title` saying `notCode` (no workspace, no page, or not code). */
async function activeCodeFile(title: string, notCode: string) {
  const { workspaceId, store } = await workspaceContext();
  if (!workspaceId) return null;
  const [{ useToastStore }, { codeBlockOf }, { languageById, languageForFileName }, { pagePathOf }] = await Promise.all([
    import("@osionos/ui/primitives/useToastStore"),
    import("./codeFile"),
    import("./ideLanguages"),
    import("./pagePathOf"),
  ]);
  const toast = (description: string): void => {
    useToastStore.getState().push({ kind: "info", title, description });
  };
  const activeId = store.activePage?.id ?? null;
  const page = activeId ? store.pageById(activeId) : undefined;
  if (!page || page.surface !== "code") {
    toast(notCode);
    return null;
  }
  const block = codeBlockOf(page);
  const lang = block?.language ? languageById(block.language) : languageForFileName(page.title);
  return { workspaceId, relPath: pagePathOf(page._id), text: block?.content ?? "", lang, toast };
}

/** Run the ACTIVE code file in the interactive PTY (saved content — the menu
 *  path has no live editor buffer; the in-editor Run button covers that). */
export async function runActiveFile(): Promise<void> {
  const file = await activeCodeFile("Run Active File", "Open a code file first — it runs the focused file.");
  if (!file) return;
  if (!file.lang.runnable || !file.lang.runCmd) {
    file.toast(`${file.lang.label} has no run command yet.`);
    return;
  }
  const { ideFsWrite } = await import("./ideFsClient");
  const shellPath = `'/workspace/${file.relPath.replace(/'/g, "'\\''")}'`;
  await ideFsWrite(file.workspaceId, file.relPath, file.text);
  await runInTerminal(file.lang.runCmd.replaceAll("{file}", shellPath));
}

/** Debug a workspace file's CURRENT text: mirror it to the sandbox, then hand
 *  it to the Python debugger (the dock opens on the starting transition). */
export async function debugFile(relPath: string, text: string): Promise<void> {
  const { workspaceId } = await workspaceContext();
  if (!workspaceId) return;
  const [{ ideFsWrite }, { startPythonDebug }] = await Promise.all([
    import("./ideFsClient"),
    import("./debugController"),
  ]);
  await ideFsWrite(workspaceId, relPath, text);
  await startPythonDebug(workspaceId, relPath);
}

/** Debug the ACTIVE file (saved content — the menu path has no live editor
 *  buffer; F5 in the editor debugs its live text). Non-Python → info toast. */
export async function debugActiveFile(): Promise<void> {
  const notPython = "Open a Python file first.";
  const file = await activeCodeFile("Debug Python File", notPython);
  if (!file) return;
  if (file.lang.id !== "python") {
    file.toast(notPython);
    return;
  }
  await debugFile(file.relPath, file.text);
}

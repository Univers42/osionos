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

/** Enter IDE mode + open the dock terminal, then hand the command to the PTY. */
export async function runInTerminal(command: string): Promise<void> {
  const { workspaceId } = await workspaceContext();
  if (!workspaceId) return;
  const [{ useIdeModeStore }, { useTerminalRunBus }] = await Promise.all([
    import("./ideModeStore"),
    import("./terminalRunBus"),
  ]);
  useIdeModeStore.getState().setIdeMode(workspaceId, true);
  useIdeModeStore.getState().setBottomOpen(true);
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

/** Run the ACTIVE code file in the interactive PTY (saved content — the menu
 *  path has no live editor buffer; the in-editor Run button covers that). */
export async function runActiveFile(): Promise<void> {
  const { workspaceId, store } = await workspaceContext();
  if (!workspaceId) return;
  const [{ useToastStore }] = await Promise.all([import("@/shared/ui/primitives/useToastStore")]);
  const activeId = store.activePage?.id ?? null;
  const page = activeId ? store.pageById(activeId) : undefined;
  if (!page || page.surface !== "code") {
    useToastStore.getState().push({ kind: "info", title: "Run Active File", description: "Open a code file first — it runs the focused file." });
    return;
  }
  const [{ codeBlockOf }, { languageById, languageForFileName }, { pathForPage }, { ideFsWrite }] = await Promise.all([
    import("./codeFile"),
    import("./ideLanguages"),
    import("./idePaths"),
    import("./ideFsClient"),
  ]);
  const block = codeBlockOf(page);
  const lang = block?.language ? languageById(block.language) : languageForFileName(page.title);
  if (!lang.runnable || !lang.runCmd) {
    useToastStore.getState().push({ kind: "info", title: "Run Active File", description: `${lang.label} has no run command yet.` });
    return;
  }
  const relPath = pathForPage(page._id, (id) => store.pageById(id));
  const shellPath = `'/workspace/${relPath.replace(/'/g, "'\\''")}'`;
  await ideFsWrite(workspaceId, relPath, block?.content ?? "");
  await runInTerminal(lang.runCmd.replaceAll("{file}", shellPath));
}

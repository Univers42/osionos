/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   terminalMenu.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { debugActiveFile, openOrCreateTasksFile, runActiveFile, runDefaultTask } from "@/features/ide/model/ideTasks";
import { openWorkbenchTerminal } from "@/widgets/workbench/model/workbenchMenuActions";
import type { MenuGroup } from "../menuTypes";

/**
 * Terminal: the dock terminal and the task runner. Debug Python File carries no
 * accelerator: F5 is bound only inside the machine IDE frame, not in this shell.
 */
export function terminalMenu(): MenuGroup {
  return {
    id: "terminal", label: "Terminal", items: [
      { id: "term.new", label: "New Terminal", accelerator: "⌃`", run: () => openWorkbenchTerminal("new") },
      { id: "term.split", label: "Split Terminal", run: () => openWorkbenchTerminal("split") },
      { id: "term.run-task", label: "Run Task", run: () => void runDefaultTask() },
      { id: "term.run-build", label: "Run Build Task", run: () => void runDefaultTask("build") },
      { id: "term.run-active", label: "Run Active File", run: () => void runActiveFile() },
      { id: "term.debug-active", label: "Debug Python File", run: () => void debugActiveFile() },
      { id: "term.run-test", label: "Run Selected Test", run: () => void runDefaultTask("test"), separatorAfter: true },
      { id: "term.configure", label: "Configure Tasks", run: () => void openOrCreateTasksFile() },
      { id: "term.configure-build", label: "Configure Default Build Task", run: () => void openOrCreateTasksFile() },
    ],
  };
}

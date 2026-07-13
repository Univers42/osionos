/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MyTasksPanel.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { CalendarClock, ListTodo } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import { usePageStore } from "@/store/usePageStore";
import { bucketOf, useMyTasks, type TaskBucket, type TaskItem } from "../model/useMyTasks";

const GROUPS: { key: TaskBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "someday", label: "No date" },
];

/** Open the task's page and scroll its block into view. */
function openTask(task: TaskItem): void {
  const title = usePageStore.getState().pageById(task.pageId)?.title || "Untitled";
  usePageStore.getState().openPage({ id: task.pageId, workspaceId: task.workspaceId, kind: "page", title });
  setTimeout(() => {
    document.querySelector(`[data-block-id="${task.blockId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}

function TaskRow({ task }: { task: TaskItem }): React.ReactElement {
  const overdue = bucketOf(task) === "overdue";
  return (
    <button
      type="button"
      onClick={() => openTask(task)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
    >
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--osio-border-default)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{task.content || "Untitled task"}</span>
      {task.dueAt && (
        <span className={cx("flex shrink-0 items-center gap-1 text-xs", overdue ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-subtle)]")}>
          <CalendarClock size={12} />
          {task.dueAt.slice(5, 10)}
        </span>
      )}
    </button>
  );
}

/** The activity-rail "Tasks" panel: my open to_dos grouped by due date. */
export const MyTasksPanel: React.FC = () => {
  const { tasks, loading } = useMyTasks();
  const grouped = GROUPS.map((group) => ({ ...group, items: tasks.filter((task) => bucketOf(task) === group.key) }));
  const empty = !loading && tasks.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
      {empty ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <ListTodo size={22} className="text-[var(--osio-fg-subtle)]" />
          <p className="text-sm text-[var(--osio-fg-muted)]">No open tasks.</p>
          <p className="text-xs text-[var(--osio-fg-subtle)]">Add a due date to any to-do to see it here.</p>
        </div>
      ) : (
        grouped.filter((group) => group.items.length > 0).map((group) => (
          <section key={group.key} className="mb-3">
            <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--osio-fg-subtle)]">
              {group.label} <span className="text-[var(--osio-fg-subtle)]">· {group.items.length}</span>
            </h3>
            {group.items.map((task) => <TaskRow key={`${task.pageId}:${task.blockId}`} task={task} />)}
          </section>
        ))
      )}
    </div>
  );
};

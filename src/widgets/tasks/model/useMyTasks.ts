/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMyTasks.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";
import { api, getActivePageJwt } from "@/shared/api/client";
import { useUserStore } from "@/features/auth";

export interface TaskItem {
  pageId: string;
  blockId: string;
  workspaceId: string;
  content: string;
  checked: boolean;
  dueAt: string | null;
}

export type TaskBucket = "overdue" | "today" | "upcoming" | "someday";

/** Local YYYY-MM-DD "today" (dueAt is stored/compared as a date string). */
function todayKey(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function bucketOf(task: TaskItem, today = todayKey()): TaskBucket {
  const due = task.dueAt ? task.dueAt.slice(0, 10) : "";
  if (!due) return "someday";
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

/** Owner-scoped open tasks (bridge /api/tasks), refreshed on workspace change. */
export function useMyTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ tasks?: TaskItem[] }>("/api/tasks?due=all", getActivePageJwt() ?? undefined);
      setTasks(Array.isArray(res.tasks) ? res.tasks : []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload, workspaceId]);

  return { tasks, loading, reload };
}

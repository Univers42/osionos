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
import { toDateKey, todayKey } from "@/shared/lib/date/dateKey";

export interface TaskItem {
  pageId: string;
  blockId: string;
  workspaceId: string;
  content: string;
  checked: boolean;
  dueAt: string | null;
}

export type TaskBucket = "overdue" | "today" | "upcoming" | "someday";

export function bucketOf(task: TaskItem, today = todayKey()): TaskBucket {
  const due = toDateKey(task.dueAt);
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

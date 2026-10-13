/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   duplicatePlan.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

export interface DuplicateStep {
  sourceId: string;
  parentSourceId: string | null;
}

/**
 * Order a subtree so a server copy can replay it parent-before-child.
 * BFS guarantees a parent is created before any child needs its id.
 * The queue uses a head index so dequeue stays O(1) on wide trees.
 * O(n) time and O(n) space over `pages`.
 */
export function planDuplicate(pages: readonly PageEntry[], rootId: string): DuplicateStep[] {
  const childrenByParent = new Map<string, PageEntry[]>();
  let rootFound = false;
  for (const page of pages) {
    if (page._id === rootId) {
      rootFound = true;
    }
    const parentId = page.parentPageId;
    if (typeof parentId !== "string") {
      continue;
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(page);
    } else {
      childrenByParent.set(parentId, [page]);
    }
  }
  if (!rootFound) {
    return [];
  }
  const steps: DuplicateStep[] = [{ sourceId: rootId, parentSourceId: null }];
  const seen = new Set<string>([rootId]);
  let head = 0;
  while (head < steps.length) {
    const current = steps[head];
    head += 1;
    const children = childrenByParent.get(current.sourceId) ?? [];
    for (const child of children) {
      if (seen.has(child._id)) {
        continue;
      }
      seen.add(child._id);
      steps.push({ sourceId: child._id, parentSourceId: current.sourceId });
    }
  }
  return steps;
}

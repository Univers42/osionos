/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dailyNote.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Quick capture → today's daily note. Pure reuse of the page store: find-or-
 *  create a "Daily Notes" parent + a YYYY-MM-DD child, append one block. Persists
 *  through the normal outbox (BaaS is the source of truth). No new schema. */

import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";

const DAILY_PARENT_TITLE = "Daily Notes";

/** Local-time YYYY-MM-DD (matches what the user sees on their calendar). */
export function todayTitle(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function captureBlock(text: string): Block {
  return { id: crypto.randomUUID(), type: "paragraph", content: text, children: [] };
}

function findByTitle(pages: readonly PageEntry[], title: string, parentPageId: string | null): PageEntry | undefined {
  return pages.find((page) => !page.archivedAt && (page.title ?? "") === title && (page.parentPageId ?? null) === parentPageId);
}

/**
 * Append `text` to today's daily note (creating the parent + day page as needed).
 * Returns the day-note page, or null if there is no session. Throws rather than
 * risk data loss if an existing note's content cannot be loaded before appending.
 */
export async function captureToDailyNote(text: string): Promise<PageEntry | null> {
  const user = useUserStore.getState();
  const workspace = user.activeWorkspace();
  const jwt = user.activePageJwt() ?? "";
  const body = text.trim();
  if (!workspace || !body) return null;
  const store = usePageStore.getState();
  const wsId = workspace._id;
  const pages = () => store.pagesForWorkspace(wsId);

  let parent = findByTitle(pages(), DAILY_PARENT_TITLE, null);
  if (!parent) parent = (await store.addPage(wsId, DAILY_PARENT_TITLE, jwt, undefined, { icon: "icon:calendar" })) ?? undefined;
  if (!parent) return null;

  const day = findByTitle(pages(), todayTitle(), parent._id);
  if (!day) return store.addPage(wsId, todayTitle(), jwt, parent._id, { content: [captureBlock(body)] });

  // Append to an existing note — load its content first so we never overwrite the
  // server copy with just this one block (content is lazy: undefined = unloaded).
  let blocks = store.pageById(day._id)?.content;
  if (!Array.isArray(blocks)) {
    await store.fetchPageContent(day._id, jwt);
    blocks = usePageStore.getState().pageById(day._id)?.content;
  }
  if (!Array.isArray(blocks)) throw new Error("Could not load today's note to append.");
  store.updatePageContent(day._id, [...blocks, captureBlock(body)]);
  return day;
}

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openEnvFile.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createCodeFileBlock } from "@/features/ide/model/codeFile";
import { getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

import { ENV_FILE_TITLE, findEnvPage } from "./envFile";

const STARTER = `${JSON.stringify(
  {
    COMPANY: "Acme",
    LAUNCH: { type: "date", value: new Date().toISOString().slice(0, 10), format: "long" },
    PRICE: { type: "number", value: 49, format: "currency:EUR" },
  },
  null,
  2,
)}\n`;

// One create per place at a time: a second click while the first is in flight
// would otherwise leave two env.json pages, and only the first is ever read.
const creating = new Map<string, Promise<string | null>>();

async function ensureEnvPage(workspaceId: string, parentPageId: string | undefined): Promise<string | null> {
  const store = usePageStore.getState();
  const existing = findEnvPage(store.pages[workspaceId], parentPageId);
  if (existing) return existing._id;
  const page = await store.addPage(workspaceId, ENV_FILE_TITLE, getActivePageJwt() ?? "", parentPageId, {
    surface: "code",
    content: [createCodeFileBlock(ENV_FILE_TITLE, STARTER)],
  });
  return page?._id ?? null;
}

/**
 * Opens the env.json at the workspace root, or the one under `parentPageId` that
 * applies to that page's subtree, creating it with a starter set when it is missing.
 */
export async function openEnvFile(workspaceId: string, parentPageId?: string): Promise<boolean> {
  const key = `${workspaceId}/${parentPageId ?? ""}`;
  let pending = creating.get(key);
  if (!pending) {
    pending = ensureEnvPage(workspaceId, parentPageId).finally(() => creating.delete(key));
    creating.set(key, pending);
  }
  const pageId = await pending;
  if (!pageId) return false;
  usePageStore.getState().openPage({ id: pageId, workspaceId, kind: "page", title: ENV_FILE_TITLE });
  return true;
}

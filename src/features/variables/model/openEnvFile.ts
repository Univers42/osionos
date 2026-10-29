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

import { codeBlockOf, createCodeFileBlock } from "@/features/ide/model/codeFile";
import { openCodeEditor } from "@/features/ide/model/openCodeEditors";
import { getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";

import { ENV_FILE_TITLE, findEnvPage } from "./envFile";
import { addVariableToSource } from "./envFileEdit";

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

async function ensureEnvPage(workspaceId: string, parentPageId: string | undefined, initial: string): Promise<string | null> {
  const store = usePageStore.getState();
  const existing = findEnvPage(store.pages[workspaceId], parentPageId);
  if (existing) return existing._id;
  const page = await store.addPage(workspaceId, ENV_FILE_TITLE, getActivePageJwt() ?? "", parentPageId, {
    surface: "code",
    content: [createCodeFileBlock(ENV_FILE_TITLE, initial)],
  });
  return page?._id ?? null;
}

/** The env.json page at the workspace root or under `parentPageId`, created with `initial` when missing. */
function ensureEnvFile(workspaceId: string, parentPageId: string | undefined, initial: string): Promise<string | null> {
  const key = `${workspaceId}/${parentPageId ?? ""}`;
  let pending = creating.get(key);
  if (!pending) {
    pending = ensureEnvPage(workspaceId, parentPageId, initial).finally(() => creating.delete(key));
    creating.set(key, pending);
  }
  return pending;
}

/**
 * Opens the env.json at the workspace root, or the one under `parentPageId` that
 * applies to that page's subtree, creating it with a starter set when it is missing.
 */
export async function openEnvFile(workspaceId: string, parentPageId?: string): Promise<boolean> {
  const pageId = await ensureEnvFile(workspaceId, parentPageId, STARTER);
  if (!pageId) return false;
  usePageStore.getState().openPage({ id: pageId, workspaceId, kind: "page", title: ENV_FILE_TITLE });
  return true;
}

/**
 * Appends `"name": "value"` to the env.json at the workspace root or under `parentPageId`,
 * creating the file when missing. Returns why it could not, or null once it is written.
 */
export async function addVariable(workspaceId: string, parentPageId: string | undefined, name: string, value: string): Promise<string | null> {
  const pageId = await ensureEnvFile(workspaceId, parentPageId, "{}\n");
  if (!pageId) return "could not create env.json";
  // Content is lazy: appending to a file that is not loaded would replace it.
  if (usePageStore.getState().pageById(pageId)?.content === undefined) await usePageStore.getState().fetchPageContent(pageId, getActivePageJwt() ?? "");
  const block = codeBlockOf(usePageStore.getState().pageById(pageId));
  if (!block) return "env.json is still loading; try again";
  // An open editor holds text the store has not seen yet, and would save over this edit.
  const editor = openCodeEditor(pageId);
  const result = addVariableToSource(editor?.read() ?? block.content, name, value);
  if ("error" in result) return result.error;
  editor?.replace(result.source);
  usePageStore.getState().updateBlock(pageId, block.id, { content: result.source });
  return null;
}

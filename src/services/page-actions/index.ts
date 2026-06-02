/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:19 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 19:18:51 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from "@/shared/api/client";
import { parseMarkdownToBlocks } from "@/shared/lib/markengine";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import type { PageConfig } from "@/shared/config/pageConfigStore";
import { serializeBlocksToMarkdown } from "./pageMarkdownSerialize";

export { serializeBlocksToMarkdown, blockToMarkdown } from "./pageMarkdownSerialize";

const PAGE_ACTION_SYNC_ENABLED = ((import.meta.env as Record<string, string> | undefined)?.["VITE_PAGE_ACTION_SYNC_ENABLED"] ?? "").toLowerCase() === "true";

export type PageActionName =
  | "copy_link"
  | "copy_page_contents"
  | "duplicate"
  | "move_to_trash"
  | "present"
  | "small_text"
  | "full_width"
  | "lock_page"
  | "translate"
  | "import"
  | "export"
  | "updates_analytics"
  | "version_history"
  | "notify_me"
  | "connections";

interface TranslateResponse {
  title?: string;
  content?: Block[];
}

interface ExportPayload {
  exportedAt: string;
  page: PageEntry;
  config: PageConfig;
}

export interface ImportedPagePayload {
  title?: string;
  content: Block[];
}

function pageUrl(pageId: string): string {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("page", pageId);
  return url.toString();
}

function safeFileName(value: string): string {
  let fileName = "";
  let previousWasSeparator = true;

  for (const char of value.trim().toLowerCase()) {
    const isSafeChar =
      (char >= "a" && char <= "z") ||
      (char >= "0" && char <= "9") ||
      char === "_";

    if (isSafeChar) {
      fileName += char;
      previousWasSeparator = false;
    } else if (!previousWasSeparator) {
      fileName += "-";
      previousWasSeparator = true;
    }
  }

  return fileName.endsWith("-") ? fileName.slice(0, -1) : fileName || "page";
}

export function serializePageToMarkdown(page: PageEntry): string {
  const body = serializeBlocksToMarkdown(page.content ?? []);
  return `# ${page.title || "Untitled"}\n\n${body}`.trim();
}

export async function copyPageLink(pageId: string): Promise<string> {
  const link = pageUrl(pageId);
  await navigator.clipboard.writeText(link);
  return link;
}

export async function copyPageContents(page: PageEntry): Promise<string> {
  const markdown = serializePageToMarkdown(page);
  await navigator.clipboard.writeText(markdown);
  return markdown;
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportPage(page: PageEntry, config: PageConfig) {
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    page,
    config,
  };
  downloadJson(`${safeFileName(page.title)}.json`, payload);
}

export async function importPageFile(file: File): Promise<ImportedPagePayload> {
  const text = await file.text();
  if (file.name.endsWith(".json")) {
    const json = JSON.parse(text) as Partial<ExportPayload> & Partial<PageEntry>;
    const sourcePage = json.page ?? json;
    return {
      title: sourcePage.title,
      content: Array.isArray(sourcePage.content) ? sourcePage.content : [],
    };
  }

  const extensionIndex = file.name.lastIndexOf(".");

  return {
    title: extensionIndex > 0 ? file.name.slice(0, extensionIndex) : file.name,
    content: parseMarkdownToBlocks(text),
  };
}

const TRANSLATABLE_BLOCK_TYPES = new Set<Block["type"]>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "heading_4",
  "heading_5",
  "heading_6",
  "bulleted_list",
  "numbered_list",
  "to_do",
  "toggle",
  "quote",
  "callout",
  "image",
  "video",
  "audio",
  "file",
]);

function looksLikePrefixTranslation(value: string | undefined, targetLocale: string): boolean {
  return Boolean(value?.startsWith(`[${targetLocale}] `));
}

function configuredTranslationEndpoint(): string {
  return ((import.meta.env as Record<string, string>).VITE_TRANSLATION_API_URL ?? "").trim();
}

function parseGoogleTranslateResponse(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
  const translated = payload[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("")
    .trim();
  return translated || null;
}

function parseConfiguredTranslateResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const translated = record.translatedText ?? record.translation ?? record.text;
  return typeof translated === "string" && translated.trim() ? translated : null;
}

async function translateWithConfiguredEndpoint(
  text: string,
  targetLocale: string,
  jwt?: string,
): Promise<string | null> {
  const endpoint = configuredTranslationEndpoint();
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ text, targetLocale, sourceLocale: "auto" }),
  });
  if (!response.ok) return null;
  return parseConfiguredTranslateResponse(await response.json());
}

async function translateWithGooglePublicEndpoint(text: string, targetLocale: string): Promise<string | null> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", targetLocale);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  return parseGoogleTranslateResponse(await response.json());
}

async function translateWithMyMemory(text: string, targetLocale: string): Promise<string | null> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `auto|${targetLocale}`);

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const payload = await response.json() as Record<string, unknown>;
  const translated = (payload.responseData as Record<string, unknown> | undefined)?.translatedText;
  return typeof translated === "string" && translated.trim() ? translated : null;
}

async function translateText(
  text: string,
  targetLocale: string,
  jwt: string | undefined,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const cacheKey = `${targetLocale}\u0000${text}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    for (const translator of [
      () => translateWithConfiguredEndpoint(text, targetLocale, jwt),
      () => translateWithGooglePublicEndpoint(text, targetLocale),
      () => translateWithMyMemory(text, targetLocale),
    ]) {
      try {
        const translated = await translator();
        if (translated && !looksLikePrefixTranslation(translated, targetLocale)) {
          return translated;
        }
      } catch {
        // Try the next translation provider.
      }
    }

    return text;
  })();

  cache.set(cacheKey, promise);
  return promise;
}

async function translateBlock(
  block: Block,
  targetLocale: string,
  jwt: string | undefined,
  cache: Map<string, Promise<string>>,
): Promise<Block> {
  const nextContent = TRANSLATABLE_BLOCK_TYPES.has(block.type)
    ? await translateText(block.content, targetLocale, jwt, cache)
    : block.content;
  const nextTableData = block.tableData
    ? await Promise.all(
        block.tableData.map((row) =>
          Promise.all(row.map((cell) => translateText(cell, targetLocale, jwt, cache))),
        ),
      )
    : undefined;

  return {
    ...block,
    content: nextContent,
    ...(nextTableData ? { tableData: nextTableData } : {}),
    children: block.children
      ? await Promise.all(block.children.map((child) => translateBlock(child, targetLocale, jwt, cache)))
      : undefined,
  };
}

export async function translatePage(
  page: PageEntry,
  jwt: string | undefined,
  targetLocale = "fr",
): Promise<TranslateResponse> {
  if (jwt) {
    try {
      const translated = await api.post<TranslateResponse>(
        `/api/pages/${page._id}/translate`,
        { targetLocale, workspaceId: page.workspaceId, title: page.title, content: page.content ?? [] },
        jwt,
      );
      if (!looksLikePrefixTranslation(translated.title, targetLocale)) {
        return translated;
      }
    } catch {
      // Fall through to the browser translation providers.
    }
  }

  const cache = new Map<string, Promise<string>>();
  return {
    title: await translateText(page.title, targetLocale, jwt, cache),
    content: page.content
      ? await Promise.all(page.content.map((block) => translateBlock(block, targetLocale, jwt, cache)))
      : [],
  };
}

export async function syncPageActionEvent(
  pageId: string,
  action: PageActionName,
  jwt: string | undefined,
  payload: Record<string, unknown> = {},
) {
  if (!jwt || !PAGE_ACTION_SYNC_ENABLED) return;
  try {
    await api.post(`/api/pages/${pageId}/actions`, { action, payload }, jwt);
  } catch {
    // Offline mode keeps Zustand/local data. API can sync later.
  }
}
import { api } from "@/shared/api/client";
import { parseMarkdownToBlocks } from "@/lib/markengine/shortcuts";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import type { PageConfig } from "@/shared/config/pageConfigStore";

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
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-_]+/gi, "-")
    .replaceAll(/^-+|-+$/g, "") || "page";
}

function blockToMarkdown(block: Block, depth = 0): string {
  const indent = "  ".repeat(depth);
  const content = block.content ?? "";

  let line = content;
  if (block.type === "heading_1") line = `# ${content}`;
  if (block.type === "heading_2") line = `## ${content}`;
  if (block.type === "heading_3") line = `### ${content}`;
  if (block.type === "bulleted_list") line = `${indent}- ${content}`;
  if (block.type === "numbered_list") line = `${indent}1. ${content}`;
  if (block.type === "to_do") line = `${indent}- [${block.checked ? "x" : " "}] ${content}`;
  if (block.type === "quote") line = `> ${content}`;
  if (block.type === "divider") line = "---";
  if (block.type === "code") line = `\`\`\`${block.language ?? ""}\n${content}\n\`\`\``;

  const children = block.children?.map((child) => blockToMarkdown(child, depth + 1)).join("\n") ?? "";
  return children ? `${line}\n${children}` : line;
}

export function serializePageToMarkdown(page: PageEntry): string {
  const blocks = page.content ?? [];
  const body = blocks.map((block) => blockToMarkdown(block)).join("\n\n");
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

  return {
    title: file.name.replaceAll(/\.[^.]+$/g, ""),
    content: parseMarkdownToBlocks(text),
  };
}

function localTranslateBlock(block: Block, targetLocale: string): Block {
  if (!block.content) return block;
  const prefix = `[${targetLocale}] `;
  return {
    ...block,
    content: block.content.startsWith(prefix) ? block.content : `${prefix}${block.content}`,
    children: block.children?.map((child) => localTranslateBlock(child, targetLocale)),
  };
}

export async function translatePage(
  page: PageEntry,
  jwt: string | undefined,
  targetLocale = "fr",
): Promise<TranslateResponse> {
  if (jwt) {
    try {
      return await api.post<TranslateResponse>(
        `/api/pages/${page._id}/translate`,
        { targetLocale },
        jwt,
      );
    } catch {
      // Fall through to local/offline translation preview.
    }
  }

  const titlePrefix = `[${targetLocale}] `;
  return {
    title: page.title.startsWith(titlePrefix) ? page.title : `${titlePrefix}${page.title}`,
    content: page.content?.map((block) => localTranslateBlock(block, targetLocale)) ?? [],
  };
}

export async function syncPageActionEvent(
  pageId: string,
  action: PageActionName,
  jwt: string | undefined,
  payload: Record<string, unknown> = {},
) {
  if (!jwt) return;
  try {
    await api.post(`/api/pages/${pageId}/actions`, { action, payload }, jwt);
  } catch {
    // Offline mode keeps Zustand/local data. API can sync later.
  }
}
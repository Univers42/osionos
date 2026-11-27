/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentBlocks.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { Block } from "@/entities/block";

import { createId } from "./agentIds";

const BLOCK_TYPES = new Set<Block["type"]>([
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
  "image",
  "video",
  "audio",
  "file",
  "quote",
  "callout",
  "code",
  "equation",
  "layout",
  "column_list",
  "column",
  "divider",
  "table_block",
  "database_inline",
  "database_full_page",
]);

function isBlockType(value: unknown): value is Block["type"] {
  return typeof value === "string" && BLOCK_TYPES.has(value as Block["type"]);
}

function blocksFromUnknown(value: unknown): Block[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value.map(toBlock).filter((block): block is Block => Boolean(block));
  return blocks.length ? blocks : undefined;
}

function tableDataFromUnknown(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")]);
}

function numberFromUnknown(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function layoutCellsFromUnknown(value: unknown): Block["layoutCells"] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((cell) => cell && typeof cell === "object").map((cell, index) => {
    const record = cell as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : createId("mcp-layout-cell"),
      colStart: numberFromUnknown(record.colStart, index + 1),
      colSpan: numberFromUnknown(record.colSpan, 1),
      rowStart: numberFromUnknown(record.rowStart, 1),
      rowSpan: numberFromUnknown(record.rowSpan, 1),
      label: typeof record.label === "string" ? record.label : undefined,
      blocks: blocksFromUnknown(record.blocks) ?? [],
    };
  });
}

function applyBlockCollections(block: Block, record: Record<string, unknown>) {
  const children = blocksFromUnknown(record.children);
  const tableData = tableDataFromUnknown(record.tableData);
  const layoutCells = layoutCellsFromUnknown(record.layoutCells);
  if (children) block.children = children;
  if (tableData) block.tableData = tableData;
  if (layoutCells) block.layoutCells = layoutCells;
}

function applyBlockMetadata(block: Block, record: Record<string, unknown>) {
  if (typeof record.checked === "boolean") block.checked = record.checked;
  if (typeof record.language === "string") block.language = record.language;
  if (typeof record.color === "string") block.color = record.color;
  if (typeof record.textColor === "string") block.textColor = record.textColor;
  if (typeof record.backgroundColor === "string") block.backgroundColor = record.backgroundColor;
  if (typeof record.collapsed === "boolean") block.collapsed = record.collapsed;
  if (typeof record.asset === "string") block.asset = record.asset;
  if (typeof record.databaseId === "string") block.databaseId = record.databaseId;
  if (typeof record.viewId === "string") block.viewId = record.viewId;
  if (typeof record.widthRatio === "number") block.widthRatio = record.widthRatio;
  if (typeof record.mediaWidth === "number") block.mediaWidth = record.mediaWidth;
}

function applyBlockLayoutMetadata(block: Block, record: Record<string, unknown>) {
  if (record.layoutMode === "inline" || record.layoutMode === "full_page") block.layoutMode = record.layoutMode;
  if (record.layoutConfig && typeof record.layoutConfig === "object") block.layoutConfig = record.layoutConfig;
  if ([1, 2, 3, 4, 5, 6].includes(Number(record.headingLevel))) block.headingLevel = Number(record.headingLevel) as Block["headingLevel"];
}

export function toBlock(value: unknown): Block | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isBlockType(record.type)) return null;
  const block: Block = {
    id: typeof record.id === "string" ? record.id : createId("mcp-block"),
    type: record.type,
    content: typeof record.content === "string" ? record.content : "",
  };
  applyBlockCollections(block, record);
  applyBlockMetadata(block, record);
  applyBlockLayoutMetadata(block, record);
  return block;
}

export function fallbackBlocksFromText(text: string): Block[] {
  return text.split(/\r?\n/).filter(Boolean).map((line) => ({
    id: createId("mcp-mirror-block"),
    type: "paragraph",
    content: line,
  }));
}

export function parseCreatedPageFromToolText(text: string): { externalPageId: string; title: string; content: Block[] } | null {
  try {
    const parsed = JSON.parse(text) as { created?: Record<string, unknown>; page?: Record<string, unknown> };
    const page = parsed.page ?? parsed.created;
    const rawExternalPageId = parsed.created?.id ?? page?._id;
    const rawTitle = page?.title ?? parsed.created?.title;
    const externalPageId = typeof rawExternalPageId === "string" || typeof rawExternalPageId === "number" ? String(rawExternalPageId) : "";
    const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : "Claude MCP page";
    const rawContent = Array.isArray(page?.content) ? page.content : [];
    const content = rawContent.map(toBlock).filter((item): item is Block => Boolean(item));
    return externalPageId ? { externalPageId, title, content: content.length ? content : fallbackBlocksFromText(text) } : null;
  } catch {
    return null;
  }
}

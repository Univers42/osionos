/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   html.ts                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// HTML Renderer — AST → HTML string
//
//

import type { BlockNode, InlineNode } from "../ast";
import { renderInlineNodesToHtml } from "./inlineHtml";
import {
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
  type MarkdownModeResolver,
  type MarkdownModeState,
  type MarkdownViewMode,
} from "./renderMode";
import { escapeHtml } from "../../renderCore";

export interface HtmlRenderOptions {
  wrapperClass?: string;
  externalLinks?: boolean;
  classPrefix?: string;
  sanitizeHtml?: boolean;
  mode?: MarkdownViewMode;
  blockModes?: MarkdownViewMode[];
  resolveBlockMode?: MarkdownModeResolver<BlockNode>;
}

type ResolvedHtmlRenderOptions = Required<
  Pick<
    HtmlRenderOptions,
    "wrapperClass" | "externalLinks" | "classPrefix" | "sanitizeHtml" | "mode"
  >
> &
  Pick<HtmlRenderOptions, "blockModes" | "resolveBlockMode">;

const defaults: ResolvedHtmlRenderOptions = {
  wrapperClass: "",
  externalLinks: true,
  classPrefix: "md",
  sanitizeHtml: false,
  mode: "reading",
};

export function renderHtml(
  blocks: BlockNode[],
  opts?: HtmlRenderOptions,
): string {
  const o: ResolvedHtmlRenderOptions = { ...defaults, ...opts };
  const modeState = resolveMarkdownMode(o.mode);
  const inner = renderTopLevelBlocks(blocks, o);
  if (o.wrapperClass) {
    return `<article class="${esc(o.wrapperClass)}" data-mode="${modeState.name}">\n${inner}\n</article>`;
  }
  return inner;
}

function renderTopLevelBlocks(
  blocks: BlockNode[],
  o: ResolvedHtmlRenderOptions,
): string {
  let html = "";
  for (let index = 0; index < blocks.length; index++) {
    const blockState = resolveIndexedMarkdownMode(
      o.mode,
      index,
      blocks[index],
      o.blockModes,
      o.resolveBlockMode,
    );
    if (index > 0) html += "\n";
    html += renderBlock(blocks[index], o, blockState);
  }
  return html;
}

function renderChildBlocks(
  blocks: BlockNode[],
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
): string {
  let html = "";
  for (let index = 0; index < blocks.length; index++) {
    if (index > 0) html += "\n";
    html += renderBlock(blocks[index], o, modeState);
  }
  return html;
}

function renderBlock(
  node: BlockNode,
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
): string {
  const blockStateAttr = ` data-block-state="${modeState.getBlockState()}"`;
  switch (node.type) {
    case "document":
      return renderChildBlocks(node.children, o, modeState);

    case "paragraph":
      return `<p${blockStateAttr}>${renderInlines(node.children, o)}</p>`;

    case "heading": {
      const tag = `h${node.level}`;
      const id = node.id ? ` id="${esc(node.id)}"` : "";
      return `<${tag}${id}${blockStateAttr}>${renderInlines(node.children, o)}</${tag}>`;
    }

    case "blockquote":
      return `<blockquote${blockStateAttr}>\n${renderChildBlocks(node.children, o, modeState)}\n</blockquote>`;

    case "code_block": {
      const langClass = node.lang ? ` class="language-${esc(node.lang)}"` : "";
      const metaAttr = node.meta ? ` data-meta="${esc(node.meta)}"` : "";
      return `<pre${metaAttr}${blockStateAttr}><code${langClass}>${esc(node.value)}</code></pre>`;
    }

    case "unordered_list":
      return `<ul${blockStateAttr}>\n${renderListItems(node.children, o, modeState, blockStateAttr)}\n</ul>`;

    case "ordered_list": {
      const start = node.start === 1 ? "" : ` start="${node.start}"`;
      return `<ol${start}${blockStateAttr}>\n${renderListItems(node.children, o, modeState, blockStateAttr)}\n</ol>`;
    }

    case "task_list":
      return `<ul class="${o.classPrefix}-task-list"${blockStateAttr}>\n${renderTaskListItems(node.children, o, modeState, blockStateAttr)}\n</ul>`;

    case "thematic_break":
      return `<hr${blockStateAttr} />`;

    case "table":
      return renderTable(node, o, modeState);

    case "callout": {
      const cls = `${o.classPrefix}-callout ${o.classPrefix}-callout-${node.kind}`;
      const title = node.title.length
        ? `<div class="${o.classPrefix}-callout-title">${renderInlines(node.title, o)}</div>\n`
        : "";
      const body = renderChildBlocks(node.children, o, modeState);
      return `<div class="${cls}"${blockStateAttr}>\n${title}${body}\n</div>`;
    }

    case "math_block":
      return `<div class="${o.classPrefix}-math-block"${blockStateAttr}>${esc(node.value)}</div>`;

    case "html_block":
      return o.sanitizeHtml ? `<!-- sanitized html block -->` : node.value;

    case "footnote_def": {
      const id = `fn-${esc(node.label)}`;
      const body = renderChildBlocks(node.children, o, modeState);
      return `<div id="${id}" class="${o.classPrefix}-footnote"${blockStateAttr}>\n<sup>${esc(node.label)}</sup>\n${body}\n</div>`;
    }

    case "definition_list": {
      const items = renderDefinitionItems(node.items, o);
      return `<dl${blockStateAttr}>\n${items}\n</dl>`;
    }

    case "toggle": {
      const summary = renderInlines(node.summary, o);
      const body = renderChildBlocks(node.children, o, modeState);
      return `<details${blockStateAttr}>\n<summary>${summary}</summary>\n${body}\n</details>`;
    }

    default:
      return "";
  }
}

function renderTaskItemContent(
  nodes: BlockNode[],
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
): string {
  // Keep the most common case compact so task text stays on the same visual line.
  if (nodes.length === 1 && nodes[0].type === "paragraph") {
    return renderInlines(nodes[0].children, o);
  }
  return renderChildBlocks(nodes, o, modeState);
}

function renderListItems(
  nodes: { children: BlockNode[] }[],
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
  blockStateAttr: string,
): string {
  let html = "";
  for (let index = 0; index < nodes.length; index++) {
    if (index > 0) html += "\n";
    html += `<li${blockStateAttr}>${renderChildBlocks(nodes[index].children, o, modeState)}</li>`;
  }
  return html;
}

function renderTaskListItems(
  nodes: { checked: boolean; children: BlockNode[] }[],
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
  blockStateAttr: string,
): string {
  let html = "";
  for (let index = 0; index < nodes.length; index++) {
    const item = nodes[index];
    const checked = item.checked ? " checked disabled" : " disabled";
    const inner = renderTaskItemContent(item.children, o, modeState);
    if (index > 0) html += "\n";
    html += `<li class="${o.classPrefix}-task-item"${blockStateAttr}><input type="checkbox"${checked} />${inner}</li>`;
  }
  return html;
}

function renderDefinitionItems(
  items: Extract<BlockNode, { type: "definition_list" }>["items"],
  o: ResolvedHtmlRenderOptions,
): string {
  let html = "";
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (index > 0) html += "\n";
    html += `<dt>${renderInlines(item.term, o)}</dt>\n`;
    for (let definitionIndex = 0; definitionIndex < item.definitions.length; definitionIndex++) {
      if (definitionIndex > 0) html += "\n";
      html += `<dd>${renderInlines(item.definitions[definitionIndex], o)}</dd>`;
    }
  }
  return html;
}

function renderTable(
  node: Extract<BlockNode, { type: "table" }>,
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
): string {
  const blockStateAttr = ` data-block-state="${modeState.getBlockState()}"`;
  const alignStyle = (i: number): string => {
    const a = node.alignments[i];
    return a ? ` style="text-align:${a}"` : "";
  };

  let headCells = "";
  for (let index = 0; index < node.head.cells.length; index++) {
    const cell = node.head.cells[index];
    headCells += `<th${alignStyle(index)}>${renderInlines(cell.children, o)}</th>`;
  }

  let bodyRows = "";
  for (let rowIndex = 0; rowIndex < node.rows.length; rowIndex++) {
    const row = node.rows[rowIndex];
    if (rowIndex > 0) bodyRows += "\n";
    bodyRows += "<tr>";
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex++) {
      const cell = row.cells[cellIndex];
      bodyRows += `<td${alignStyle(cellIndex)}>${renderInlines(cell.children, o)}</td>`;
    }
    bodyRows += "</tr>";
  }

  return `<table${blockStateAttr}>\n<thead><tr>${headCells}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`;
}

function renderInlines(
  nodes: InlineNode[],
  o: ResolvedHtmlRenderOptions,
): string {
  return renderInlineNodesToHtml(nodes, {
    classPrefix: o.classPrefix,
    editorChrome: false,
    externalLinks: o.externalLinks,
  });
}

function esc(str: string): string {
  return escapeHtml(str);
}

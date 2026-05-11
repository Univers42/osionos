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
  const inner = blocks
    .map((block, index) => {
      const blockState = resolveIndexedMarkdownMode(
        o.mode,
        index,
        block,
        o.blockModes,
        o.resolveBlockMode,
      );
      return renderBlock(block, o, blockState);
    })
    .join("\n");
  if (o.wrapperClass) {
    return `<article class="${esc(o.wrapperClass)}" data-mode="${modeState.name}">\n${inner}\n</article>`;
  }
  return inner;
}

function renderBlock(
  node: BlockNode,
  o: ResolvedHtmlRenderOptions,
  modeState: MarkdownModeState,
): string {
  const blockStateAttr = ` data-block-state="${modeState.getBlockState()}"`;
  switch (node.type) {
    case "document":
      return node.children.map((c) => renderBlock(c, o, modeState)).join("\n");

    case "paragraph":
      return `<p${blockStateAttr}>${renderInlines(node.children, o)}</p>`;

    case "heading": {
      const tag = `h${node.level}`;
      const id = node.id ? ` id="${esc(node.id)}"` : "";
      return `<${tag}${id}${blockStateAttr}>${renderInlines(node.children, o)}</${tag}>`;
    }

    case "blockquote":
      return `<blockquote${blockStateAttr}>\n${node.children.map((c) => renderBlock(c, o, modeState)).join("\n")}\n</blockquote>`;

    case "code_block": {
      const langClass = node.lang ? ` class="language-${esc(node.lang)}"` : "";
      const metaAttr = node.meta ? ` data-meta="${esc(node.meta)}"` : "";
      return `<pre${metaAttr}${blockStateAttr}><code${langClass}>${esc(node.value)}</code></pre>`;
    }

    case "unordered_list":
      return `<ul${blockStateAttr}>\n${node.children
        .map(
          (c) =>
            `<li${blockStateAttr}>${c.children.map((b) => renderBlock(b, o, modeState)).join("\n")}</li>`,
        )
        .join("\n")}\n</ul>`;

    case "ordered_list": {
      const start = node.start === 1 ? "" : ` start="${node.start}"`;
      return `<ol${start}${blockStateAttr}>\n${node.children
        .map(
          (c) =>
            `<li${blockStateAttr}>${c.children.map((b) => renderBlock(b, o, modeState)).join("\n")}</li>`,
        )
        .join("\n")}\n</ol>`;
    }

    case "task_list":
      return `<ul class="${o.classPrefix}-task-list"${blockStateAttr}>\n${node.children
        .map((item) => {
          const checked = item.checked ? " checked disabled" : " disabled";
          const inner = renderTaskItemContent(item.children, o, modeState);
          return `<li class="${o.classPrefix}-task-item"${blockStateAttr}><input type="checkbox"${checked} />${inner}</li>`;
        })
        .join("\n")}\n</ul>`;

    case "thematic_break":
      return `<hr${blockStateAttr} />`;

    case "table":
      return renderTable(node, o, modeState);

    case "callout": {
      const cls = `${o.classPrefix}-callout ${o.classPrefix}-callout-${node.kind}`;
      const title = node.title.length
        ? `<div class="${o.classPrefix}-callout-title">${renderInlines(node.title, o)}</div>\n`
        : "";
      const body = node.children
        .map((c) => renderBlock(c, o, modeState))
        .join("\n");
      return `<div class="${cls}"${blockStateAttr}>\n${title}${body}\n</div>`;
    }

    case "math_block":
      return `<div class="${o.classPrefix}-math-block"${blockStateAttr}>${esc(node.value)}</div>`;

    case "html_block":
      return o.sanitizeHtml ? `<!-- sanitized html block -->` : node.value;

    case "footnote_def": {
      const id = `fn-${esc(node.label)}`;
      const body = node.children
        .map((c) => renderBlock(c, o, modeState))
        .join("\n");
      return `<div id="${id}" class="${o.classPrefix}-footnote"${blockStateAttr}>\n<sup>${esc(node.label)}</sup>\n${body}\n</div>`;
    }

    case "definition_list": {
      const items = node.items
        .map(
          (item) =>
            `<dt>${renderInlines(item.term, o)}</dt>\n` +
            item.definitions
              .map((def) => `<dd>${renderInlines(def, o)}</dd>`)
              .join("\n"),
        )
        .join("\n");
      return `<dl${blockStateAttr}>\n${items}\n</dl>`;
    }

    case "toggle": {
      const summary = renderInlines(node.summary, o);
      const body = node.children
        .map((c) => renderBlock(c, o, modeState))
        .join("\n");
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
  return nodes.map((b) => renderBlock(b, o, modeState)).join("\n");
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

  const headCells = node.head.cells
    .map((c, i) => `<th${alignStyle(i)}>${renderInlines(c.children, o)}</th>`)
    .join("");

  const bodyRows = node.rows
    .map(
      (row) =>
        "<tr>" +
        row.cells
          .map(
            (c, i) =>
              `<td${alignStyle(i)}>${renderInlines(c.children, o)}</td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("\n");

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

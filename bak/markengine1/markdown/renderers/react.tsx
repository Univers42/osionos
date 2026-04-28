// React renderer — AST to React elements
import React from "react";
import type { BlockNode } from "../ast";
import { parse } from "../parser";
import { renderTable, renderInlines } from "./reactHelpers";
export { renderInlines };
import {
  resolveIndexedMarkdownMode,
  resolveMarkdownMode,
  type MarkdownModeResolver,
  type MarkdownModeState,
  type MarkdownViewMode,
} from "./renderMode";

/** Extract plain text from inline AST nodes (for stable React keys). */
function extractInlineText(nodes: readonly Record<string, unknown>[]): string {
  return nodes
    .map((n) => {
      if (typeof n.value === "string") return n.value;
      if (Array.isArray(n.children))
        return extractInlineText(n.children as Record<string, unknown>[]);
      if (typeof n.alt === "string") return n.alt;
      return "";
    })
    .join("");
}

export interface ReactRenderOptions {
  /** CSS class prefix (default: 'md') */
  classPrefix?: string;
  /** Rendering mode for source/live-preview/reading behavior */
  mode?: MarkdownViewMode;
  /** Optional mode map for mixed view per top-level block */
  blockModes?: MarkdownViewMode[];
  /** Optional resolver for per-block mixed mode */
  resolveBlockMode?: MarkdownModeResolver<BlockNode>;
  /** Open external links in new tab (default: true) */
  externalLinks?: boolean;
  /** Custom code block renderer (for syntax highlighting integrations) */
  codeBlockRenderer?: (
    lang: string,
    code: string,
    meta?: string,
  ) => React.ReactElement;
  /** Custom math renderer */
  mathRenderer?: (value: string, display: boolean) => React.ReactElement;
  /** Custom image renderer */
  imageRenderer?: (
    src: string,
    alt: string,
    title?: string,
  ) => React.ReactElement;
  /** Custom internal link renderer (for wiki-style [[page:id]] links) */
  internalLinkRenderer?: (pageId: string) => React.ReactNode;
  /** Callback for checkbox toggle in task lists */
  onTaskToggle?: (index: number, checked: boolean) => void;
}

const defaults: Required<
  Omit<
    ReactRenderOptions,
    | "codeBlockRenderer"
    | "mathRenderer"
    | "imageRenderer"
    | "internalLinkRenderer"
    | "onTaskToggle"
    | "blockModes"
    | "resolveBlockMode"
  >
> = {
  classPrefix: "md",
  mode: "reading",
  externalLinks: true,
};

export function renderReact(
  blocks: BlockNode[],
  opts?: ReactRenderOptions,
): React.ReactElement[] {
  const o = { ...defaults, ...opts };
  return blocks.map((block, index) => {
    const modeState = resolveIndexedMarkdownMode(
      o.mode,
      index,
      block,
      opts?.blockModes,
      opts?.resolveBlockMode,
    );
    return renderBlock(block, o, modeState, index);
  });
}

/**
 * Convenience component: parses markdown and renders it.
 */
export function MarkdownView({
  markdown,
  blocks,
  className,
  ...opts
}: {
  markdown?: string;
  blocks?: BlockNode[];
  className?: string;
} & ReactRenderOptions) {
  const ast = blocks ?? (markdown ? parse(markdown) : []);
  const elements = renderReact(ast, opts);
  const modeState = resolveMarkdownMode(opts.mode);
  return React.createElement(
    "div",
    {
      className: className ?? `${opts.classPrefix ?? "md"}-content`,
      "data-mode": modeState.name,
    },
    ...elements,
  );
}

let _taskIndex = 0;

function renderBlock(
  node: BlockNode,
  o: ReactRenderOptions & typeof defaults,
  modeState: MarkdownModeState,
  key: number | string,
): React.ReactElement {
  const blockState = modeState.getBlockState();
  switch (node.type) {
    case "document":
      return React.createElement(
        React.Fragment,
        { key },
        ...node.children.map((c, i) => renderBlock(c, o, modeState, i)),
      );

    case "paragraph":
      return React.createElement(
        "p",
        { key, "data-block-state": blockState },
        ...renderInlines(node.children, o),
      );

    case "heading": {
      const tag = `h${node.level}`;
      return React.createElement(
        tag,
        { key, id: node.id || undefined, "data-block-state": blockState },
        ...renderInlines(node.children, o),
      );
    }

    case "blockquote":
      return React.createElement(
        "blockquote",
        { key, "data-block-state": blockState },
        ...node.children.map((c, i) => renderBlock(c, o, modeState, i)),
      );

    case "code_block": {
      if (o.codeBlockRenderer && node.lang) {
        return React.createElement(
          React.Fragment,
          { key },
          o.codeBlockRenderer(node.lang, node.value, node.meta),
        );
      }
      const code = React.createElement(
        "code",
        {
          className: node.lang ? `language-${node.lang}` : undefined,
        },
        node.value,
      );
      return React.createElement(
        "pre",
        {
          key,
          "data-meta": node.meta || undefined,
          "data-block-state": blockState,
        },
        code,
      );
    }

    case "unordered_list": {
      const ulItems = node.children.map((item, idx) => ({
        item,
        key: `li-${idx}`,
      }));
      return React.createElement(
        "ul",
        { key },
        ...ulItems.map(({ item, key: liKey }) =>
          React.createElement(
            "li",
            { key: liKey, "data-block-state": blockState },
            ...item.children.map((b, j) => renderBlock(b, o, modeState, j)),
          ),
        ),
      );
    }

    case "ordered_list": {
      const olItems = node.children.map((item, idx) => ({
        item,
        key: `li-${idx}`,
      }));
      return React.createElement(
        "ol",
        { key, start: node.start === 1 ? undefined : node.start },
        ...olItems.map(({ item, key: liKey }) =>
          React.createElement(
            "li",
            { key: liKey, "data-block-state": blockState },
            ...item.children.map((b, j) => renderBlock(b, o, modeState, j)),
          ),
        ),
      );
    }

    case "task_list": {
      _taskIndex = 0;
      const taskItems = node.children.map((item, idx) => ({
        item,
        key: `task-${idx}`,
      }));
      return React.createElement(
        "ul",
        {
          key,
          className: `${o.classPrefix}-task-list`,
          "data-block-state": blockState,
        },
        ...taskItems.map(({ item, key: taskKey }) => {
          const idx = _taskIndex++;
          const checkbox = React.createElement("input", {
            type: "checkbox",
            checked: item.checked,
            onChange: o.onTaskToggle
              ? () => o.onTaskToggle?.(idx, !item.checked)
              : undefined,
            readOnly: !o.onTaskToggle,
            className: `${o.classPrefix}-task-checkbox`,
          });
          return React.createElement(
            "li",
            {
              key: taskKey,
              className: `${o.classPrefix}-task-item`,
              "data-block-state": blockState,
            },
            checkbox,
            ...item.children.map((b, j) => renderBlock(b, o, modeState, j)),
          );
        }),
      );
    }

    case "thematic_break":
      return React.createElement("hr", { key, "data-block-state": blockState });

    case "table":
      return renderTable(node, { ...o, blockState }, key);

    case "callout": {
      const cls = `${o.classPrefix}-callout ${o.classPrefix}-callout-${node.kind}`;
      const title = node.title.length
        ? React.createElement(
            "div",
            { className: `${o.classPrefix}-callout-title`, key: "title" },
            ...renderInlines(node.title, o),
          )
        : null;
      const body = node.children.map((c, i) => renderBlock(c, o, modeState, i));
      return React.createElement(
        "div",
        { key, className: cls, "data-block-state": blockState },
        title,
        ...body,
      );
    }

    case "math_block": {
      if (o.mathRenderer) {
        return React.createElement(
          React.Fragment,
          { key },
          o.mathRenderer(node.value, true),
        );
      }
      return React.createElement(
        "div",
        {
          key,
          className: `${o.classPrefix}-math-block`,
          "data-block-state": blockState,
        },
        node.value,
      );
    }

    case "html_block":
      return React.createElement("div", {
        key,
        "data-block-state": blockState,
        dangerouslySetInnerHTML: { __html: node.value },
      });

    case "footnote_def": {
      return React.createElement(
        "div",
        {
          key,
          id: `fn-${node.label}`,
          className: `${o.classPrefix}-footnote`,
          "data-block-state": blockState,
        },
        React.createElement("sup", null, node.label),
        ...node.children.map((c, i) => renderBlock(c, o, modeState, i)),
      );
    }

    case "definition_list":
      return React.createElement(
        "dl",
        { key, "data-block-state": blockState },
        ...node.items.flatMap((item) => {
          const termKey = extractInlineText(item.term) || crypto.randomUUID();
          return [
            React.createElement(
              "dt",
              { key: `dt-${termKey}` },
              ...renderInlines(item.term, o),
            ),
            ...item.definitions.map((def, j) =>
              React.createElement(
                "dd",
                { key: `dd-${termKey}-${j}` },
                ...renderInlines(def, o),
              ),
            ),
          ];
        }),
      );

    case "toggle": {
      const toggleChildren = node.children.map((c, idx) => ({
        c,
        key: `t-${idx}`,
      }));
      return React.createElement(
        "details",
        { key, "data-block-state": blockState },
        React.createElement("summary", null, ...renderInlines(node.summary, o)),
        ...toggleChildren.map(({ c, key: k }) =>
          renderBlock(c, o, modeState, k),
        ),
      );
    }

    default:
      return React.createElement(React.Fragment, { key });
  }
}

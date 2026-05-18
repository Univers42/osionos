/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadOnlyBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadOnlyBlock.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/20 12:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Block } from '@/entities/block';
import { getNumberedMarker, getBulletMarker } from '@/entities/block/model/listMarkers';
import { ChevronRight } from "lucide-react";
import { DatabaseBlock } from '@/widgets/database-view';
import { CalloutBlockReadOnly } from "./CalloutBlockReadOnly";
import { CodeBlockReadOnly } from "./CodeBlockReadOnly";
import { MediaBlockReadOnly } from "./MediaBlockReadOnly";
import { TableBlockReadOnly } from "./TableBlockReadOnly";
import { renderInlineToReact } from '@/shared/lib/markengine';
import { timed } from '@/shared/lib/perf/measure';
import { InternalPageLink } from "@/entities/page";

interface BlockProps {
  block: Block;
  index: number;
  bulletDepth?: number;
  numberedDepth?: number;
}

const INLINE_MARKDOWN_CACHE_LIMIT = 2000;
const inlineMarkdownCache = new Map<string, React.ReactNode>();

function renderInternalPageLink(pageId: string) {
  return <InternalPageLink pageId={pageId} />;
}

function renderCachedInlineMarkdown(content: string): React.ReactNode {
  const cached = inlineMarkdownCache.get(content);
  if (cached !== undefined) {
    inlineMarkdownCache.delete(content);
    inlineMarkdownCache.set(content, cached);
    return cached;
  }

  const rendered = timed("renderInlineToReact", () => renderInlineToReact(content, {
    internalLinkRenderer: renderInternalPageLink,
  }));
  inlineMarkdownCache.set(content, rendered);

  if (inlineMarkdownCache.size > INLINE_MARKDOWN_CACHE_LIMIT) {
    const oldestKey = inlineMarkdownCache.keys().next().value;
    if (oldestKey !== undefined) inlineMarkdownCache.delete(oldestKey);
  }

  return rendered;
}

const InlineMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    return renderCachedInlineMarkdown(content);
  }, [content]);

  return <>{renderedContent}</>;
};

function renderEquationToHtml(source: string): string {
  return katex.renderToString(source || "E = mc^2", {
    displayMode: true,
    throwOnError: false,
    strict: "ignore",
  });
}

function getNestedChildrenClassName(type: Block["type"]) {
  if (type === "bulleted_list" || type === "numbered_list") {
    return "ml-[3.25rem] mt-0.5";
  }

  if (type === "to_do") {
    return "ml-[2.75rem] mt-0.5";
  }

  if (type === "toggle") {
    return "ml-6 mt-0.5 pl-3 border-l-2 border-[var(--osio-border-default)]";
  }

  if (type === "column") {
    return "mt-0.5";
  }

  // Generic indentation for all other block types with children.
  return "ml-6 mt-0.5";
}

function renderNestedChildren(block: Block, bulletDepth: number, numberedDepth: number) {
  if (!block.children?.length) {
    return null;
  }

  const nextBulletDepth = block.type === "bulleted_list" ? bulletDepth + 1 : bulletDepth;
  const nextNumberedDepth = block.type === "numbered_list" ? numberedDepth + 1 : numberedDepth;

  return (
    <div className={getNestedChildrenClassName(block.type)}>
      {block.children.map((child, index) => (
        <ReadOnlyBlock
          key={child.id}
          block={child}
          index={index}
          bulletDepth={nextBulletDepth}
          numberedDepth={nextNumberedDepth}
        />
      ))}
    </div>
  );
}

function areReadOnlyBlockPropsEqual(previous: BlockProps, next: BlockProps): boolean {
  return (
    previous.block === next.block &&
    previous.index === next.index &&
    (previous.bulletDepth ?? 0) === (next.bulletDepth ?? 0) &&
    (previous.numberedDepth ?? 0) === (next.numberedDepth ?? 0)
  );
}

const ReadOnlyBlockImpl: React.FC<BlockProps> = ({ block, index, bulletDepth = 0, numberedDepth = 0 }) => {
  switch (block.type) {
    case "paragraph":
      return (
        <>
          {block.content ? (
            <p className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 min-h-[1.5em]">
              <InlineMarkdown content={block.content} />
            </p>
          ) : (
            <p className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 min-h-[1.5em]">
              <span className="text-[var(--osio-fg-subtle)]">&nbsp;</span>
            </p>
          )}
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_1":
      return (
        <>
          <h1 className="text-2xl font-bold text-[var(--osio-fg-default)] mt-6 mb-1 leading-tight">
            <InlineMarkdown content={block.content} />
          </h1>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_2":
      return (
        <>
          <h2 className="text-xl font-semibold text-[var(--osio-fg-default)] mt-5 mb-1 leading-tight">
            <InlineMarkdown content={block.content} />
          </h2>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_3":
      return (
        <>
          <h3 className="text-lg font-semibold text-[var(--osio-fg-default)] mt-4 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h3>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_4":
      return (
        <>
          <h4 className="text-base font-semibold text-[var(--osio-fg-default)] mt-3 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h4>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_5":
      return (
        <>
          <h5 className="text-sm font-semibold text-[var(--osio-fg-default)] mt-2 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h5>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "heading_6":
      return (
        <>
          <h6 className="text-xs font-semibold text-[var(--osio-fg-muted)] mt-2 mb-0.5 leading-snug uppercase tracking-wide">
            <InlineMarkdown content={block.content} />
          </h6>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "bulleted_list": {
      const bulletStyle = getBulletMarker(bulletDepth);
      return (
        <>
          <div className="flex items-start gap-2 pl-5">
            <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-6 text-center">
              {bulletStyle === "disc" && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--osio-fg-subtle)] mt-[7px]" />
              )}
              {bulletStyle === "circle" && (
                <span className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--osio-fg-subtle)] mt-[7px]" />
              )}
              {bulletStyle === "square" && (
                <span className="inline-block w-1.5 h-1.5 bg-[var(--osio-fg-subtle)] mt-[7px]" />
              )}
            </span>
            <span className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );
    }

    case "numbered_list":
      return (
        <>
          <div className="flex items-start gap-2 pl-5">
            <span className="text-sm leading-relaxed py-0.5 text-[var(--osio-fg-muted)] select-none shrink-0 w-6 text-center font-medium">
              {getNumberedMarker(index + 1, numberedDepth)}
            </span>
            <span className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "to_do":
      return (
        <>
          <div className="flex items-start gap-2 pl-5">
            <span
              className={[
                "shrink-0 mt-[3px] w-4 h-4 rounded border flex items-center justify-center",
                block.checked
                  ? "bg-[var(--osio-accent)] border-[var(--osio-accent)] text-[var(--osio-accent-fg)]"
                  : "border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]",
              ].join(" ")}
            >
              {block.checked && (
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 8l2.5 2.5L12 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span
              className={[
                "text-sm leading-relaxed py-0.5 flex-1",
                block.checked
                  ? "text-[var(--osio-fg-muted)] line-through"
                  : "text-[var(--osio-fg-default)]",
              ].join(" ")}
            >
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "code":
      return <CodeBlockReadOnly block={block} />;

    case "equation":
      return (
        <div
          className="my-2 overflow-x-auto rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3 text-[var(--osio-fg-default)]"
          dangerouslySetInnerHTML={{ __html: renderEquationToHtml(block.content) }}
        />
      );

    case "column_list":
      return (
        <div className="my-2 flex gap-3">
          {(block.children ?? []).map((column) => (
            <div
              key={column.id}
              className="min-w-0"
              style={{
                flexGrow:
                  typeof column.widthRatio === "number"
                    ? column.widthRatio
                    : 1 / Math.max(block.children?.length ?? 1, 1),
                flexBasis: 0,
              }}
            >
              {(column.children ?? []).map((child, childIndex) => (
                <ReadOnlyBlock key={child.id} block={child} index={childIndex} bulletDepth={bulletDepth} numberedDepth={numberedDepth} />
              ))}
            </div>
          ))}
        </div>
      );

    case "column":
      return renderNestedChildren(block, bulletDepth, numberedDepth);

    case "image":
    case "video":
    case "audio":
    case "file":
      return <MediaBlockReadOnly block={block} />;

    case "quote":
      return (
        <>
          <div className="flex my-0.5">
            <div className="w-1 bg-[var(--osio-fg-default)] rounded-full shrink-0 mr-3" />
            <span className="text-sm text-[var(--osio-fg-muted)] leading-relaxed py-0.5 italic flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "callout":
      return (
        <>
          <CalloutBlockReadOnly block={block} />
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );

    case "divider":
      return (
        <div className="py-2">
          <hr className="w-full h-px border-0 bg-[var(--osio-fg-subtle)]" />
        </div>
      );

    case "table_block":
      return <TableBlockReadOnly block={block} />;

    case "database_inline":
      return (
        <DatabaseBlock
          databaseId={block.databaseId}
          initialViewId={block.viewId}
          mode="inline"
        />
      );

    case "database_full_page":
      return (
        <div className="my-3 min-h-[520px] overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
          <DatabaseBlock
            databaseId={block.databaseId}
            initialViewId={block.viewId}
            mode="full"
          />
        </div>
      );

    case "toggle":
      return <ToggleBlockReadOnly block={block} bulletDepth={bulletDepth} numberedDepth={numberedDepth} />;

    default:
      return (
        <>
          <p className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5">
            {block.content}
          </p>
          {renderNestedChildren(block, bulletDepth, numberedDepth)}
        </>
      );
  }
};

export const ReadOnlyBlock = React.memo(ReadOnlyBlockImpl, areReadOnlyBlockPropsEqual);

/**
 * Toggle read-only: renders summary + chevron.
 * Children use the same renderNestedChildren path as all other block types.
 * Local expanded state controls visibility (read-only has no store mutation).
 */
const ToggleBlockReadOnly: React.FC<{ block: Block; bulletDepth: number; numberedDepth: number }> = ({ block, bulletDepth, numberedDepth }) => {
  const [expanded, setExpanded] = useState(!block.collapsed);

  return (
    <div className="pl-0.5">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className="shrink-0 mt-[3px] w-5 h-5 rounded hover:bg-[var(--osio-bg-hover)] flex items-center justify-center"
        >
          <ChevronRight
            size={14}
            className={[
              "text-[var(--osio-fg-muted)] transition-transform duration-150",
              expanded ? "rotate-90" : "",
            ].join(" ")}
          />
        </button>
        <button
          type="button"
          className="text-sm text-[var(--osio-fg-default)] leading-relaxed py-0.5 flex-1 cursor-pointer select-none text-left"
          onClick={() => setExpanded((o) => !o)}
        >
          <InlineMarkdown content={block.content} />
        </button>
      </div>
      {expanded && renderNestedChildren(block, bulletDepth, numberedDepth)}
      {expanded && !block.children?.length && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--osio-border-default)]">
          <span className="text-xs text-[var(--osio-fg-subtle)] py-1 italic">
            Empty toggle
          </span>
        </div>
      )}
    </div>
  );
};


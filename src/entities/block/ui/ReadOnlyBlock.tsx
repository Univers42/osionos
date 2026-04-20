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
import type { Block } from '@/entities/block';
import { ChevronRight } from "lucide-react";
import { DatabaseBlock } from '@/widgets/database-view';
import { CalloutBlockReadOnly } from "./CalloutBlockReadOnly";
import { CodeBlockReadOnly } from "./CodeBlockReadOnly";
import { MediaBlockReadOnly } from "./MediaBlockReadOnly";
import { renderInlineToReact } from '@/shared/lib/markengine';
import { InternalPageLink } from "@/entities/page";

interface BlockProps {
  block: Block;
  index: number;
}

const InlineMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null;
    return renderInlineToReact(content, {
      internalLinkRenderer: (pageId: string) => <InternalPageLink pageId={pageId} />,
    });
  }, [content]);

  return <>{renderedContent}</>;
};

function getNestedChildrenClassName(type: Block["type"]) {
  if (type === "bulleted_list" || type === "numbered_list") {
    return "ml-[3.25rem] mt-0.5";
  }

  if (type === "to_do") {
    return "ml-[2.75rem] mt-0.5";
  }

  if (type === "toggle") {
    return "ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]";
  }

  // Generic indentation for all other block types with children.
  return "ml-6 mt-0.5";
}

function renderNestedChildren(block: Block) {
  if (!block.children?.length) {
    return null;
  }

  return (
    <div className={getNestedChildrenClassName(block.type)}>
      {block.children.map((child, index) => (
        <ReadOnlyBlock key={child.id} block={child} index={index} />
      ))}
    </div>
  );
}

export const ReadOnlyBlock: React.FC<BlockProps> = ({ block, index }) => {
  switch (block.type) {
    case "paragraph":
      return (
        <>
          {block.content ? (
            <p className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 min-h-[1.5em]">
              <InlineMarkdown content={block.content} />
            </p>
          ) : (
            <p className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 min-h-[1.5em]">
              <span className="text-[var(--color-ink-faint)]">&nbsp;</span>
            </p>
          )}
          {renderNestedChildren(block)}
        </>
      );

    case "heading_1":
      return (
        <>
          <h1 className="text-2xl font-bold text-[var(--color-ink)] mt-6 mb-1 leading-tight">
            <InlineMarkdown content={block.content} />
          </h1>
          {renderNestedChildren(block)}
        </>
      );

    case "heading_2":
      return (
        <>
          <h2 className="text-xl font-semibold text-[var(--color-ink)] mt-5 mb-1 leading-tight">
            <InlineMarkdown content={block.content} />
          </h2>
          {renderNestedChildren(block)}
        </>
      );

    case "heading_3":
      return (
        <>
          <h3 className="text-lg font-semibold text-[var(--color-ink)] mt-4 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h3>
          {renderNestedChildren(block)}
        </>
      );

    case "heading_4":
      return (
        <>
          <h4 className="text-base font-semibold text-[var(--color-ink)] mt-3 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h4>
          {renderNestedChildren(block)}
        </>
      );

    case "heading_5":
      return (
        <>
          <h5 className="text-sm font-semibold text-[var(--color-ink)] mt-2 mb-0.5 leading-snug">
            <InlineMarkdown content={block.content} />
          </h5>
          {renderNestedChildren(block)}
        </>
      );

    case "heading_6":
      return (
        <>
          <h6 className="text-xs font-semibold text-[var(--color-ink-muted)] mt-2 mb-0.5 leading-snug uppercase tracking-wide">
            <InlineMarkdown content={block.content} />
          </h6>
          {renderNestedChildren(block)}
        </>
      );

    case "bulleted_list":
      return (
        <>
          <div className="flex items-start gap-2 pl-5">
            <span className="text-sm leading-relaxed py-0.5 select-none shrink-0 w-6 text-center">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-faint)] mt-[7px]" />
            </span>
            <span className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block)}
        </>
      );

    case "numbered_list":
      return (
        <>
          <div className="flex items-start gap-2 pl-5">
            <span className="text-sm leading-relaxed py-0.5 text-[var(--color-ink-muted)] select-none shrink-0 w-6 text-center font-medium">
              {index + 1}.
            </span>
            <span className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block)}
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
                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-surface-primary)]",
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
                  ? "text-[var(--color-ink-muted)] line-through"
                  : "text-[var(--color-ink)]",
              ].join(" ")}
            >
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block)}
        </>
      );

    case "code":
      return <CodeBlockReadOnly block={block} />;

    case "image":
    case "video":
    case "audio":
    case "file":
      return <MediaBlockReadOnly block={block} />;

    case "quote":
      return (
        <>
          <div className="flex my-0.5">
            <div className="w-1 bg-[var(--color-ink)] rounded-full shrink-0 mr-3" />
            <span className="text-sm text-[var(--color-ink-muted)] leading-relaxed py-0.5 italic flex-1">
              <InlineMarkdown content={block.content} />
            </span>
          </div>
          {renderNestedChildren(block)}
        </>
      );

    case "callout":
      return (
        <>
          <CalloutBlockReadOnly block={block} />
          {renderNestedChildren(block)}
        </>
      );

    case "divider":
      return (
        <div className="py-2">
          <hr className="w-full h-px border-0 bg-[var(--color-ink-faint)]" />
        </div>
      );

    case "table_block":
      return <TableBlockReadOnly block={block} />;

    case "database_inline":
    case "database_full_page":
      return (
        <DatabaseBlock
          databaseId={block.databaseId}
          initialViewId={block.viewId}
          mode="inline"
        />
      );

    case "toggle":
      return <ToggleBlockReadOnly block={block} />;

    default:
      return (
        <>
          <p className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5">
            {block.content}
          </p>
          {renderNestedChildren(block)}
        </>
      );
  }
};

/**
 * Toggle read-only: renders summary + chevron.
 * Children use the same renderNestedChildren path as all other block types.
 * Local expanded state controls visibility (read-only has no store mutation).
 */
const ToggleBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const [expanded, setExpanded] = useState(!block.collapsed);

  return (
    <div className="pl-0.5">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setExpanded((o) => !o)}
          className="shrink-0 mt-[3px] w-5 h-5 rounded hover:bg-[var(--color-surface-hover)] flex items-center justify-center"
        >
          <ChevronRight
            size={14}
            className={[
              "text-[var(--color-ink-muted)] transition-transform duration-150",
              expanded ? "rotate-90" : "",
            ].join(" ")}
          />
        </button>
        <button
          type="button"
          className="text-sm text-[var(--color-ink)] leading-relaxed py-0.5 flex-1 cursor-pointer select-none text-left"
          onClick={() => setExpanded((o) => !o)}
        >
          <InlineMarkdown content={block.content} />
        </button>
      </div>
      {expanded && renderNestedChildren(block)}
      {expanded && !block.children?.length && (
        <div className="ml-6 mt-0.5 pl-3 border-l-2 border-[var(--color-line)]">
          <span className="text-xs text-[var(--color-ink-faint)] py-1 italic">
            Empty toggle
          </span>
        </div>
      )}
    </div>
  );
};

const TableBlockReadOnly: React.FC<{ block: Block }> = ({ block }) => {
  const data = block.tableData ?? [];
  if (!data.length) {
    return (
      <div className="my-2 rounded border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-faint)]">
        Empty table
      </div>
    );
  }

  return (
    <div className="my-2 border border-[var(--color-line)] rounded-lg overflow-auto">
      <table className="w-max min-w-full text-sm">
        <tbody>
          {data.map((row, ri) => (
            <tr
              key={`row-${row.join("¦")}`}
              className={
                ri === 0
                  ? "bg-[var(--color-surface-secondary)] font-medium"
                  : ""
              }
            >
              {row.map((cell, ci) => (
                <td
                  key={`cell-${ri}-${ci}`}
                  className="border-b border-r border-[var(--color-line)] last:border-r-0 px-3 py-1.5 min-w-[120px] text-[var(--color-ink)]"
                >
                  <InlineMarkdown content={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

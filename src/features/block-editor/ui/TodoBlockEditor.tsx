/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TodoBlockEditor.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 21:45:39 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from "react";

import { EditableContent } from "@/components/blocks/EditableContent";
import { getBlockPlaceholder, type Block } from "@/entities/block";

import { usePageStore } from "@/store/usePageStore";
import { isTasksEnabled } from "@/shared/config/featureFlags";
import { BlockListCollapse } from "./BlockListCollapse";
import { TodoDueDate } from "./TodoDueDate";

export const TodoBlockEditor: React.FC<{
  block: Block;
  pageId: string;
  style?: React.CSSProperties;
  onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onRequestSlashMenu?: (position: { x: number; y: number; top: number }) => void;
}> = ({ block, pageId, style, onUpdateBlock, onChange, onKeyDown, onRequestSlashMenu }) => {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const page = usePageStore((s) => s.activePage);

  const toggleChecked = useCallback(() => {
    if (onUpdateBlock) {
      onUpdateBlock(block.id, { checked: !block.checked });
      return;
    }

    if (!page) return;
    updateBlock(page.id, block.id, { checked: !block.checked });
  }, [page, block.id, block.checked, onUpdateBlock, updateBlock]);

  const setDueAt = useCallback((dueAt: string | undefined) => {
    if (onUpdateBlock) { onUpdateBlock(block.id, { dueAt }); return; }
    if (!page) return;
    updateBlock(page.id, block.id, { dueAt });
  }, [page, block.id, onUpdateBlock, updateBlock]);

  return (
    <div className="group relative flex items-start gap-2 pl-5">
      {block.children?.length ? (
        <BlockListCollapse
          collapsed={block.collapsed}
          onToggle={() =>
            (onUpdateBlock ?? ((id, u) => page && updateBlock(page.id, id, u)))(block.id, {
              collapsed: !block.collapsed,
            })
          }
        />
      ) : null}
      <button
        type="button"
        data-testid="todo-checkbox"
        aria-pressed={block.checked}
        aria-label={block.checked ? "Mark to-do as not done" : "Mark to-do as done"}
        onClick={toggleChecked}
        className={[
          "shrink-0 mt-[3px] w-4 h-4 rounded border flex items-center justify-center cursor-pointer",
          block.checked
            ? "bg-[var(--osio-accent)] border-[var(--osio-accent)] text-[var(--osio-accent-fg)]"
            : "border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] hover:border-[var(--osio-fg-muted)]",
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
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-1">
        <EditableContent
          content={block.content}
          className={[
            "min-w-0 flex-1 text-sm leading-relaxed py-0.5",
            block.checked
              ? "text-[var(--osio-fg-muted)] line-through"
              : "text-[var(--osio-fg-default)]",
          ].join(" ")}
          style={style}
          placeholder={getBlockPlaceholder(block, "To-do")}
          pageId={pageId}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onRequestSlashMenu={onRequestSlashMenu}
        />
        {isTasksEnabled() && <TodoDueDate dueAt={block.dueAt} checked={block.checked} onChange={setDueAt} />}
      </div>
    </div>
  );
};

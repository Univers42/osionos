import React, { useCallback } from "react";
import { Plus } from "lucide-react";

import type { Block } from "@/entities/block";

import { appendBlockToColumn } from "../model/columnLayout";

interface ColumnAppendZoneProps {
	column: Block;
	rootBlocks: Block[];
	updateContent: (blocks: Block[]) => void;
	focusBlock: (blockId: string, cursorEnd?: boolean) => void;
}

/**
 * The Notion "continue writing at the bottom of THIS column" affordance: a
 * slim click zone under each column's last block. Click focuses the trailing
 * empty paragraph when one exists (never stacks empties), else appends one to
 * this column. Reveals a faint + hint on hover; invisible otherwise so the
 * split reads as clean whitespace.
 */
export const ColumnAppendZone: React.FC<ColumnAppendZoneProps> = ({ column, rootBlocks, updateContent, focusBlock }) => {
	const handleClick = useCallback(() => {
		const last = column.children?.at(-1);
		if (last && last.type === "paragraph" && !(last.content ?? "").trim()) {
			focusBlock(last.id);
			return;
		}
		const newBlock: Block = { id: crypto.randomUUID(), type: "paragraph", content: "" };
		updateContent(appendBlockToColumn(rootBlocks, column.id, newBlock));
		focusBlock(newBlock.id);
	}, [column, rootBlocks, updateContent, focusBlock]);
	return (
		<button
			type="button"
			data-testid="column-append-zone"
			aria-label="Add a block to this column"
			className="group/colappend flex h-6 w-full cursor-text items-center justify-start rounded-md px-1 text-[var(--osio-fg-subtle)] opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
			onClick={handleClick}
		>
			<Plus size={12} aria-hidden />
		</button>
	);
};

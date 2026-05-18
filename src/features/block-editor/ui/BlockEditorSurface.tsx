/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockEditorSurface.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";

import type { Block } from "@/entities/block";
import { isParentable, selfRendersChildren } from "@/entities/block";
import {
	estimateBlockHeight,
	ROOT_BLOCK_VIRTUALIZATION_OVERSCAN,
	ROOT_BLOCK_VIRTUALIZATION_THRESHOLD,
} from "@/entities/block/model/blockVirtualization";
import { ReadOnlyBlock } from "@/entities/block/ui/ReadOnlyBlock";
import { SlashCommandMenu } from "@/features/slash-commands";
import {
	usePlaygroundBlockEditor,
	type PlaygroundBlockEditorSource,
} from "@/features/block-editor/model/usePlaygroundBlockEditor";
import { BlockContextMenu } from "./BlockContextMenu";
import { PageSelectorMenu } from "./PageSelectorMenu";
import { getBlockSurfaceStyle } from "../model/blockColors";
import { VIRTUAL_BLOCK_FOCUS_EVENT } from "../model/blockDomFocus";
import { commitBlockDraft, useBlockDraftContent } from "../model/blockDraftStore";

type DropPosition = "above" | "below" | "inside" | "left" | "right" | null;
const DND_TYPE = "application/x-playground-block-id";
const DND_PAYLOAD_TYPE = "application/x-playground-block-payload";
const EMPTY_BLOCKS: Block[] = [];

interface BlockDragPayload {
	blockId: string;
	sourceKey: string;
	block: Block;
}

interface SurfaceRegistryEntry {
	getContent: () => Block[];
	updateContent: (blocks: Block[]) => void;
}

const surfaceRegistry = new Map<string, SurfaceRegistryEntry>();

interface DropIntent {
	position: Exclude<DropPosition, null>;
	targetParentBlockId: string | null;
	targetIndex: number;
}

interface SelectionPoint {
	x: number;
	y: number;
}

interface SelectionRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface SurfaceBlockEditorProps {
	pageId: string;
	block: Block;
	numberedIndex: number;
	numberedDepth: number;
	bulletDepth: number;
	isSelected?: boolean;
	onChange: (text: string) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onPaste?: (e: React.ClipboardEvent) => void;
	onDeleteCodeBlock?: () => void;
	onUpdateBlock?: (blockId: string, updates: Partial<Block>) => void;
	onBeforeStructuralEdit?: () => void;
	onRequestSlashMenu?: (position: { x: number; y: number }) => void;
	renderChildren?: () => React.ReactNode;
	focusBlock: (blockId: string, cursorEnd?: boolean) => void;
}

interface BlockEditorSurfaceProps {
	pageId: string;
	source?: PlaygroundBlockEditorSource;
	locked?: boolean;
	compact?: boolean;
	className?: string;
	emptyPlaceholder?: string;
	renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

type EditorSurfaceSource =
	| { kind: "page"; pageId: string }
	| { kind: "cell"; pageId: string; layoutBlockId: string; cellId: string };

function createSelectionRect(start: SelectionPoint, end: SelectionPoint): SelectionRect {
	const left = Math.min(start.x, end.x);
	const top = Math.min(start.y, end.y);
	return {
		left,
		top,
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y),
	};
}

function rectsIntersect(rect: SelectionRect, target: DOMRect): boolean {
	return !(
		rect.left + rect.width < target.left ||
		rect.left > target.right ||
		rect.top + rect.height < target.top ||
		rect.top > target.bottom
	);
}

function isInteractiveSelectionTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return true;
	return Boolean(
		target.closest(
			'button, input, textarea, select, a, [contenteditable="true"], [data-column-resize-handle], [data-layout-cell-handle], [data-table-handle]',
		),
	);
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
	if (left.size !== right.size) return false;
	for (const value of left) {
		if (!right.has(value)) return false;
	}
	return true;
}

function shouldRenderChildren(block: Block): boolean {
	if (!block.children?.length) return false;
	if (selfRendersChildren(block.type)) return false;
	if (block.type === "toggle" && block.collapsed) return false;
	return true;
}

function getNestedTreeClassName(parentBlockType: Block["type"] | null, isRoot: boolean) {
	if (isRoot || !parentBlockType) return "";
	if (parentBlockType === "bulleted_list" || parentBlockType === "numbered_list") return "ml-[3.25rem] mt-0.5";
	if (parentBlockType === "to_do") return "ml-[2.75rem] mt-0.5";
	if (parentBlockType === "toggle") return "ml-6 mt-0.5 pl-3 border-l-2 border-[var(--osio-border-default)]";
	if (parentBlockType === "column") return "mt-0.5";
	return "ml-6 mt-0.5";
}

function findBlockById(blocks: Block[], blockId: string): Block | null {
	for (const block of blocks) {
		if (block.id === blockId) return block;
		const nestedBlock = block.children?.length ? findBlockById(block.children, blockId) : null;
		if (nestedBlock) return nestedBlock;
	}
	return null;
}

function blockContainsBlock(block: Block, candidateId: string): boolean {
	return Boolean(block.children?.some((child) => child.id === candidateId || blockContainsBlock(child, candidateId)));
}

function blockContainsBlockOrSelf(block: Block, candidateId: string): boolean {
	return block.id === candidateId || blockContainsBlock(block, candidateId);
}

function cloneBlock(block: Block): Block {
	return { ...block, children: block.children?.map(cloneBlock) };
}

function removeBlockById(blocks: Block[], blockId: string): { blocks: Block[]; removed: Block | null } {
	let removed: Block | null = null;
	const next: Block[] = [];

	for (const block of blocks) {
		if (block.id === blockId) {
			removed = cloneBlock(block);
			continue;
		}

		const childResult = block.children?.length ? removeBlockById(block.children, blockId) : null;
		if (childResult?.removed) {
			removed = childResult.removed;
			next.push({ ...cloneBlock(block), children: childResult.blocks });
		} else {
			next.push(cloneBlock(block));
		}
	}

	return { blocks: next, removed };
}

function createColumn(children: Block[]): Block {
	return {
		id: crypto.randomUUID(),
		type: "column",
		content: "",
		widthRatio: 0.5,
		children,
	};
}

function normalizeColumnRatio(column: Block, columnCount: number): number {
	return typeof column.widthRatio === "number" && Number.isFinite(column.widthRatio)
		? Math.max(0.08, column.widthRatio)
		: 1 / Math.max(columnCount, 1);
}

function updateColumnRatiosInTree(
	blocks: Block[],
	columnListId: string,
	leftColumnId: string,
	rightColumnId: string,
	leftRatio: number,
	rightRatio: number,
): Block[] {
	return blocks.map((block) => {
		if (block.id === columnListId) {
			return {
				...block,
				children: block.children?.map((column) => {
					if (column.id === leftColumnId) return { ...column, widthRatio: leftRatio };
					if (column.id === rightColumnId) return { ...column, widthRatio: rightRatio };
					return column;
				}),
			};
		}

		return {
			...block,
			children: block.children
				? updateColumnRatiosInTree(block.children, columnListId, leftColumnId, rightColumnId, leftRatio, rightRatio)
				: undefined,
		};
	});
}

function wrapTargetInColumns(blocks: Block[], targetId: string, draggedBlock: Block, side: "left" | "right"): Block[] {
	return blocks.map((block) => {
		if (block.id === targetId) {
			const targetColumn = createColumn([cloneBlock(block)]);
			const draggedColumn = createColumn([draggedBlock]);
			return {
				id: crypto.randomUUID(),
				type: "column_list",
				content: "",
				children: side === "left" ? [draggedColumn, targetColumn] : [targetColumn, draggedColumn],
			};
		}
		return block.children?.length
			? { ...cloneBlock(block), children: wrapTargetInColumns(block.children, targetId, draggedBlock, side) }
			: cloneBlock(block);
	});
}

function splitBlocksIntoColumns(blocks: Block[], draggedId: string, targetId: string, side: "left" | "right"): Block[] {
	const withoutDragged = removeBlockById(blocks, draggedId);
	if (!withoutDragged.removed) return blocks;
	return wrapTargetInColumns(withoutDragged.blocks, targetId, withoutDragged.removed, side);
}

function insertBlockIntoEditorTree(
	blocks: Block[],
	draggedBlock: Block,
	targetParentBlockId: string | null,
	targetIndex: number,
): Block[] {
	const nextBlocks = blocks.map(cloneBlock);
	const insertionIndex = (length: number) => Math.max(0, Math.min(targetIndex, length));

	if (!targetParentBlockId) {
		nextBlocks.splice(insertionIndex(nextBlocks.length), 0, cloneBlock(draggedBlock));
		return nextBlocks;
	}

	const insertInParent = (list: Block[]): boolean => {
		for (const block of list) {
			if (block.id === targetParentBlockId) {
				block.children = block.children ?? [];
				block.children.splice(insertionIndex(block.children.length), 0, cloneBlock(draggedBlock));
				return true;
			}
			if (block.children && insertInParent(block.children)) return true;
		}
		return false;
	};

	if (!insertInParent(nextBlocks)) nextBlocks.splice(insertionIndex(nextBlocks.length), 0, cloneBlock(draggedBlock));
	return nextBlocks;
}

function insertExternalBlockByDropIntent(
	blocks: Block[],
	draggedBlock: Block,
	targetBlockId: string,
	intent: DropIntent,
): Block[] {
	if (intent.position === "left" || intent.position === "right") {
		return wrapTargetInColumns(blocks, targetBlockId, cloneBlock(draggedBlock), intent.position);
	}

	return insertBlockIntoEditorTree(blocks, draggedBlock, intent.targetParentBlockId, intent.targetIndex);
}

function readDragPayload(dataTransfer: DataTransfer): BlockDragPayload | null {
	try {
		const rawPayload = dataTransfer.getData(DND_PAYLOAD_TYPE);
		if (!rawPayload) return null;
		const payload = JSON.parse(rawPayload) as Partial<BlockDragPayload>;
		if (
			typeof payload.blockId === "string" &&
			typeof payload.sourceKey === "string" &&
			payload.block &&
			typeof payload.block.id === "string"
		) {
			return payload as BlockDragPayload;
		}
	} catch {
		return null;
	}
	return null;
}

function getDropIntent(
	block: Block,
	blocks: Block[],
	parentBlockId: string | null,
	clientX: number,
	clientY: number,
	rect: DOMRect,
): DropIntent | null {
	const targetIdx = blocks.findIndex((candidate) => candidate.id === block.id);
	if (targetIdx < 0) return null;

	const height = Math.max(rect.height, 1);
	const width = Math.max(rect.width, 1);
	const relativeY = (clientY - rect.top) / height;
	const relativeX = (clientX - rect.left) / width;
	const horizontalIndentIntent = clientX > rect.left + Math.min(96, rect.width * 0.28);

	if (width > 220 && relativeY > 0.15 && relativeY < 0.85) {
		if (relativeX < 0.14) return { position: "left", targetParentBlockId: parentBlockId, targetIndex: targetIdx };
		if (relativeX > 0.86) return { position: "right", targetParentBlockId: parentBlockId, targetIndex: targetIdx + 1 };
	}

	if (isParentable(block.type) && horizontalIndentIntent && relativeY > 0.2) {
		return { position: "inside", targetParentBlockId: block.id, targetIndex: block.children?.length ?? 0 };
	}

	if (relativeY < 0.5) return { position: "above", targetParentBlockId: parentBlockId, targetIndex: targetIdx };
	return { position: "below", targetParentBlockId: parentBlockId, targetIndex: targetIdx + 1 };
}

function getHighlightedRootBlockId(blocks: Block[], focusedBlockId: string | null): string | null {
	if (!focusedBlockId) return null;
	return findBlockById(blocks, focusedBlockId)?.id ?? null;
}

function getDropIndicatorClassName(position: Exclude<DropPosition, null>) {
	switch (position) {
		case "above": return "h-0.5 -top-px left-0 right-0";
		case "below": return "h-0.5 -bottom-px left-0 right-0";
		case "inside": return "h-0.5 -bottom-px left-6 right-0";
		case "left": return "left-0 top-1 bottom-1 w-0.5";
		case "right": return "right-0 top-1 bottom-1 w-0.5";
	}
}

function resolveScrollElement(root: HTMLElement | null): HTMLElement | null {
	return root?.closest<HTMLElement>(".osionos-page") ?? null;
}

function measureScrollMargin(root: HTMLElement, scrollElement: HTMLElement): number {
	const rootRect = root.getBoundingClientRect();
	const scrollRect = scrollElement.getBoundingClientRect();
	return Math.max(0, rootRect.top - scrollRect.top + scrollElement.scrollTop);
}

function getVirtualFocusBlockId(event: Event): string | null {
	const detail = (event as CustomEvent<{ blockId?: unknown }>).detail;
	return typeof detail?.blockId === "string" ? detail.blockId : null;
}

export const BlockEditorSurface: React.FC<BlockEditorSurfaceProps> = ({
	pageId,
	source,
	locked = false,
	compact = false,
	className = "",
	emptyPlaceholder = "Click here to start writing...",
	renderBlockEditor,
}) => {
	const {
		slashMenu,
		setSlashMenu,
		pageSelector,
		setPageSelector,
		contextMenu,
		contextMenuSections,
		openContextMenu,
		closeContextMenu,
		handleBlockChange,
		handleKeyDown,
		handlePaste,
		handleSlashSelect,
		handleSlashTurnIntoSelect,
		handleSlashDatabaseViewSelect,
		handleSlashMediaSelect,
		handleSlashCreatePageSelect,
		handleSlashInlineSelect,
		handlePageSelectorSelect,
		handlePageSelectorCreate,
		handleAddBlock,
		handleInitBlock,
		registerBlockRef,
		focusBlock,
		content: blocks,
		source: resolvedSource,
		sourceKey,
		updateBlock,
		deleteBlock,
		updateContent,
		moveBlock,
		moveBlockAcrossTree,
		pushSnapshot,
		flushPendingDrafts,
	} = usePlaygroundBlockEditor(source ?? pageId);
	const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
	const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
	const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
	const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
	const selectionRootRef = useRef<HTMLDivElement | null>(null);
	const selectionStartRef = useRef<SelectionPoint | null>(null);
	const blocksRef = useRef<Block[]>(blocks);
	const highlightedRootBlockId = useMemo(() => getHighlightedRootBlockId(blocks, focusedBlockId), [blocks, focusedBlockId]);

	useEffect(() => {
		blocksRef.current = blocks;
	}, [blocks]);

	useEffect(() => {
		const entry: SurfaceRegistryEntry = {
			getContent: () => flushPendingDrafts("structural"),
			updateContent,
		};
		surfaceRegistry.set(sourceKey, entry);
		return () => {
			if (surfaceRegistry.get(sourceKey) === entry) surfaceRegistry.delete(sourceKey);
		};
	}, [flushPendingDrafts, sourceKey, updateContent]);

	useEffect(() => {
		const syncFocusedBlock = () => {
			const activeElement = document.activeElement as HTMLElement | null;
			const activeBlockId = activeElement?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ?? null;
			setFocusedBlockId(activeBlockId);
		};

		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as HTMLElement | null;
			const blockId = target?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ?? null;
			setFocusedBlockId(blockId);
		};

		const handleFocusOut = () => globalThis.setTimeout(syncFocusedBlock, 0);
		document.addEventListener("focusin", handleFocusIn);
		document.addEventListener("focusout", handleFocusOut);
		return () => {
			document.removeEventListener("focusin", handleFocusIn);
			document.removeEventListener("focusout", handleFocusOut);
		};
	}, []);

	const runEditorAction = useCallback((action: Promise<unknown>) => {
		action.catch((error: unknown) => {
			console.error("[BlockEditorSurface] Async editor action failed", error);
		});
	}, []);

	const handleRequestSlashMenu = useCallback((blockId: string, position: { x: number; y: number }) => {
		setSlashMenu({ blockId, position, filter: "" });
	}, [setSlashMenu]);

	const handleBeforeStructuralEdit = useCallback(() => {
		const currentBlocks = flushPendingDrafts("structural");
		blocksRef.current = currentBlocks;
		pushSnapshot(currentBlocks);
	}, [flushPendingDrafts, pushSnapshot]);

	const updateMouseSelection = useCallback((rect: SelectionRect) => {
		const root = selectionRootRef.current;
		if (!root) return;

		const nextSelected = new Set<string>();
		root.querySelectorAll<HTMLElement>("[data-block-id]").forEach((element) => {
			const blockId = element.dataset.blockId;
			if (blockId && rectsIntersect(rect, element.getBoundingClientRect())) nextSelected.add(blockId);
		});

		setSelectedBlockIds((previous) => setsEqual(previous, nextSelected) ? previous : nextSelected);
	}, []);

	const handleSelectionPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (compact || event.button !== 0 || draggedBlockId) return;
		if (isInteractiveSelectionTarget(event.target)) return;

		const start = { x: event.clientX, y: event.clientY };
		selectionStartRef.current = start;
		setSelectionRect(createSelectionRect(start, start));
		setSelectedBlockIds(new Set());

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const rect = createSelectionRect(start, { x: moveEvent.clientX, y: moveEvent.clientY });
			setSelectionRect(rect);
			updateMouseSelection(rect);
		};

		const handlePointerUp = () => {
			selectionStartRef.current = null;
			setSelectionRect(null);
			globalThis.removeEventListener("pointermove", handlePointerMove);
			globalThis.removeEventListener("pointerup", handlePointerUp);
		};

		globalThis.addEventListener("pointermove", handlePointerMove);
		globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
	}, [compact, draggedBlockId, updateMouseSelection]);

	if (locked) {
		return (
			<div data-testid="locked-page-body" className={`relative flex min-w-0 flex-col ${className}`}>
				{blocks.length === 0 ? (
					<p className="py-8 text-sm italic text-[var(--osio-fg-subtle)]">This page is locked and has no content.</p>
				) : blocks.map((block, index) => <ReadOnlyBlock key={block.id} block={block} index={index} />)}
			</div>
		);
	}

	if (blocks.length === 0) {
		return (
			<button
				type="button"
				data-page-editor-empty-trigger
				className={`min-h-[120px] min-w-0 flex-1 cursor-text text-left ${className}`}
				onClick={() => handleInitBlock(blocks)}
			>
				<p className="select-none pt-1 text-sm italic text-[var(--osio-fg-subtle)]">{emptyPlaceholder}</p>
			</button>
		);
	}

	return (
		<div ref={selectionRootRef} className={`relative flex min-w-0 flex-col ${className}`} onPointerDown={handleSelectionPointerDown}>
			<BlockTree
				blocks={blocks}
				pageId={pageId}
				isRoot
				highlightedRootBlockId={highlightedRootBlockId}
				selectedBlockIds={selectedBlockIds}
				moveBlock={moveBlock}
				moveBlockAcrossTree={moveBlockAcrossTree}
				updateContent={updateContent}
				source={resolvedSource}
				sourceKey={sourceKey}
				rootBlocks={blocks}
				draggedBlockId={draggedBlockId}
				setDraggedBlockId={setDraggedBlockId}
				onChange={handleBlockChange}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				onDeleteBlock={(blockId) => deleteBlock(pageId, blockId)}
				onUpdateBlock={(blockId, updates) => updateBlock(pageId, blockId, updates)}
				registerRef={registerBlockRef}
				focusBlock={focusBlock}
				onBeforeStructuralEdit={handleBeforeStructuralEdit}
				onRequestSlashMenu={handleRequestSlashMenu}
				onContextMenu={openContextMenu}
				renderBlockEditor={renderBlockEditor}
			/>

			{compact ? null : (
				<button
					type="button"
					className="group mt-1 flex items-center gap-2 px-1 py-2 text-sm text-[var(--osio-fg-subtle)] transition-colors hover:text-[var(--osio-fg-muted)]"
					onClick={() => handleAddBlock(blocks)}
				>
					<Plus size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
					<span className="opacity-0 transition-opacity group-hover:opacity-100">Add a block</span>
				</button>
			)}

			{slashMenu ? (
				<SlashCommandMenu
					key={`${slashMenu.blockId}:${slashMenu.filter}`}
					position={slashMenu.position}
					filter={slashMenu.filter}
					onSelect={(item) => {
						const currentBlocks = flushPendingDrafts("shortcut");
						blocksRef.current = currentBlocks;
						if (item.kind === "turn-into") {
							handleSlashTurnIntoSelect(item.blockType, currentBlocks, {
								calloutIcon: item.calloutIcon,
								placeholderText: item.placeholderText,
								layoutMode: item.layoutMode,
							});
							return;
						}
						if (item.kind === "create-page") {
							runEditorAction(handleSlashCreatePageSelect(currentBlocks));
							return;
						}
						if (item.kind === "inline") {
							handleSlashInlineSelect(item.insertText, currentBlocks);
							return;
						}
						if (item.kind === "database-view") {
							handleSlashDatabaseViewSelect(item.databaseId, item.viewId, currentBlocks);
							return;
						}
						handleSlashSelect(item.blockType, currentBlocks, item.calloutIcon, item.layoutMode);
					}}
					onMediaSelect={(kind, value) => {
						const currentBlocks = flushPendingDrafts("shortcut");
						blocksRef.current = currentBlocks;
						handleSlashMediaSelect(kind, value, currentBlocks);
					}}
					onClose={() => setSlashMenu(null)}
				/>
			) : null}

			{pageSelector ? (
				<PageSelectorMenu
					key={`${pageSelector.blockId}:${pageSelector.filter}`}
					position={pageSelector.position}
					filter={pageSelector.filter}
					onSelect={handlePageSelectorSelect}
					onCreate={() => runEditorAction(handlePageSelectorCreate())}
					onClose={() => setPageSelector(null)}
				/>
			) : null}

			<BlockContextMenu menu={contextMenu} sections={contextMenuSections} onClose={closeContextMenu} />

			{selectionRect ? (
				<div
					className="pointer-events-none fixed z-[var(--osio-z-max)] rounded-sm border border-[var(--osio-accent)] bg-[var(--osio-accent)]/10"
					style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }}
				/>
			) : null}
		</div>
	);
};

interface BlockTreeProps {
	blocks: Block[];
	pageId: string;
	isRoot?: boolean;
	parentBlockType?: Block["type"] | null;
	parentBlockId?: string | null;
	numberedDepth?: number;
	bulletDepth?: number;
	highlightedRootBlockId: string | null;
	selectedBlockIds: Set<string>;
	isHighlightedBranch?: boolean;
	moveBlock: (pageId: string, blockId: string, targetIndex: number, parentBlockId?: string | null) => void;
	moveBlockAcrossTree: (pageId: string, blockId: string, targetParentBlockId: string | null, targetIndex: number) => void;
	updateContent: (blocks: Block[]) => void;
	source: EditorSurfaceSource;
	sourceKey: string;
	rootBlocks: Block[];
	draggedBlockId: string | null;
	setDraggedBlockId: (id: string | null) => void;
	onChange: (blockId: string, text: string) => void;
	onKeyDown: (e: React.KeyboardEvent, blockId: string, parentBlockId?: string | null) => void;
	onPaste: (e: React.ClipboardEvent, blockId: string) => void;
	onDeleteBlock: (blockId: string) => void;
	onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
	registerRef: (blockId: string, el: HTMLElement | null) => void;
	focusBlock: (blockId: string, cursorEnd?: boolean) => void;
	onBeforeStructuralEdit: () => void;
	onContextMenu: (e: React.MouseEvent, blockId: string) => void;
	onRequestSlashMenu: (blockId: string, position: { x: number; y: number }) => void;
	renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

const BlockTree: React.FC<BlockTreeProps> = ({
	blocks,
	pageId,
	isRoot = false,
	parentBlockType = null,
	parentBlockId = null,
	numberedDepth = 0,
	bulletDepth = 0,
	highlightedRootBlockId,
	selectedBlockIds,
	isHighlightedBranch = false,
	moveBlock,
	moveBlockAcrossTree,
	updateContent,
	source,
	sourceKey,
	rootBlocks,
	draggedBlockId,
	setDraggedBlockId,
	onChange,
	onKeyDown,
	onPaste,
	onDeleteBlock,
	onUpdateBlock,
	registerRef,
	focusBlock,
	onBeforeStructuralEdit,
	onContextMenu,
	onRequestSlashMenu,
	renderBlockEditor,
}) => {
		const listRef = useRef<HTMLUListElement | null>(null);
		const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
		const [scrollMargin, setScrollMargin] = useState(0);
		const renderItems = useMemo(() => {
			let numberedCounter = 0;
			return blocks.map((block) => {
				const numberedIndex = block.type === "numbered_list" ? ++numberedCounter : 0;
				if (block.type !== "numbered_list") numberedCounter = 0;
				const nextNumberedDepth = block.type === "numbered_list" ? numberedDepth + 1 : numberedDepth;
				const nextBulletDepth = block.type === "bulleted_list" ? bulletDepth + 1 : bulletDepth;
				const isHighlighted = isHighlightedBranch || (highlightedRootBlockId !== null && block.id === highlightedRootBlockId);

				return { block, numberedIndex, nextNumberedDepth, nextBulletDepth, isHighlighted };
			});
		}, [blocks, bulletDepth, highlightedRootBlockId, isHighlightedBranch, numberedDepth]);
		const shouldVirtualize = isRoot && blocks.length >= ROOT_BLOCK_VIRTUALIZATION_THRESHOLD;
		const virtualizer = useVirtualizer({
			count: shouldVirtualize ? renderItems.length : 0,
			getScrollElement: () => scrollElement,
			estimateSize: (index) => estimateBlockHeight(renderItems[index]?.block ?? blocks[0]),
			getItemKey: (index) => renderItems[index]?.block.id ?? index,
			overscan: ROOT_BLOCK_VIRTUALIZATION_OVERSCAN,
			scrollMargin,
		});

		useLayoutEffect(() => {
			if (!shouldVirtualize) return;
			const root = listRef.current;
			const nextScrollElement = resolveScrollElement(root);
			if (!root || !nextScrollElement) return;

			const updateScrollMargin = () => {
				setScrollElement(nextScrollElement);
				setScrollMargin(measureScrollMargin(root, nextScrollElement));
			};

			updateScrollMargin();
			const resizeObserver = new ResizeObserver(updateScrollMargin);
			resizeObserver.observe(root);
			resizeObserver.observe(nextScrollElement);
			globalThis.addEventListener("resize", updateScrollMargin);
			return () => {
				resizeObserver.disconnect();
				globalThis.removeEventListener("resize", updateScrollMargin);
			};
		}, [blocks.length, shouldVirtualize]);

		useEffect(() => {
			if (!shouldVirtualize) return;
			const handleVirtualFocus = (event: Event) => {
				const blockId = getVirtualFocusBlockId(event);
				if (!blockId) return;
				const index = renderItems.findIndex((item) => item.block.id === blockId);
				if (index < 0) return;
				virtualizer.scrollToIndex(index, { align: "auto" });
			};

			document.addEventListener(VIRTUAL_BLOCK_FOCUS_EVENT, handleVirtualFocus);
			return () => document.removeEventListener(VIRTUAL_BLOCK_FOCUS_EVENT, handleVirtualFocus);
		}, [renderItems, shouldVirtualize, virtualizer]);

		const renderItem = (item: (typeof renderItems)[number]) => {
			const { block, numberedIndex, nextNumberedDepth, nextBulletDepth, isHighlighted } = item;

			return (
				<>
					<DraggablePlaygroundBlock
						block={block}
						blocks={blocks}
						pageId={pageId}
						parentBlockId={parentBlockId}
						moveBlock={moveBlock}
						moveBlockAcrossTree={moveBlockAcrossTree}
						updateContent={updateContent}
						source={source}
						sourceKey={sourceKey}
						rootBlocks={rootBlocks}
						draggedBlockId={draggedBlockId}
						setDraggedBlockId={setDraggedBlockId}
						selectedBlockIds={selectedBlockIds}
						onContextMenu={onContextMenu}
					>
						<EditableBlock
							pageId={pageId}
							block={block}
							parentBlockId={parentBlockId}
							numberedIndex={numberedIndex}
							numberedDepth={numberedDepth}
							bulletDepth={bulletDepth}
							isHighlighted={isHighlighted}
							onChange={onChange}
							onKeyDown={onKeyDown}
							onPaste={onPaste}
							onDeleteBlock={onDeleteBlock}
							onUpdateBlock={onUpdateBlock}
							registerRef={registerRef}
							focusBlock={focusBlock}
							onBeforeStructuralEdit={onBeforeStructuralEdit}
							onRequestSlashMenu={onRequestSlashMenu}
							moveBlock={moveBlock}
							moveBlockAcrossTree={moveBlockAcrossTree}
							updateContent={updateContent}
							source={source}
							sourceKey={sourceKey}
							rootBlocks={rootBlocks}
							draggedBlockId={draggedBlockId}
							setDraggedBlockId={setDraggedBlockId}
							selectedBlockIds={selectedBlockIds}
							onContextMenu={onContextMenu}
							renderBlockEditor={renderBlockEditor}
						/>
					</DraggablePlaygroundBlock>

					{shouldRenderChildren(block) ? (
						<div className={isHighlighted ? "rounded-md bg-[var(--osio-bg-subtle)]" : "rounded-md transition-colors"}>
							<BlockTree
								blocks={block.children!}
								pageId={pageId}
								parentBlockType={block.type}
								parentBlockId={block.id}
								numberedDepth={nextNumberedDepth}
								bulletDepth={nextBulletDepth}
								highlightedRootBlockId={highlightedRootBlockId}
								selectedBlockIds={selectedBlockIds}
								isHighlightedBranch={isHighlighted}
								moveBlock={moveBlock}
								moveBlockAcrossTree={moveBlockAcrossTree}
								updateContent={updateContent}
								source={source}
								sourceKey={sourceKey}
								rootBlocks={rootBlocks}
								draggedBlockId={draggedBlockId}
								setDraggedBlockId={setDraggedBlockId}
								onChange={onChange}
								onKeyDown={onKeyDown}
								onPaste={onPaste}
								onDeleteBlock={onDeleteBlock}
								onUpdateBlock={onUpdateBlock}
								registerRef={registerRef}
								focusBlock={focusBlock}
								onBeforeStructuralEdit={onBeforeStructuralEdit}
								onContextMenu={onContextMenu}
								onRequestSlashMenu={onRequestSlashMenu}
								renderBlockEditor={renderBlockEditor}
							/>
						</div>
					) : null}
				</>
			);
		};

		if (shouldVirtualize) {
			return (
				<ul
					ref={listRef}
					data-testid="block-tree-root"
					data-parent-block-type=""
					data-parent-block-id=""
					className="relative m-0 list-none p-0"
					style={{ height: virtualizer.getTotalSize() }}
				>
					{virtualizer.getVirtualItems().map((virtualItem) => {
						const item = renderItems[virtualItem.index];
						if (!item) return null;

						return (
							<li
								key={virtualItem.key}
								data-index={virtualItem.index}
								data-virtual-block-id={item.block.id}
								ref={virtualizer.measureElement}
								className="group/block-branch absolute left-0 right-0 top-0 rounded-md"
								style={{ transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
							>
								{renderItem(item)}
							</li>
						);
					})}
				</ul>
			);
		}

	return (
		<ul
			data-testid={isRoot ? "block-tree-root" : `${parentBlockType ?? "nested"}-children`}
			data-parent-block-type={parentBlockType ?? ""}
			data-parent-block-id={parentBlockId ?? ""}
			className={`${getNestedTreeClassName(parentBlockType, isRoot)} m-0 list-none p-0`}
		>
			{renderItems.map((item) => {
				const { block } = item;
				return (
					<li key={block.id} className="group/block-branch rounded-md">
						{renderItem(item)}
					</li>
				);
			})}
		</ul>
	);
};

interface DraggablePlaygroundBlockProps {
	block: Block;
	blocks: Block[];
	pageId: string;
	parentBlockId: string | null;
	moveBlock: (pageId: string, blockId: string, targetIndex: number, parentBlockId?: string | null) => void;
	moveBlockAcrossTree: (pageId: string, blockId: string, targetParentBlockId: string | null, targetIndex: number) => void;
	updateContent: (blocks: Block[]) => void;
	source: EditorSurfaceSource;
	sourceKey: string;
	rootBlocks: Block[];
	draggedBlockId: string | null;
	setDraggedBlockId: (id: string | null) => void;
	selectedBlockIds: Set<string>;
	onContextMenu: (e: React.MouseEvent, blockId: string) => void;
	children: React.ReactNode;
}

const DraggablePlaygroundBlock: React.FC<DraggablePlaygroundBlockProps> = ({
	block,
	blocks,
	pageId,
	parentBlockId,
	moveBlock,
	moveBlockAcrossTree,
	updateContent,
	source,
	sourceKey,
	rootBlocks,
	draggedBlockId,
	setDraggedBlockId,
	selectedBlockIds,
	onContextMenu,
	children,
}) => {
	const [dropPosition, setDropPosition] = useState<DropPosition>(null);

	const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
		e.dataTransfer.setData(DND_TYPE, block.id);
		e.dataTransfer.setData(DND_PAYLOAD_TYPE, JSON.stringify({ blockId: block.id, sourceKey, block } satisfies BlockDragPayload));
		e.dataTransfer.effectAllowed = "move";
		setDraggedBlockId(block.id);
	}, [block, setDraggedBlockId, sourceKey]);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (!e.dataTransfer.types.includes(DND_TYPE)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "move";
		const rect = e.currentTarget.getBoundingClientRect();
		const intent = getDropIntent(block, blocks, parentBlockId, e.clientX, e.clientY, rect);
		setDropPosition(intent?.position ?? null);
	}, [block, blocks, parentBlockId]);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropPosition(null);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setDropPosition(null);
		const payload = readDragPayload(e.dataTransfer);
		const draggedId = e.dataTransfer.getData(DND_TYPE) || payload?.blockId;
		if (!draggedId || draggedId === block.id) return;

		const currentRootBlocks = surfaceRegistry.get(sourceKey)?.getContent() ?? rootBlocks;
		const draggedBlock = findBlockById(currentRootBlocks, draggedId) ?? payload?.block ?? null;
		if (!draggedBlock || blockContainsBlock(draggedBlock, block.id)) return;
		if (source.kind === "cell" && blockContainsBlockOrSelf(draggedBlock, source.layoutBlockId)) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const intent = getDropIntent(block, blocks, parentBlockId, e.clientX, e.clientY, rect);
		if (!intent) return;

		if (payload?.sourceKey && payload.sourceKey !== sourceKey) {
			const originSurface = surfaceRegistry.get(payload.sourceKey);
			if (!originSurface) return;
			const originResult = removeBlockById(originSurface.getContent(), draggedId);
			if (!originResult.removed) return;
			originSurface.updateContent(originResult.blocks);
			updateContent(insertExternalBlockByDropIntent(currentRootBlocks, originResult.removed, block.id, intent));
			setDraggedBlockId(null);
			return;
		}

		if (intent.position === "left" || intent.position === "right") {
			updateContent(splitBlocksIntoColumns(currentRootBlocks, draggedId, block.id, intent.position));
			setDraggedBlockId(null);
			return;
		}

		const isSameLevel = blocks.some((candidate) => candidate.id === draggedId);
		if (isSameLevel && intent.targetParentBlockId === parentBlockId) {
			moveBlock(pageId, draggedId, intent.targetIndex, parentBlockId);
		} else {
			moveBlockAcrossTree(pageId, draggedId, intent.targetParentBlockId, intent.targetIndex);
		}
		setDraggedBlockId(null);
	}, [block, blocks, moveBlock, moveBlockAcrossTree, pageId, parentBlockId, rootBlocks, setDraggedBlockId, source, sourceKey, updateContent]);

	const handleDragEnd = useCallback(() => {
		setDraggedBlockId(null);
		setDropPosition(null);
	}, [setDraggedBlockId]);

	const isDragged = draggedBlockId === block.id;
	const isSelected = selectedBlockIds.has(block.id);

	return (
		<article
			data-testid="draggable-block"
			data-draggable-block-id={block.id}
			data-selected={isSelected ? "true" : undefined}
			data-block-type={block.type}
			className={`group/block relative rounded-md transition-colors transition-opacity hover:bg-[var(--osio-bg-subtle)] focus-within:bg-[var(--osio-bg-subtle)] ${isDragged ? "opacity-40" : ""} ${isSelected ? "bg-[var(--osio-accent)]/10 ring-1 ring-[var(--osio-accent)]/35" : ""}`}
			onContextMenu={(e) => onContextMenu(e, block.id)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<button
				type="button"
				draggable
				data-testid="block-drag-handle"
				onClick={(e) => onContextMenu(e, block.id)}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				className="absolute -left-7 top-2 cursor-grab rounded p-0.5 text-[var(--osio-fg-subtle)] opacity-0 transition-colors transition-opacity hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-muted)] group-hover/block:opacity-100 active:cursor-grabbing"
				aria-label="Drag to reorder block"
				title="Drag to reorder"
			>
				<svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
					<circle cx="5.5" cy="3.5" r="1.5" />
					<circle cx="10.5" cy="3.5" r="1.5" />
					<circle cx="5.5" cy="8" r="1.5" />
					<circle cx="10.5" cy="8" r="1.5" />
					<circle cx="5.5" cy="12.5" r="1.5" />
					<circle cx="10.5" cy="12.5" r="1.5" />
				</svg>
			</button>

			{dropPosition ? (
				<div data-testid="block-drop-indicator" className={`pointer-events-none absolute z-[var(--osio-z-raised)] rounded-full bg-[var(--osio-accent)] ${getDropIndicatorClassName(dropPosition)}`} />
			) : null}

			{children}
		</article>
	);
};

interface EditableBlockProps {
	pageId: string;
	block: Block;
	parentBlockId?: string | null;
	numberedIndex: number;
	numberedDepth: number;
	bulletDepth: number;
	isHighlighted: boolean;
	onChange: (blockId: string, text: string) => void;
	onKeyDown: (e: React.KeyboardEvent, blockId: string, parentBlockId?: string | null) => void;
	onPaste: (e: React.ClipboardEvent, blockId: string) => void;
	onDeleteBlock: (blockId: string) => void;
	onUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
	registerRef: (blockId: string, el: HTMLElement | null) => void;
	focusBlock: (blockId: string, cursorEnd?: boolean) => void;
	onBeforeStructuralEdit: () => void;
	onRequestSlashMenu: (blockId: string, position: { x: number; y: number }) => void;
	moveBlock: (pageId: string, blockId: string, targetIndex: number, parentBlockId?: string | null) => void;
	moveBlockAcrossTree: (pageId: string, blockId: string, targetParentBlockId: string | null, targetIndex: number) => void;
	updateContent: (blocks: Block[]) => void;
	source: EditorSurfaceSource;
	sourceKey: string;
	rootBlocks: Block[];
	draggedBlockId: string | null;
	setDraggedBlockId: (id: string | null) => void;
	selectedBlockIds: Set<string>;
	onContextMenu: (e: React.MouseEvent, blockId: string) => void;
	renderBlockEditor: (props: SurfaceBlockEditorProps) => React.ReactNode;
}

const EditableBlockBase: React.FC<EditableBlockProps> = ({
	pageId,
	block,
	parentBlockId = null,
	numberedIndex,
	numberedDepth,
	bulletDepth,
	isHighlighted,
	onChange,
	onKeyDown,
	onPaste,
	onDeleteBlock,
	onUpdateBlock,
	registerRef,
	focusBlock,
	onBeforeStructuralEdit,
	onRequestSlashMenu,
	moveBlock,
	moveBlockAcrossTree,
	updateContent,
	source,
	sourceKey,
	rootBlocks,
	draggedBlockId,
	setDraggedBlockId,
	selectedBlockIds,
	onContextMenu,
	renderBlockEditor,
}) => {
	const draftContent = useBlockDraftContent(sourceKey, block.id, block.content);
	const editorBlock = useMemo(
		() => draftContent === block.content ? block : { ...block, content: draftContent },
		[block, draftContent],
	);
	const handleChange = useCallback((text: string) => onChange(block.id, text), [block.id, onChange]);
	const handleKey = useCallback((e: React.KeyboardEvent) => onKeyDown(e, block.id, parentBlockId), [block.id, onKeyDown, parentBlockId]);
	const handlePaste = useCallback((e: React.ClipboardEvent) => onPaste(e, block.id), [block.id, onPaste]);
	const blockElementRef = useRef<HTMLDivElement | null>(null);
	const refCb = useCallback((el: HTMLDivElement | null) => {
		blockElementRef.current = el;
		registerRef(block.id, el);
	}, [block.id, registerRef]);

	useEffect(() => {
		const element = blockElementRef.current;
		if (!element) return;

		const handleFocusOut = (event: FocusEvent) => {
			const nextTarget = event.relatedTarget as Node | null;
			if (nextTarget && element.contains(nextTarget)) return;
			commitBlockDraft(sourceKey, block.id, "blur");
		};

		element.addEventListener("focusout", handleFocusOut);
		return () => element.removeEventListener("focusout", handleFocusOut);
	}, [block.id, sourceKey]);

	useEffect(() => () => {
		commitBlockDraft(sourceKey, block.id, "unmount");
	}, [block.id, sourceKey]);

	const renderChildren = useCallback(() => {
		if (!block.children?.length) return null;

		if (block.type === "column_list") {
			const columns = block.children;
			return (
				<div className="flex items-stretch gap-0 rounded-md border border-dashed border-transparent hover:border-[var(--osio-border-default)]">
					{columns.map((column, index) => (
						<React.Fragment key={column.id}>
							<div className="min-w-0 px-1" style={{ flexGrow: normalizeColumnRatio(column, columns.length), flexBasis: 0 }}>
								<BlockTree
									blocks={column.children ?? EMPTY_BLOCKS}
									pageId={pageId}
									parentBlockType="column"
									parentBlockId={column.id}
									numberedDepth={numberedDepth}
									bulletDepth={bulletDepth}
									highlightedRootBlockId={isHighlighted ? block.id : null}
									selectedBlockIds={selectedBlockIds}
									isHighlightedBranch={isHighlighted}
									moveBlock={moveBlock}
									moveBlockAcrossTree={moveBlockAcrossTree}
									updateContent={updateContent}
									source={source}
									sourceKey={sourceKey}
									rootBlocks={rootBlocks}
									draggedBlockId={draggedBlockId}
									setDraggedBlockId={setDraggedBlockId}
									onChange={onChange}
									onKeyDown={onKeyDown}
									onPaste={onPaste}
									onDeleteBlock={onDeleteBlock}
									onUpdateBlock={onUpdateBlock}
									registerRef={registerRef}
									focusBlock={focusBlock}
									onBeforeStructuralEdit={onBeforeStructuralEdit}
									onContextMenu={onContextMenu}
									onRequestSlashMenu={onRequestSlashMenu}
									renderBlockEditor={renderBlockEditor}
								/>
							</div>
							{index < columns.length - 1 ? (
								<ColumnResizeHandle
									rootBlocks={rootBlocks}
									updateContent={updateContent}
									columnListId={block.id}
									leftColumn={column}
									rightColumn={columns[index + 1]}
									columnCount={columns.length}
								/>
							) : null}
						</React.Fragment>
					))}
				</div>
			);
		}

		return (
			<BlockTree
				blocks={block.children}
				pageId={pageId}
				parentBlockType={block.type}
				parentBlockId={block.id}
				numberedDepth={block.type === "numbered_list" ? numberedDepth + 1 : numberedDepth}
				bulletDepth={block.type === "bulleted_list" ? bulletDepth + 1 : bulletDepth}
				highlightedRootBlockId={isHighlighted ? block.id : null}
				selectedBlockIds={selectedBlockIds}
				isHighlightedBranch={isHighlighted}
				moveBlock={moveBlock}
				moveBlockAcrossTree={moveBlockAcrossTree}
				updateContent={updateContent}
				source={source}
				sourceKey={sourceKey}
				rootBlocks={rootBlocks}
				draggedBlockId={draggedBlockId}
				setDraggedBlockId={setDraggedBlockId}
				onChange={onChange}
				onKeyDown={onKeyDown}
				onPaste={onPaste}
				onDeleteBlock={onDeleteBlock}
				onUpdateBlock={onUpdateBlock}
				registerRef={registerRef}
				focusBlock={focusBlock}
					onBeforeStructuralEdit={onBeforeStructuralEdit}
				onContextMenu={onContextMenu}
				onRequestSlashMenu={onRequestSlashMenu}
				renderBlockEditor={renderBlockEditor}
			/>
		);
	}, [block.children, block.id, block.type, bulletDepth, draggedBlockId, focusBlock, isHighlighted, moveBlock, moveBlockAcrossTree, numberedDepth, onBeforeStructuralEdit, onChange, onContextMenu, onDeleteBlock, onKeyDown, onPaste, onRequestSlashMenu, onUpdateBlock, pageId, registerRef, renderBlockEditor, rootBlocks, selectedBlockIds, setDraggedBlockId, source, sourceKey, updateContent]);

	return (
		<div data-block-id={block.id} data-block-type={block.type} ref={refCb} className="-mx-1 rounded-md px-1" style={getBlockSurfaceStyle(block)}>
			{renderBlockEditor({
				pageId,
				block: editorBlock,
				numberedIndex,
				numberedDepth,
				bulletDepth,
				isSelected: selectedBlockIds.has(block.id),
				onChange: handleChange,
				onKeyDown: handleKey,
				onPaste: handlePaste,
				onDeleteCodeBlock: () => onDeleteBlock(block.id),
				onUpdateBlock,
				onBeforeStructuralEdit,
				focusBlock,
				onRequestSlashMenu: (position) => onRequestSlashMenu(block.id, position),
				renderChildren,
			})}
		</div>
	);
};

const EditableBlock = React.memo(EditableBlockBase);

interface ColumnResizeHandleProps {
	rootBlocks: Block[];
	updateContent: (blocks: Block[]) => void;
	columnListId: string;
	leftColumn: Block;
	rightColumn: Block;
	columnCount: number;
}

const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
	rootBlocks,
	updateContent,
	columnListId,
	leftColumn,
	rightColumn,
	columnCount,
}) => {
	const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const container = event.currentTarget.parentElement;
		const totalWidth = Math.max(container?.getBoundingClientRect().width ?? 1, 1);
		const startX = event.clientX;
		const startLeft = normalizeColumnRatio(leftColumn, columnCount);
		const startRight = normalizeColumnRatio(rightColumn, columnCount);
		const pairTotal = startLeft + startRight;
		const minRatio = Math.min(0.24, pairTotal / 2 - 0.02);

		const handlePointerMove = (moveEvent: PointerEvent) => {
			const deltaRatio = (moveEvent.clientX - startX) / totalWidth;
			const nextLeft = Math.min(pairTotal - minRatio, Math.max(minRatio, startLeft + deltaRatio));
			updateContent(updateColumnRatiosInTree(rootBlocks, columnListId, leftColumn.id, rightColumn.id, nextLeft, pairTotal - nextLeft));
		};

		const handlePointerUp = () => {
			globalThis.removeEventListener("pointermove", handlePointerMove);
			globalThis.removeEventListener("pointerup", handlePointerUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		globalThis.addEventListener("pointermove", handlePointerMove);
		globalThis.addEventListener("pointerup", handlePointerUp, { once: true });
	}, [columnCount, columnListId, leftColumn, rightColumn, rootBlocks, updateContent]);

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			title="Drag to resize columns"
			data-column-resize-handle
			className="group/resize flex w-3 shrink-0 cursor-col-resize items-stretch justify-center"
			onPointerDown={handlePointerDown}
		>
			<div className="w-px rounded-full bg-[var(--osio-border-default)] transition-colors group-hover/resize:bg-[var(--osio-accent)]" />
		</div>
	);
};

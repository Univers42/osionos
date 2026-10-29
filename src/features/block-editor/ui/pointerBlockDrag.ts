/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pointerBlockDrag.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Block drag runs on pointer events and replays itself as HTML5 drag events.
// A native drag hands the pointer to the OS drag session, and on Linux Chromium
// that session swallows the mouse wheel: a block could not be carried further
// than the visible page. Replaying dragenter/dragover/drop with a constructed
// DataTransfer keeps every existing drop target working unchanged.

import { createVerticalAutoScroller } from "./canvas/controller/useCanvasPointer.helpers";

const DRAG_THRESHOLD_PX = 4;

interface PointerBlockDragOptions {
	/** DataTransfer entries the drop targets read (type → value). */
	data: Record<string, string>;
	onStart: () => void;
	onEnd: () => void;
}

function scrollContainerOf(element: HTMLElement): HTMLElement | null {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
	}
	return null;
}

/** Returns true when a listener called preventDefault (the target accepts the drop). */
function replay(type: string, target: Element, point: { x: number; y: number }, dataTransfer: DataTransfer, relatedTarget: Element | null = null): boolean {
	const event = new DragEvent(type, {
		bubbles: true,
		cancelable: true,
		composed: true,
		clientX: point.x,
		clientY: point.y,
		dataTransfer,
		relatedTarget,
	});
	return !target.dispatchEvent(event);
}

// The click that follows a drag lands on the captured handle; it must not open the block menu.
function swallowNextClick(): void {
	const swallow = (event: MouseEvent) => {
		event.stopPropagation();
		event.preventDefault();
	};
	globalThis.addEventListener("click", swallow, { capture: true, once: true });
	setTimeout(() => globalThis.removeEventListener("click", swallow, { capture: true }), 0);
}

/** Starts tracking a press on `handle`; it becomes a drag once the pointer moves past the threshold. */
export function startPointerBlockDrag(down: PointerEvent, handle: HTMLElement, options: PointerBlockDragOptions): void {
	if (down.button !== 0) return;
	const point = { x: down.clientX, y: down.clientY };
	let dataTransfer: DataTransfer | null = null;
	let autoScroller: ReturnType<typeof createVerticalAutoScroller> | null = null;
	let current: Element | null = null;
	let accepted = false;
	// Capture keeps the moves coming while the pointer crosses an iframe (embeds, whiteboards).
	handle.setPointerCapture(down.pointerId);

	const hover = () => {
		if (!dataTransfer) return;
		const target = document.elementFromPoint(point.x, point.y);
		if (target !== current) {
			if (current) replay("dragleave", current, point, dataTransfer, target);
			if (target) replay("dragenter", target, point, dataTransfer, current);
			current = target;
		}
		accepted = current ? replay("dragover", current, point, dataTransfer) : false;
	};

	const begin = () => {
		dataTransfer = new DataTransfer();
		for (const [type, value] of Object.entries(options.data)) dataTransfer.setData(type, value);
		autoScroller = createVerticalAutoScroller(scrollContainerOf(handle));
		document.body.style.userSelect = "none";
		options.onStart();
	};

	const onMove = (event: PointerEvent) => {
		if (event.pointerId !== down.pointerId) return;
		point.x = event.clientX;
		point.y = event.clientY;
		if (!dataTransfer && Math.hypot(point.x - down.clientX, point.y - down.clientY) < DRAG_THRESHOLD_PX) return;
		if (!dataTransfer) begin();
		autoScroller?.update(point.y);
		hover();
	};

	const finish = (drop: boolean) => {
		globalThis.removeEventListener("pointermove", onMove);
		globalThis.removeEventListener("pointerup", onUp);
		globalThis.removeEventListener("pointercancel", onCancel);
		globalThis.removeEventListener("keydown", onKey, true);
		document.removeEventListener("scroll", hover, true);
		if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId);
		if (!dataTransfer) return;
		autoScroller?.stop();
		document.body.style.userSelect = "";
		if (current) {
			if (drop && accepted) replay("drop", current, point, dataTransfer);
			else replay("dragleave", current, point, dataTransfer);
		}
		swallowNextClick();
		options.onEnd();
	};

	const onUp = (event: PointerEvent) => {
		if (event.pointerId === down.pointerId) finish(true);
	};
	const onCancel = (event: PointerEvent) => {
		if (event.pointerId === down.pointerId) finish(false);
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape" || !dataTransfer) return;
		event.preventDefault();
		event.stopPropagation();
		finish(false);
	};

	globalThis.addEventListener("pointermove", onMove);
	globalThis.addEventListener("pointerup", onUp);
	globalThis.addEventListener("pointercancel", onCancel);
	globalThis.addEventListener("keydown", onKey, true);
	// The wheel scrolls the page under a still pointer: the target below it changed.
	document.addEventListener("scroll", hover, true);
}

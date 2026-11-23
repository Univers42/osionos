/**
 * The one home for TanStack's `useVirtualizer` (osionos#337).
 *
 * The hook returns a mutable object, so the React Compiler refuses to optimise
 * whatever component calls it. Calling it here keeps that refusal inside this
 * small component: callers pass the options and a render prop, receive a plain
 * frame (the visible items, the total size, the measuring ref) and are compiled
 * as usual. Callers that must scroll from an effect take `handleRef`.
 *
 * Callers render this unconditionally, with `count: 0` while not virtualizing,
 * so the virtualizer observes the scroll element from mount and the render
 * that crosses a threshold already knows the viewport.
 */
import React, { useImperativeHandle } from "react";
import { useVirtualizer, type ReactVirtualizerOptions, type Virtualizer, type VirtualItem } from "@tanstack/react-virtual";

type VirtualWindowOptions = Omit<
  ReactVirtualizerOptions<Element, Element>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn" | "onChange"
>;

export interface VirtualWindowFrame {
  items: VirtualItem[];
  totalSize: number;
  measureElement: (node: Element | null) => void;
}

export type VirtualWindowHandle = Pick<Virtualizer<Element, Element>, "scrollToIndex">;

export interface VirtualWindowProps
  extends Pick<VirtualWindowOptions, "count" | "getScrollElement" | "estimateSize">,
    Partial<Omit<VirtualWindowOptions, "count" | "getScrollElement" | "estimateSize">> {
  children: (frame: VirtualWindowFrame) => React.ReactNode;
  handleRef?: React.Ref<VirtualWindowHandle>;
}

export function VirtualWindow({ children, handleRef, ...options }: VirtualWindowProps): React.ReactNode {
  // eslint-disable-next-line react-hooks/incompatible-library -- the only caller of the hook on purpose: the compiler skips this wrapper, not its callers (osionos#337)
  const virtualizer = useVirtualizer<Element, Element>(options);
  useImperativeHandle(handleRef, () => ({ scrollToIndex: virtualizer.scrollToIndex }), [virtualizer]);
  return children({
    items: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  });
}

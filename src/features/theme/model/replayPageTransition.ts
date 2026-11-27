import { useLayoutEffect, useRef } from "react";

const PAGE_TRANSITION_PREFIX = "osio-page-";

/** Restarts the page-transition animation running on an element, if any. Only animations
 *  whose keyframe is one of the page transitions are touched; no layout is forced. */
export function replayPageTransition(element: Element | null): void {
  if (!element || typeof element.getAnimations !== "function") return;
  for (const animation of element.getAnimations()) {
    if (!(animation instanceof CSSAnimation) || !animation.animationName.startsWith(PAGE_TRANSITION_PREFIX)) continue;
    animation.cancel();
    animation.play();
  }
}

/** Replays the element's page transition whenever `key` changes after the first render: the
 *  container stays mounted when its tab opens another page, so its CSS animation would not restart. */
export function useReplayPageTransition(ref: React.RefObject<Element | null>, key: string): void {
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    replayPageTransition(ref.current);
  }, [ref, key]);
}

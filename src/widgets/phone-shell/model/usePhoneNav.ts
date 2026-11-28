import { useCallback, useEffect, useReducer, useRef } from "react";

import { activeTabOf } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import {
  currentStack,
  initialPhoneNav,
  phoneNavReducer,
  topPageId,
  type PhoneNavState,
  type PhoneTabId,
} from "./phoneStack";

export interface PhoneNav {
  state: PhoneNavState;
  canGoBack: boolean;
  back: () => void;
  switchTab: (tab: PhoneTabId) => void;
}

/** Each page the workspace layout activates after mount is pushed with `history.pushState`, and
 *  `popstate` pops it, so the Android back button and swipe walk the stack instead of leaving the
 *  app. The in-app arrow calls `history.back()` to keep both in step.
 *
 *  Ponytail: one history entry per push, not per tab, so back pressed on a tab whose stack is at its
 *  root after another tab pushed spends that entry with no visible change; a layout restored after
 *  mount (account switch) pushes its active page like any other open. */
export function usePhoneNav(): PhoneNav {
  const [state, dispatch] = useReducer(phoneNavReducer, undefined, initialPhoneNav);
  const depthRef = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  useEffect(() => {
    let lastRoot = useWorkspaceLayout.getState().root;
    const unsubscribe = useWorkspaceLayout.subscribe((layout) => {
      if (layout.root === lastRoot) return;
      lastRoot = layout.root;
      const tab = activeTabOf(layout.root, layout.activePaneId);
      if (!tab || tab.kind === "home" || topPageId(stateRef.current) === tab.pageId) return;
      depthRef.current += 1;
      globalThis.history.pushState({ osioPhone: depthRef.current }, "");
      dispatch({ type: "push", entry: { kind: "page", pageId: tab.pageId, tab } });
    });
    const onPop = (): void => {
      depthRef.current = Math.max(0, depthRef.current - 1);
      dispatch({ type: "pop" });
    };
    globalThis.addEventListener("popstate", onPop);
    return () => {
      unsubscribe();
      globalThis.removeEventListener("popstate", onPop);
    };
  }, []);

  const back = useCallback(() => {
    if (depthRef.current > 0) globalThis.history.back();
    else dispatch({ type: "pop" });
  }, []);
  const switchTab = useCallback((tab: PhoneTabId) => dispatch({ type: "switch", tab }), []);
  return { state, canGoBack: currentStack(state).length > 1, back, switchTab };
}

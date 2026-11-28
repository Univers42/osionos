import { useCallback, useEffect, useReducer, useRef } from "react";

import { activeTabOf, findOpenTab } from "@/widgets/workspace-grid/model/layoutTree";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import {
  currentStack,
  initialPhoneNav,
  type PhoneEntry,
  phoneNavReducer,
  topPageId,
  type PhoneNavState,
  type PhoneTabId,
} from "./phoneStack";

/** The page the layout already shows when the shell mounts, as a stack entry; null on Home. */
function activePageEntry(): PhoneEntry | undefined {
  const { root, activePaneId } = useWorkspaceLayout.getState();
  const tab = activeTabOf(root, activePaneId);
  return tab && tab.kind !== "home" ? { kind: "page", pageId: tab.pageId, tab } : undefined;
}

/** Closes the layout tab of a page the phone popped, so opening it again is a fresh open (a tab
 *  already active would not change the layout, and the shell would never push it). */
function closeLayoutTab(pageId: string): void {
  const layout = useWorkspaceLayout.getState();
  const open = findOpenTab(layout.root, pageId);
  if (open) layout.closeTab(open.paneId, open.tab.tabId);
}

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
 *  Tapping the tab already shown returns it to its root in one history jump.
 *
 *  Ponytail: one history entry per push, not per tab, so back pressed on a tab whose stack is at its
 *  root after another tab pushed spends that entry with no visible change; a layout restored after
 *  mount (account switch) pushes its active page like any other open. */
export function usePhoneNav(): PhoneNav {
  const [state, dispatch] = useReducer(phoneNavReducer, undefined, () => initialPhoneNav(activePageEntry()));
  const depthRef = useRef(0);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const closingRef = useRef(false);
  const pop = useCallback((count = 1): void => {
    const { tab, stacks } = stateRef.current;
    const removed = stacks[tab].slice(-count);
    closingRef.current = true;
    for (const entry of removed) if (entry.kind === "page") closeLayoutTab(entry.pageId);
    closingRef.current = false;
    for (let step = 0; step < Math.min(count, stacks[tab].length - 1); step += 1) dispatch({ type: "pop" });
  }, []);

  useEffect(() => {
    if (stateRef.current.stacks.home.length > 1) {
      depthRef.current = 1;
      globalThis.history.pushState({ osioPhone: 1 }, "");
    }
    let lastRoot = useWorkspaceLayout.getState().root;
    const unsubscribe = useWorkspaceLayout.subscribe((layout) => {
      if (layout.root === lastRoot) return;
      lastRoot = layout.root;
      if (closingRef.current) return;
      const tab = activeTabOf(layout.root, layout.activePaneId);
      if (!tab || tab.kind === "home" || topPageId(stateRef.current) === tab.pageId) return;
      depthRef.current += 1;
      globalThis.history.pushState({ osioPhone: depthRef.current }, "");
      dispatch({ type: "push", entry: { kind: "page", pageId: tab.pageId, tab } });
    });
    const onPop = (event: PopStateEvent): void => {
      const depth = Math.max(0, (event.state as { osioPhone?: number } | null)?.osioPhone ?? 0);
      const steps = Math.max(1, depthRef.current - depth);
      depthRef.current = depth;
      pop(steps);
    };
    globalThis.addEventListener("popstate", onPop);
    return () => {
      unsubscribe();
      globalThis.removeEventListener("popstate", onPop);
    };
  }, [pop]);

  const back = useCallback(() => {
    if (depthRef.current > 0) globalThis.history.back();
    else pop();
  }, [pop]);
  const switchTab = useCallback((tab: PhoneTabId): void => {
    const { tab: current, stacks } = stateRef.current;
    const above = stacks[current].length - 1;
    if (tab !== current || above === 0) return dispatch({ type: "switch", tab });
    if (depthRef.current >= above) globalThis.history.go(-above);
    else pop(above);
  }, [pop]);
  return { state, canGoBack: currentStack(state).length > 1, back, switchTab };
}

// The phone shell's navigation model: one stack of entries per bottom tab. Pure, so the
// reducer is tested without React (tests/canvas/phone-stack.test.ts).

import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

export const PHONE_TABS = ["home", "search", "inbox", "agent"] as const;
export type PhoneTabId = (typeof PHONE_TABS)[number];

export type PhoneEntry =
  | { kind: "tab-root" }
  | { kind: "page"; pageId: string; tab: WorkspaceTab };

export interface PhoneNavState {
  tab: PhoneTabId;
  stacks: Readonly<Record<PhoneTabId, readonly PhoneEntry[]>>;
}

export type PhoneNavAction =
  | { type: "push"; entry: PhoneEntry }
  | { type: "pop" }
  | { type: "switch"; tab: PhoneTabId };

const ROOT: PhoneEntry = { kind: "tab-root" };

/** A fresh state: Home selected, every tab at its root; `open` (the page already active when the
 *  shell mounts, as after a wide window narrows) starts Home on top of that page. */
export function initialPhoneNav(open?: PhoneEntry): PhoneNavState {
  const home = open ? [ROOT, open] : [ROOT];
  return { tab: "home", stacks: { home, search: [ROOT], inbox: [ROOT], agent: [ROOT] } };
}

/** The entries of the selected tab, root first. */
export function currentStack(state: PhoneNavState): readonly PhoneEntry[] {
  return state.stacks[state.tab];
}

/** The page id on top of the selected tab's stack, or null at its root. */
export function topPageId(state: PhoneNavState): string | null {
  const top = currentStack(state).at(-1);
  return top?.kind === "page" ? top.pageId : null;
}

/** Push puts a page on the selected tab (the same page twice in a row is one entry); pop
 *  removes the top entry and is a no-op at a root; switch keeps every tab's stack as it is. */
export function phoneNavReducer(state: PhoneNavState, action: PhoneNavAction): PhoneNavState {
  if (action.type === "switch") return action.tab === state.tab ? state : { ...state, tab: action.tab };
  const stack = currentStack(state);
  if (action.type === "pop") {
    if (stack.length <= 1) return state;
    return { ...state, stacks: { ...state.stacks, [state.tab]: stack.slice(0, -1) } };
  }
  if (action.entry.kind === "page" && topPageId(state) === action.entry.pageId) return state;
  return { ...state, stacks: { ...state.stacks, [state.tab]: [...stack, action.entry] } };
}

import React, { useEffect, useState } from "react";

import { usePageStore } from "@/store/usePageStore";
import { PaneContent } from "@/widgets/page-renderer/ui/PaneContent";
import { currentStack, type PhoneEntry, type PhoneTabId } from "../model/phoneStack";
import { usePhoneNav } from "../model/usePhoneNav";
import { PhoneAccountSheet } from "./PhoneAccountSheet";
import { PhoneTabBar } from "./PhoneTabBar";
import { PhoneTabView } from "./PhoneTabViews";
import { PhoneTopBar } from "./PhoneTopBar";
import "./phoneShell.css";

const TAB_TITLES: Readonly<Record<PhoneTabId, string>> = Object.freeze({
  home: "Home",
  search: "Search",
  inbox: "Inbox",
  agent: "Agent",
});

const LEAVE_MS = 200;

/** One full-screen page: the same pane content the desktop grid renders, with its own header bar. */
const PhonePage: React.FC<{ entry: Extract<PhoneEntry, { kind: "page" }>; leaving?: boolean }> = ({ entry, leaving }) => (
  <div
    data-testid="phone-page"
    data-leaving={leaving ? "true" : undefined}
    className="phone-page absolute inset-0 overflow-y-auto bg-[var(--osio-bg-page)] px-4"
  >
    <PaneContent tab={entry.tab} chrome="bar" />
  </div>
);

/** The page that was just popped, kept for the slide-out and then dropped. */
function useLeavingPage(stack: readonly PhoneEntry[]): PhoneEntry | null {
  const [leaving, setLeaving] = useState<PhoneEntry | null>(null);
  const [previous, setPrevious] = useState(stack);
  if (previous !== stack) {
    setPrevious(stack);
    const popped = previous.length === stack.length + 1 ? previous.at(-1) : undefined;
    setLeaving(popped?.kind === "page" ? popped : null);
  }
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return leaving;
}

/** The phone app: a title row, the selected tab's stack as full-screen views, the bottom tab bar. */
export const PhoneShell: React.FC = () => {
  const { state, canGoBack, back, switchTab } = usePhoneNav();
  const stack = currentStack(state);
  const top = stack.at(-1);
  const leaving = useLeavingPage(stack);
  const [accountOpen, setAccountOpen] = useState(false);
  const [visited, setVisited] = useState<ReadonlySet<PhoneTabId>>(() => new Set([state.tab]));
  if (!visited.has(state.tab)) setVisited(new Set([...visited, state.tab]));
  const pageTitle = usePageStore((s) => (top?.kind === "page" ? s.pageById(top.pageId)?.title : undefined));
  const title = top?.kind === "page" ? (pageTitle || top.tab.title || "Untitled") : TAB_TITLES[state.tab];

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PhoneTopBar title={title} canGoBack={canGoBack} onBack={back} onOpenAccount={() => setAccountOpen(true)} />
      <main id="osio-main" tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden outline-none">
        {[...visited].map((id) => (
          <div key={id} inert={stack.length > 1} className={id === state.tab ? "h-full" : "hidden"}>
            <PhoneTabView tab={id} />
          </div>
        ))}
        {stack.map((entry, index) => (entry.kind === "page" ? <PhonePage key={`${entry.pageId}-${index}`} entry={entry} /> : null))}
        {leaving?.kind === "page" && <PhonePage key="leaving" entry={leaving} leaving />}
      </main>
      <PhoneTabBar active={state.tab} onSelect={switchTab} />
      <PhoneAccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
};

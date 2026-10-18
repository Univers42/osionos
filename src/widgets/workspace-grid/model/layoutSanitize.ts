// Drops persisted embed tabs that cannot load for this visitor. A layout saved
// while a surface was configured (or on a dev machine) is restored verbatim
// otherwise, reopening an iframe onto the visitor's own localhost.

import { configuredUrlFor, currentPageHostname, isReachableUrl } from "@/shared/config/appUrls";
import type { LayoutNode, WorkspaceTab } from "./layoutTree";

const EMBED_TAB_IDENTIFIER: Readonly<Record<string, string>> = {
  __mail__: "osionos.mail",
  __calendar__: "osionos.calendar",
  __whiteboard__: "osionos.whiteboard",
};

/** Whether a restored tab may stay: non-embed tabs always; embed tabs need their
 *  configured URL to be set and the stored URL to be reachable from this page. */
export function isTabRestorable(tab: WorkspaceTab, pageHostname: string): boolean {
  if (tab.kind !== "embed") return true;
  const identifier = EMBED_TAB_IDENTIFIER[tab.pageId];
  if (identifier && configuredUrlFor(identifier) === "") return false;
  return isReachableUrl(tab.url ?? "", pageHostname);
}

export function pruneUnrestorableTabs(node: LayoutNode, pageHostname = currentPageHostname()): LayoutNode {
  if (node.type === "pane") {
    const tabs = node.tabs.filter((tab) => isTabRestorable(tab, pageHostname));
    if (tabs.length === node.tabs.length) return node;
    const stillActive = tabs.some((tab) => tab.tabId === node.activeTabId);
    return { ...node, tabs, activeTabId: stillActive ? node.activeTabId : (tabs[0]?.tabId ?? null) };
  }
  return { ...node, children: node.children.map((child) => pruneUnrestorableTabs(child, pageHostname)) };
}

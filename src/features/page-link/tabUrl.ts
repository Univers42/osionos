import type { WorkspaceTab } from "@/widgets/workspace-grid/model/layoutTree";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LIVE_VIEW = new RegExp(`^(baas:${UUID}:[^#]+)(?:#.+)?$`, "i");
const PAGE_ID = new RegExp(`^${UUID}$`, "i");

/** What a URL hash asks to open. */
export type TabTarget =
  | { kind: "database"; databaseId: string; viewId: string; title: string }
  | { kind: "page"; pageId: string; workspaceId: string | null };

/** The hash naming a tab: empty for a surface that has no address of its own. */
export function hashForTab(tab: WorkspaceTab | null | undefined): string {
  if (tab?.kind === "database") {
    const params = new URLSearchParams({ source: "adapter", view: tab.viewId ?? tab.pageId });
    return `#${params.toString()}`;
  }
  if (tab?.kind === "page" && PAGE_ID.test(tab.pageId)) {
    const params = new URLSearchParams({ page: tab.pageId });
    if (tab.workspaceId) params.set("ws", tab.workspaceId);
    return `#${params.toString()}`;
  }
  return "";
}

/** What `hash` names, or null. A `view` that is not a live database (the home dashboards)
 *  opens nothing: that surface comes back with the restored layout. */
export function tabTargetFromHash(hash: string): TabTarget | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const pageId = params.get("page");
  if (pageId && PAGE_ID.test(pageId)) {
    const workspaceId = params.get("ws");
    return { kind: "page", pageId, workspaceId: workspaceId && PAGE_ID.test(workspaceId) ? workspaceId : null };
  }
  const view = params.get("view");
  const live = view ? LIVE_VIEW.exec(view) : null;
  if (!view || !live) return null;
  return { kind: "database", databaseId: live[1], viewId: view, title: live[1].split(":").pop() ?? "Database" };
}

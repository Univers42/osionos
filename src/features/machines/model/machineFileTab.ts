// A file from a folder on this computer, as a tab. The key is opaque: the path lives on the node's
// own page, and the tab holds only what the app may know, the base name.
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { genId } from "@/widgets/workspace-grid/model/layoutTree";

const UNSAVED_MARK = "● ";
const tabPageId = (key: string): string => `machine-file:${key}`;

export function openMachineFile(key: string, title: string): void {
  useWorkspaceLayout.getState().openTab({ tabId: genId("tab"), pageId: tabPageId(key), workspaceId: "", kind: "machine-file", title, fileKey: key });
}

export function markMachineFile(key: string, title: string, dirty: boolean): void {
  useWorkspaceLayout.getState().updateTabsForPage(tabPageId(key), { title: dirty ? `${UNSAVED_MARK}${title}` : title });
}

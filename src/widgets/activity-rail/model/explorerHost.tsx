import { FileText } from "lucide-react";
import React from "react";

import { explorerIconValue } from "@/features/ide/model/explorerPageIcon";
import type { ExplorerHost } from "@/features/ide/ui/explorerContext";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { useIsActivePage } from "@/store/activePageFlag";
import { useDragSession } from "@/store/dragSession";
import { usePageStore } from "@/store/usePageStore";

/** Page icon glyph: subscribes to the page's icon via a single primitive selector. */
const ExplorerPageGlyph: React.FC<{ pageId: string }> = ({ pageId }) => {
  const iconValue = usePageStore((s) => {
    const index = s.pagesIndex[pageId];
    if (!index) return undefined;
    const page = s.pages[index.workspaceId]?.[index.index];
    return page ? explorerIconValue({ icon: page.icon, databaseId: page.databaseId }) : undefined;
  });
  if (!iconValue) return <FileText size={14} />;
  return <IconValueView value={iconValue} size={14} className="shrink-0" />;
};

/** The tree inside the app: active rows, page drags and page icons come from its stores. */
export const APP_EXPLORER_HOST: ExplorerHost = {
  useIsActive: useIsActivePage,
  beginDrag: (pageId) => useDragSession.getState().beginDrag(pageId),
  endDrag: () => useDragSession.getState().endDrag(),
  PageGlyph: ExplorerPageGlyph,
};

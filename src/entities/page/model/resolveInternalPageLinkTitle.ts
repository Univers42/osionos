import { usePageStore } from "@/store/usePageStore";
import {
  getInternalPageLinkMetadata,
  type InternalPageLinkMetadata,
} from "./internalLinkMetadata";

export function resolveInternalPageLinkTitle(
  pageId: string,
): InternalPageLinkMetadata {
  return getInternalPageLinkMetadata(usePageStore.getState().pageById(pageId));
}

// When the empty-page starter shows (ADR 0064 PS19): the owner's page, a body that is
// a loaded [] over a server copy that is empty too (F12). An empty body the server has
// not answered for asks the server first; a body not loaded yet is never read as empty.

import type { PageEntry } from "@/entities/page/model/types";
import { canChangePageVisibility, type PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { isPersistedPageId } from "@/store/pageStore.helpers";
import type { ServerBody } from "@/store/sync/serverFetchedPages";

export type ShellStarterState = "offer" | "fetch" | "none";

export interface ShellStarterInput {
  page: PageEntry;
  context: PageAccessContext | null;
  /** The server copy's body when a fetch last answered; null before any answer. */
  serverBody: ServerBody | null;
  locked: boolean;
}

export function shellStarterState({ page, context, serverBody, locked }: ShellStarterInput): ShellStarterState {
  if (locked || !Array.isArray(page.content) || page.content.length > 0) return "none";
  if (!isPersistedPageId(page._id) || !canChangePageVisibility(page, context)) return "none";
  if (serverBody === null) return "fetch";
  return serverBody === "empty" ? "offer" : "none";
}

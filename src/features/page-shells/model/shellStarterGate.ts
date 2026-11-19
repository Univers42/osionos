// When the empty-page starter shows (ADR 0064 PS19): the owner's page, a body that is
// a loaded [] and that a server fetch has confirmed (F12). An unconfirmed empty body
// asks the server first; a body not loaded yet is never read as empty.

import type { PageEntry } from "@/entities/page/model/types";
import { canChangePageVisibility, type PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { isPersistedPageId } from "@/store/pageStore.helpers";

export type ShellStarterState = "offer" | "fetch" | "none";

export interface ShellStarterInput {
  page: PageEntry;
  context: PageAccessContext | null;
  serverConfirmed: boolean;
  locked: boolean;
}

export function shellStarterState({ page, context, serverConfirmed, locked }: ShellStarterInput): ShellStarterState {
  if (locked || !Array.isArray(page.content) || page.content.length > 0) return "none";
  if (!isPersistedPageId(page._id) || !canChangePageVisibility(page, context)) return "none";
  return serverConfirmed ? "offer" : "fetch";
}

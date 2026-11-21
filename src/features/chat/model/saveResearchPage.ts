/**
 * "Save as page" on a finished research answer (C409): the reader's click is
 * the consent, so there is no approval card and no server write of the
 * assistant's. The page is created through the app's normal page path, under
 * the reader's own session, in their private space, then opened.
 */

import { useUserStore } from "@/features/auth/model/useUserStore";
import { parseMarkdownClipboard } from "@/services/page-actions/blockClipboardSerialize";
import { usePageStore } from "@/store/usePageStore";
import { captureOpenOrigin, openCreatedPage } from "@/widgets/workspace-grid/model/createdPageOpen";
import type { ChatMessagePart } from "./chatTypes";
import { citationsFromParts } from "./citations";
import { researchPage } from "./researchParts";

export type SaveResearchResult = { ok: true } | { ok: false; words: string };

export async function saveResearchPage(input: {
  report: string;
  question: string | null;
  parts: ChatMessagePart[] | undefined;
}): Promise<SaveResearchResult> {
  const user = useUserStore.getState();
  const workspace = user.activeSession()?.privateWorkspaces[0];
  if (!workspace) return { ok: false, words: "There is no private space to save the page in." };
  const { title, markdown } = researchPage(input.report, input.question, citationsFromParts(input.parts));
  const pages = usePageStore.getState();
  const origin = captureOpenOrigin();
  const page = await pages
    .addPage(workspace._id, title, user.activePageJwt() ?? "", undefined, { content: parseMarkdownClipboard(markdown) })
    .catch(() => null);
  if (!page) return { ok: false, words: "Could not create the page." };
  openCreatedPage({ id: page._id, workspaceId: workspace._id, kind: "page", title: page.title }, origin);
  return { ok: true };
}

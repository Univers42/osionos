import type { IssueRow } from "@/features/issues/api/issuesApi";

/**
 * osionos#233 D233-8: the screenshot link the issues panel shows. The bridge signs it in the
 * issues GET (`screenshot_url`) once MEDIA_URL_SECRET is set; until then the bare path, as before.
 * A signed link is used only when it is the row's own path, so a mismatched answer falls back.
 */
export function issueScreenshotSrc(row: Pick<IssueRow, "screenshot_path" | "screenshot_url">, apiBase: string): string | null {
  const path = row.screenshot_path;
  if (!path) return null;
  const signed = row.screenshot_url;
  return `${apiBase}${typeof signed === "string" && signed.startsWith(`${path}?`) ? signed : path}`;
}

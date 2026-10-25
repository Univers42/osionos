/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   githubIssueUrl.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { IssueRow } from "@/features/issues/api/issuesApi";

/**
 * What a prefilled GitHub issue may carry (devil C222): the report's own text,
 * the kind of screen, the app version, the browser and the attached errors.
 * Never the screenshot's URL, a page id or title, or the workspace: the
 * issue is public, the report is not.
 */
export type GithubIssueReport = Pick<IssueRow, "id" | "title" | "body" | "route_kind" | "app_version" | "user_agent" | "errors" | "screenshot_path">;

/** GitHub refuses a longer new-issue URL with a 414. */
const MAX_URL = 8000;

function buildBody(report: GithubIssueReport, description: string, errors: readonly string[]): string {
  const lines = [description, "", `Route: ${report.route_kind}`, `App version: ${report.app_version ?? ""}`, `Browser: ${report.user_agent ?? ""}`];
  if (errors.length > 0) lines.push("", "```", ...errors, "```");
  if (report.screenshot_path) lines.push("", `Screenshot: attached in osionos (report ${report.id})`);
  return lines.join("\n");
}

export function buildGithubIssueUrl(report: GithubIssueReport, repo = "Univers42/osionos"): string {
  const makeUrl = (description: string, errors: readonly string[]) => {
    const params = new URLSearchParams({ title: report.title || "Issue report", body: buildBody(report, description, errors) });
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
  };

  // Drop errors from the end first, then cut the description.
  const errors = [...report.errors];
  while (errors.length > 0 && makeUrl(report.body, errors).length > MAX_URL) errors.pop();
  if (makeUrl(report.body, errors).length <= MAX_URL) return makeUrl(report.body, errors);

  // The largest prefix of the description that fits with its ellipsis.
  let lo = 0;
  let hi = report.body.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (makeUrl(`${report.body.slice(0, mid)}…`, errors).length <= MAX_URL) lo = mid;
    else hi = mid - 1;
  }
  return makeUrl(`${report.body.slice(0, lo)}…`, errors);
}

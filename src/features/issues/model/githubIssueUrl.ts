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

export interface GithubIssueReport {
  id?: string;
  title?: string;
  body?: string;
  description?: string;
  route_kind?: string;
  routeKind?: string;
  app_version?: string | null;
  appVersion?: string | null;
  user_agent?: string | null;
  userAgent?: string | null;
  errors?: readonly string[] | null;
  screenshot_path?: string | null;
  screenshotPath?: string | null;
}

export interface BuildGithubIssueUrlOptions {
  repo?: string;
}

const MAX_URL = 8000;

function field(report: GithubIssueReport, ...keys: string[]): string {
  for (const key of keys) {
    const value = (report as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

function buildBody(description: string, routeKind: string, appVersion: string, userAgent: string, errors: string[], hasScreenshot: boolean, id: string): string {
  const lines: string[] = [description, "", `Route: ${routeKind}`, `App version: ${appVersion}`, `Browser: ${userAgent}`];
  if (errors.length > 0) {
    lines.push("", "```", ...errors, "```");
  }
  if (hasScreenshot && id) {
    lines.push("", `Screenshot: attached in osionos (report ${id})`);
  }
  return lines.join("\n");
}

export function buildGithubIssueUrl(report: GithubIssueReport, options: BuildGithubIssueUrlOptions = {}): string {
  const repo = options.repo ?? "Univers42/osionos";
  const title = field(report, "title") || "Issue report";
  const id = field(report, "id");
  const routeKind = field(report, "route_kind", "routeKind") || "other";
  const appVersion = field(report, "app_version", "appVersion");
  const userAgent = field(report, "user_agent", "userAgent");
  const hasScreenshot = Boolean(field(report, "screenshot_path", "screenshotPath"));
  const description = field(report, "body", "description");

  const errors = Array.isArray(report.errors) ? [...report.errors].map(String) : [];

  const makeUrl = (desc: string, errs: string[]) => {
    const body = buildBody(desc, routeKind, appVersion, userAgent, errs, hasScreenshot, id);
    const params = new URLSearchParams();
    params.set("title", title);
    params.set("body", body);
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
  };

  // Drop errors from the end first.
  while (errors.length > 0 && makeUrl(description, errors).length > MAX_URL) {
    errors.pop();
  }

  let desc = description;
  if (makeUrl(desc, errors).length > MAX_URL) {
    // Binary search the largest prefix that fits, with the ellipsis.
    let lo = 0;
    let hi = desc.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (makeUrl(desc.slice(0, mid) + "…", errors).length <= MAX_URL) lo = mid;
      else hi = mid - 1;
    }
    desc = lo >= desc.length ? desc : desc.slice(0, lo) + (lo < desc.length ? "…" : "");
  }

  return makeUrl(desc, errors);
}

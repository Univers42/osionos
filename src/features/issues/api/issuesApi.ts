/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   issuesApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";

export type RouteKind = "page" | "database" | "chat" | "settings" | "admin" | "other";
export type IssueStatus = "open" | "triaged" | "sent" | "closed";

/** A report as the bridge returns it: the table row, plus the reporter's name for staff. */
export interface IssueRow {
  id: string;
  workspace_id: string | null;
  reporter_id: string;
  title: string;
  body: string;
  route_kind: RouteKind;
  app_version: string | null;
  user_agent: string | null;
  errors: string[];
  screenshot_path: string | null;
  status: IssueStatus;
  github_url: string | null;
  created_at: string;
  updated_at: string;
  reporterName?: string | null;
}

export interface CreateIssueInput {
  title: string;
  body: string;
  routeKind: RouteKind;
  appVersion?: string;
  userAgent?: string;
  errors?: string[];
  screenshotPath?: string;
  workspaceId?: string;
}

export interface ListIssuesInput {
  scope: "mine" | "all";
  status?: string;
  before?: string;
  limit?: number;
}

export interface UpdateIssueInput {
  status?: IssueStatus;
  githubUrl?: string;
}

// The shared client refreshes an expired session and reports a revoked one; a raw fetch would not.
const jwt = () => getActivePageJwt() ?? undefined;

export function createIssue(input: CreateIssueInput): Promise<{ ok: true; issue: IssueRow }> {
  return api.post("/api/issues", input, jwt());
}

export function listIssues(input: ListIssuesInput): Promise<{ ok: true; issues: IssueRow[] }> {
  const params = new URLSearchParams({ scope: input.scope });
  if (input.status) params.set("status", input.status);
  if (input.before) params.set("before", input.before);
  if (input.limit) params.set("limit", String(input.limit));
  return api.get(`/api/issues?${params.toString()}`, jwt());
}

export function updateIssue(id: string, input: UpdateIssueInput): Promise<{ ok: true; issue: IssueRow }> {
  return api.patch(`/api/issues/${encodeURIComponent(id)}`, input, jwt());
}

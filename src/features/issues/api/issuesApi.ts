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

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { ApiError } from "@/shared/api/client";

export type RouteKind = "page" | "database" | "chat" | "settings" | "admin" | "other";
export type IssueStatus = "open" | "triaged" | "sent" | "closed";

export interface IssueRow {
  id: string;
  workspace_id?: string;
  workspaceId?: string;
  title: string;
  body: string;
  route_kind?: RouteKind;
  routeKind?: RouteKind;
  app_version?: string | null;
  appVersion?: string | null;
  user_agent?: string | null;
  userAgent?: string | null;
  errors?: string[] | null;
  screenshot_path?: string | null;
  screenshotPath?: string | null;
  status: IssueStatus | string;
  github_url?: string | null;
  githubUrl?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  reporter_id?: string;
  reporterId?: string;
  reporterName?: string | null;
}

export interface CreateIssueInput {
  title: string;
  body: string;
  routeKind: RouteKind | string;
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
  status?: IssueStatus | string;
  githubUrl?: string;
}

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getActivePageJwt();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const errorBody = (body ?? {}) as { code?: unknown; error?: unknown; message?: unknown };
    const code = errorBody.code ?? errorBody.error ?? "API_ERROR";
    const message = errorBody.message ?? errorBody.error ?? response.statusText;
    throw new ApiError(String(message), response.status, String(code), body);
  }
  return body as T;
}

export async function createIssue(input: CreateIssueInput): Promise<{ ok: true; issue: IssueRow }> {
  return request<{ ok: true; issue: IssueRow }>("/api/issues", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listIssues(input: ListIssuesInput): Promise<{ ok: true; issues: IssueRow[] }> {
  const params = new URLSearchParams();
  params.set("scope", input.scope);
  if (input.status) params.set("status", input.status);
  if (input.before) params.set("before", input.before);
  if (input.limit) params.set("limit", String(input.limit));
  return request<{ ok: true; issues: IssueRow[] }>(`/api/issues?${params.toString()}`);
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<{ ok: true; issue: IssueRow }> {
  return request<{ ok: true; issue: IssueRow }>(`/api/issues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

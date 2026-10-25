/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IssuesPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { useIsAdmin } from "@/features/auth/model/useIsAdmin";
import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";
import { listIssues, updateIssue, type IssueRow } from "@/features/issues/api/issuesApi";
import { buildGithubIssueUrl } from "@/features/issues/model/githubIssueUrl";
import { API_BASE } from "@/shared/api/client";

const GITHUB_URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/[0-9]+$/;
const STATUSES = ["", "open", "triaged", "sent", "closed"] as const;

function field(row: IssueRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

export const IssuesPanel: React.FC = () => {
  const isAdmin = useIsAdmin();
  const openReport = useIssueReportRequest((state) => state.open);

  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubError, setGithubError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveScope = isAdmin ? scope : "mine";

  const load = async (before?: string, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listIssues({ scope: effectiveScope, status: status || undefined, before, limit: 50 });
      const rows = Array.isArray(result?.issues) ? result.issues : [];
      setIssues((previous) => (append ? [...previous, ...rows] : rows));
      if (!append && rows.length > 0) setSelectedId(rows[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope, status]);

  const selected = issues.find((row) => row.id === selectedId) ?? null;

  const openGithub = () => {
    if (!selected) return;
    const url = buildGithubIssueUrl(selected);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const linkGithub = async () => {
    if (!selected) return;
    if (!GITHUB_URL_RE.test(githubUrl)) {
      setGithubError("That does not look like a GitHub issue URL.");
      return;
    }
    setBusy(true);
    setGithubError(null);
    try {
      const result = await updateIssue(selected.id, { status: "sent", githubUrl });
      const updated = result?.issue;
      if (updated) {
        setIssues((previous) => previous.map((row) => (row.id === selected.id ? updated : row)));
      }
      setGithubUrl("");
    } catch (linkError) {
      setGithubError(linkError instanceof Error ? linkError.message : "Could not link the issue.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (nextStatus: string) => {
    if (!selected || !isAdmin) return;
    try {
      const result = await updateIssue(selected.id, { status: nextStatus });
      const updated = result?.issue;
      if (updated) {
        setIssues((previous) => previous.map((row) => (row.id === selected.id ? updated : row)));
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not update the status.");
    }
  };

  const lastCreatedAt = issues.length > 0 ? field(issues[issues.length - 1], "created_at", "createdAt") : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] px-3 py-2">
        <h2 className="text-sm font-medium">Issues</h2>
        <button type="button" onClick={() => openReport({ title: "", description: "" })} aria-label="Report an issue" className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)]">
          Report an issue
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--osio-border-default)] px-3 py-2">
        {isAdmin ? (
          <div className="inline-flex rounded-md border border-[var(--osio-border-default)]">
            <button type="button" onClick={() => setScope("mine")} aria-pressed={effectiveScope === "mine"} className={`px-3 py-1 text-sm ${effectiveScope === "mine" ? "bg-[var(--osio-bg-hover)]" : ""}`}>
              Mine
            </button>
            <button type="button" onClick={() => setScope("all")} aria-pressed={effectiveScope === "all"} className={`px-3 py-1 text-sm ${effectiveScope === "all" ? "bg-[var(--osio-bg-hover)]" : ""}`}>
              All
            </button>
          </div>
        ) : null}

        <select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm">
          {STATUSES.map((value) => (
            <option key={value || "all"} value={value}>
              {value ? value : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-1/2 overflow-auto border-r border-[var(--osio-border-default)]">
          {loading && issues.length === 0 ? <p className="p-3 text-sm">Loading…</p> : null}
          {!loading && issues.length === 0 ? (
            <p className="p-3 text-sm">{status ? "Nothing matches this filter." : "No reports yet."}</p>
          ) : null}
          {issues.map((row) => {
            const rowStatus = field(row, "status");
            const rowTitle = field(row, "title");
            const reporter = field(row, "reporterName");
            const created = field(row, "created_at", "createdAt");
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`flex w-full flex-col items-start gap-1 border-b border-[var(--osio-border-default)] px-3 py-2 text-left ${selectedId === row.id ? "bg-[var(--osio-bg-hover)]" : ""}`}
              >
                <span className="text-sm font-medium">{rowTitle}</span>
                <span className="flex items-center gap-2 text-xs text-[var(--osio-fg-subtle)]">
                  <span className="rounded-full border px-2 py-0.5">{rowStatus}</span>
                  <span>{relativeDate(created)}</span>
                  {isAdmin && reporter ? <span>{reporter}</span> : null}
                </span>
              </button>
            );
          })}
          {issues.length > 0 ? (
            <button type="button" onClick={() => void load(lastCreatedAt, true)} disabled={loading} className="m-3 rounded-md border px-3 py-1.5 text-sm">
              Load more
            </button>
          ) : null}
        </div>

        <div className="w-1/2 overflow-auto p-3">
          {!selected ? <p className="text-sm">Select a report.</p> : null}
          {selected ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{field(selected, "title")}</h3>
              <p className="text-xs text-[var(--osio-fg-subtle)]">
                {field(selected, "status")} · {relativeDate(field(selected, "created_at", "createdAt"))}
                {isAdmin && field(selected, "reporterName") ? ` · ${field(selected, "reporterName")}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm">{field(selected, "body")}</p>
              <p className="text-xs text-[var(--osio-fg-subtle)]">Route: {field(selected, "route_kind", "routeKind")}</p>
              <p className="text-xs text-[var(--osio-fg-subtle)]">Browser: {field(selected, "user_agent", "userAgent")}</p>
              {Array.isArray(selected.errors) && selected.errors.length > 0 ? (
                <pre className="max-h-40 overflow-auto rounded-md border p-2 text-xs">{selected.errors.join("\n")}</pre>
              ) : null}
              {field(selected, "screenshot_path", "screenshotPath") ? (
                <div className="flex flex-col gap-2">
                  <img
                    src={`${API_BASE}${field(selected, "screenshot_path", "screenshotPath")}`}
                    alt="Screenshot attached to the report"
                    className="max-h-64 rounded-md border"
                  />
                  <a href={`${API_BASE}${field(selected, "screenshot_path", "screenshotPath")}`} download className="text-sm text-[var(--osio-accent)]">
                    Download screenshot
                  </a>
                </div>
              ) : null}

              {isAdmin ? (
                <div className="flex flex-col gap-2 border-t border-[var(--osio-border-default)] pt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span>Status</span>
                    <select
                      aria-label="Status"
                      value={field(selected, "status")}
                      onChange={(event) => void changeStatus(event.target.value)}
                      className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm"
                    >
                      {["open", "triaged", "sent", "closed"].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={openGithub} aria-label="Open GitHub issue" className="rounded-md border px-3 py-1.5 text-sm">
                    Open GitHub issue
                  </button>
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={githubUrl}
                      onChange={(event) => setGithubUrl(event.target.value)}
                      placeholder="https://github.com/owner/repo/issues/123"
                      aria-label="Link GitHub issue"
                      className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm"
                    />
                    <button type="button" onClick={() => void linkGithub()} disabled={busy} aria-label="Save GitHub link" className="rounded-md border px-3 py-1.5 text-sm">
                      Link GitHub issue
                    </button>
                    {githubError ? <span className="text-xs text-red-600">{githubError}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="border-t border-[var(--osio-border-default)] px-3 py-2 text-sm text-red-600">{error}</div> : null}
    </div>
  );
};

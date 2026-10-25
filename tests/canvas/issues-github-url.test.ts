/**
 * The prefilled GitHub issue (devil C222): the issue is public and the report
 * is not, so the URL carries the report's own text, the kind of screen, the
 * version, the browser and the errors, and never the screenshot's URL, the
 * workspace or the reporter; it stays under GitHub's URL limit.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { IssueRow } from "@/features/issues/api/issuesApi";
import { buildGithubIssueUrl } from "@/features/issues/model/githubIssueUrl";

const SCREENSHOT = "/api/media/uploads/11111111-1111-4111-8111-111111111111/" + "ab".repeat(32) + ".png";

function row(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    id: "report-1",
    workspace_id: "99999999-9999-4999-8999-999999999999",
    reporter_id: "11111111-1111-4111-8111-111111111111",
    title: "Broken",
    body: "The page is blank.",
    route_kind: "page",
    app_version: "1.2.3",
    user_agent: "Mozilla/5.0",
    errors: ["boom"],
    screenshot_path: SCREENSHOT,
    status: "open",
    github_url: null,
    created_at: "2026-10-25T20:00:00Z",
    updated_at: "2026-10-25T20:00:00Z",
    reporterName: "Alice Private",
    ...overrides,
  };
}

test("the issue says a screenshot exists, never where it is, nor whose workspace", () => {
  const url = buildGithubIssueUrl(row());
  const body = new URL(url).searchParams.get("body") ?? "";
  assert.match(body, /Screenshot: attached in osionos \(report report-1\)/);
  assert.match(body, /Route: page/);
  for (const secret of ["/api/media/", "99999999-9999", "11111111-1111", "Alice Private"]) {
    assert.ok(!url.includes(encodeURIComponent(secret)) && !body.includes(secret), secret);
  }
});

test("errors are dropped from the end before the description is touched", () => {
  const errors = Array.from({ length: 20 }, (_, i) => `${"E".repeat(500)}#${i}`);
  const url = buildGithubIssueUrl(row({ body: "D".repeat(4000), errors }));
  assert.ok(url.length <= 8000, `url length ${url.length}`);
  const body = new URL(url).searchParams.get("body") ?? "";
  assert.ok(body.startsWith(`${"D".repeat(4000)}\n`), "the description is whole");
  assert.ok(body.includes("#0") && !body.includes("#19"));
});

test("a description too long even alone is cut with an ellipsis, under 8000", () => {
  // "€" encodes to 9 characters: 4000 of them are 36 000 in the URL.
  const url = buildGithubIssueUrl(row({ body: "€".repeat(4000), errors: [] }));
  assert.ok(url.length <= 8000, `url length ${url.length}`);
  const body = new URL(url).searchParams.get("body") ?? "";
  assert.match(body, /^€+…\n/);
});

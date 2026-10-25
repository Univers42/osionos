import assert from "node:assert/strict";
import test from "node:test";

import { buildGithubIssueUrl } from "@/features/issues/model/githubIssueUrl";

test("buildGithubIssueUrl omits secret-ish context", () => {
  const url = buildGithubIssueUrl({
    id: "report-1",
    title: "Broken",
    body: "The page is blank.",
    route_kind: "page",
    app_version: "1.2.3",
    user_agent: "Mozilla/5.0",
    screenshot_path: "/api/media/uploads/user/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png",
    errors: ["boom"],
  } as any);
  assert.ok(!url.includes("/api/media/"));
  const body = new URL(url).searchParams.get("body") ?? "";
  assert.ok(!body.includes("/api/media/"));
  assert.match(body, /Screenshot: attached in osionos \(report report-1\)/);
});

test("buildGithubIssueUrl stays under 8000 chars with huge input", () => {
  const errors = Array.from({ length: 20 }, (_, i) => "E".repeat(500) + i);
  const url = buildGithubIssueUrl({
    id: "report-2",
    title: "Broken",
    body: "D".repeat(4000),
    route_kind: "page",
    app_version: "1.2.3",
    user_agent: "Mozilla/5.0",
    errors,
  });
  assert.ok(url.length < 8000, `url length ${url.length}`);
});

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";


test("dialog markup contains the staff preview line", async () => {
  const { ReportIssueDialog } = await import("@/features/issues/ui/ReportIssueDialog");
  const html = renderToStaticMarkup(React.createElement(ReportIssueDialog, { open: true }));
  assert.match(html, /Sent to osionos staff/);
});

test("a 6 MB file and an svg file are refused", async () => {
  const { validateScreenshotFile } = await import("@/features/issues/ui/ReportIssueDialog");
  assert.equal(validateScreenshotFile({ size: 6 * 1024 * 1024, type: "image/png" }).ok, false);
  assert.equal(validateScreenshotFile({ size: 1000, type: "image/svg+xml" }).ok, false);
});

test("opening the dialog does not call getDisplayMedia", async () => {
  let called = false;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getDisplayMedia: async () => { called = true; return {} as any; } } },
    configurable: true,
    writable: true,
  });
  const { ReportIssueDialog } = await import("@/features/issues/ui/ReportIssueDialog");
  renderToStaticMarkup(React.createElement(ReportIssueDialog, { open: true }));
  assert.equal(called, false);
});

// Server rendering reads a store's initial state, so the request is checked in the
// store and the fields through the props the host passes from it.
test("a prefilled request reaches the store, and its fields fill the dialog", async () => {
  const { useIssueReportRequest } = await import("@/features/issues/model/issueReportRequest");
  useIssueReportRequest.getState().open({ title: "Blank page", description: "Stays white." });
  assert.deepEqual(useIssueReportRequest.getState().request, { title: "Blank page", description: "Stays white." });
  const { ReportIssueDialog } = await import("@/features/issues/ui/ReportIssueDialog");
  const html = renderToStaticMarkup(React.createElement(ReportIssueDialog, { open: true, title: "Blank page", description: "Stays white." }));
  assert.match(html, /Blank page/);
  assert.match(html, /Stays white\./);
});

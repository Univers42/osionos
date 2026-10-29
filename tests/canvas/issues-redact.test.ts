import assert from "node:assert/strict";
import test from "node:test";

import { redactIssueText } from "@/features/issues/model/redact";

test("redactIssueText redacts the bridge test's shapes", () => {
  const t = redactIssueText("tok eyJaaa.bbb.ccc end Authorization: Bearer abc.def ?token=s3cr3t&x=1 me@example.com");
  assert.match(t, /\[jwt\]/);
  assert.match(t, /Bearer \[redacted\]/);
  assert.match(t, /token=\[redacted\]/);
  assert.match(t, /\[email\]/);
  assert.equal(redactIssueText("plain text"), "plain text");
});

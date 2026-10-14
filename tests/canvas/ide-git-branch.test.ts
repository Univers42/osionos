/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-git-branch.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { parseGitBranch, parseGitStatus } from "../../src/features/ide/model/gitBranch.ts";

test("parseGitBranch: ## main", () => {
  const result = parseGitBranch("## main\n");
  assert.strictEqual(result.branch, "main");
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: ## main...origin/main", () => {
  const result = parseGitBranch("## main...origin/main\n");
  assert.strictEqual(result.branch, "main");
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: ## main...origin/main [ahead 2, behind 1]", () => {
  const result = parseGitBranch("## main...origin/main [ahead 2, behind 1]\n");
  assert.strictEqual(result.branch, "main");
  assert.strictEqual(result.ahead, 2);
  assert.strictEqual(result.behind, 1);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: ## feat/x...origin/feat/x [behind 3]", () => {
  const result = parseGitBranch("## feat/x...origin/feat/x [behind 3]\n");
  assert.strictEqual(result.branch, "feat/x");
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 3);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: ## No commits yet on main", () => {
  const result = parseGitBranch("## No commits yet on main\n");
  assert.strictEqual(result.branch, "main");
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: ## HEAD (no branch)", () => {
  const result = parseGitBranch("## HEAD (no branch)\n");
  assert.strictEqual(result.branch, null);
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, true);
});

test("parseGitBranch: empty output", () => {
  const result = parseGitBranch("");
  assert.strictEqual(result.branch, null);
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, false);
});

test("parseGitBranch: CRLF line ending", () => {
  const result = parseGitBranch("## main\r\n");
  assert.strictEqual(result.branch, "main");
  assert.strictEqual(result.ahead, 0);
  assert.strictEqual(result.behind, 0);
  assert.strictEqual(result.detached, false);
});

test("parseGitStatus: skips ## header line", () => {
  const output = "## main\n M src/index.ts\n";
  const result = parseGitStatus(output);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].code, " M");
  assert.strictEqual(result[0].path, "src/index.ts");
});

test("parseGitStatus: only header, no files", () => {
  const output = "## main\n";
  const result = parseGitStatus(output);
  assert.strictEqual(result.length, 0);
});
test("parseGitBranch: ahead only, gone upstream, no commits with an upstream", () => {
  assert.deepEqual(parseGitBranch("## main...origin/main [ahead 2]"), { branch: "main", ahead: 2, behind: 0, detached: false });
  assert.deepEqual(parseGitBranch("## topic...origin/topic [gone]\r\n M a.ts"), { branch: "topic", ahead: 0, behind: 0, detached: false });
  assert.deepEqual(parseGitBranch("## No commits yet on dev...origin/dev"), { branch: "dev", ahead: 0, behind: 0, detached: false });
});

test("parseGitBranch reads only the first line: a later '## ' line is not a header", () => {
  assert.deepEqual(parseGitBranch(" M a.ts\n## main"), { branch: null, ahead: 0, behind: 0, detached: false });
});

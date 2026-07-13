/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   referenceSource.cjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Materializes a past git ref's copy of this directory into a temp folder,
// purely via `git ls-tree`/`git show` (no worktree, no tar) so a benchmark
// A/B guard can bundle+run the reference commit's source in the same process
// as HEAD's — see abGuard.cjs and reference.json.

const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, dirname, relative, sep } = require("node:path");

const MARKENGINE_ROOT = join(__dirname, "..");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function repoRoot() {
  return git(["rev-parse", "--show-toplevel"], MARKENGINE_ROOT).trim();
}

function listFilesAtRef(ref, root, relPath) {
  const output = git(["ls-tree", "-r", "--name-only", ref, "--", relPath], root);
  return output.split("\n").filter(Boolean);
}

function materializeRef(ref) {
  const root = repoRoot();
  const relPath = relative(root, MARKENGINE_ROOT).split(sep).join("/");
  const files = listFilesAtRef(ref, root, relPath);
  if (files.length === 0) {
    throw new Error(
      `reference ref "${ref}" has no files under ${relPath} — is it a valid, reachable commit?`,
    );
  }

  const destDir = mkdtempSync(join(tmpdir(), "markengine-reference-"));
  for (const file of files) {
    const content = git(["show", `${ref}:${file}`], root);
    const destPath = join(destDir, relative(relPath, file));
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, content);
  }

  return {
    dir: destDir,
    cleanup() {
      rmSync(destDir, { recursive: true, force: true });
    },
  };
}

module.exports = { materializeRef };
